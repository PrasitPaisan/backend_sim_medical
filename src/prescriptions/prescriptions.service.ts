import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  buildNzp360Headers,
  buildSoapContentType,
  escapeXml,
  getMachineTarget,
  parseMachineResult,
  unescapeXmlEntities,
} from '../common/soap.util';
import { createPool } from '../common/db.util';
import { BasketsService } from '../baskets/baskets.service';

// Both RB1500's SendPrescription (<root> with sibling <prescription> blocks)
// and NZP360's SendPrescription (<DocumentElement> with sibling <PatientInfo>
// blocks) accept multiple patients in one call — capped here since each
// machine only returns one overall result per call (no per-item breakdown),
// so a bigger batch means a bigger all-or-nothing blast radius if rejected.
const MAX_MACHINE_BATCH_SIZE = 50;

function isCobotPrescription(prescription: any): boolean {
  return (
    Array.isArray(prescription?.details) &&
    prescription.details.some(
      (detail: any) => detail?.dispense_type === 'cobot',
    )
  );
}

// The physical COBOT station can't dispense two baskets back-to-back — but
// this backend only ever learns a basket cleared a station *after the fact*
// (advance-station), and stations can be skipped, so there's no reliable way
// to detect "a basket is about to reach COBOT" ahead of time. The one lever
// we do fully control is dispatch order: spreading cobot-dispensing
// prescriptions evenly across a batch (rather than sending them consecutive
// or clustered) means several other prescriptions are physically processed
// on the conveyor between any two cobot ones, giving COBOT time to clear.
// This only spaces things out *within one dispatch call* — it has no memory
// of a cobot basket still in flight from an earlier, separate send.
function interleaveCobotPrescriptions(prescriptions: any[]): any[] {
  const cobotItems = prescriptions.filter(isCobotPrescription);
  if (cobotItems.length === 0) return prescriptions;

  const otherItems = prescriptions.filter(
    (prescription) => !isCobotPrescription(prescription),
  );

  const n = prescriptions.length;
  const c = cobotItems.length;
  const result: any[] = new Array(n).fill(undefined);

  // Evenly spread target positions, e.g. 2 cobot items among 20 total land
  // at (1-indexed) positions 10 and 20 — round(i * n / c) for i = 1..c.
  const usedPositions = new Set<number>();
  cobotItems.forEach((item, i) => {
    let pos = Math.round(((i + 1) * n) / c) - 1; // 0-indexed
    pos = Math.max(0, Math.min(n - 1, pos));
    while (usedPositions.has(pos) && pos < n - 1) pos++;
    usedPositions.add(pos);
    result[pos] = item;
  });

  let otherIndex = 0;
  for (let i = 0; i < n; i++) {
    if (result[i] === undefined) {
      result[i] = otherItems[otherIndex++];
    }
  }

  return result;
}

@Injectable()
export class PrescriptionsService implements OnModuleDestroy {
  private pool: Pool;

  constructor(
    private config: ConfigService,
    private basketsService: BasketsService,
  ) {
    this.pool = createPool(this.config);
  }
  // ------------------------------------
  //   DB Prescription
  // ------------------------------------

  // pre_state now only has 3 meanings: -1 received, 0 in progress, 1 complete.
  // Station-level progress lives on the bound basket (see findInProgress).
  //
  // Paginated rather than a single capped LIMIT — Prescription Managements
  // can realistically hold thousands of received prescriptions, and loading/
  // rendering all of them at once is what makes that page feel slow (see
  // findIds below for the companion bulk-select endpoint). COUNT(*) OVER()
  // is evaluated after GROUP BY but before LIMIT/OFFSET, so it reports the
  // total prescription count unaffected by pagination — one round trip
  // instead of a separate COUNT query.
  async findAll(page = 1, pageSize = 50) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(200, Math.max(1, pageSize));
    const offset = (safePage - 1) * safePageSize;

    const res = await this.pool.query(
      `
        SELECT
          ph.id,
          ph.mzno,
          ph.patientname,
          ph.patientage,
          ph.patientsex,
          ph.prescriptionhisid,
          ph.prescriptiondoctorname,
          ph.departmentname,
          ph.fetchwindow,
          ph.pre_state,
          ph.created_at,
          ph.updated_at,
          ph.patientbirthday,
          ph.patientvisitid,
          ph.patientbed,
          ph.doctorid,
          ph.administration,
          ph.repeatindicator,
          ph.deptcode,
          ph.nzp360_sent_at,
          ph.priority,
          COUNT(*) OVER() AS total_count,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pd.id,
                'medhisid', pd.medhisid,
                'medunit', pd.medunit,
                'medicinenum', pd.medicinenum,
                'medicineheteromorphism', pd.medicineheteromorphism,
                'medicinehint', pd.medicinehint,
                'medicinenamech', pd.medicinenamech,
                'medfactoryid', pd.medfactoryid,
                'medfactoryname', pd.medfactoryname,
                'typeunit', md.typeunit,
                'hpmtypeunit', md.hpmtypeunit,
                'dispense_type', md.dispense_type,
                'drugspec', pd.drugspec,
                'drugpycode', pd.drugpycode,
                'dosage', pd.dosage,
                'dosageunit', pd.dosageunit,
                'dosageperunit', pd.dosageperunit,
                'dispensingtime', pd.dispensingtime,
                'performtime', pd.performtime,
                'performfreqdetail', pd.performfreqdetail,
                'performfreq', pd.performfreq,
                'performfreqprint', pd.performfreqprint,
                'nursingcode', pd.nursingcode,
                'priority', pd.priority
              )
              ORDER BY pd.id
            ) FILTER (WHERE pd.id IS NOT NULL),
            '[]'
          ) AS details
        FROM prescription_header ph
        LEFT JOIN prescription_detail pd ON pd.prescription_id = ph.id
        -- "Type" lives on the medicine catalog, not the prescription line
        -- item — join it in rather than duplicating it into prescription_detail.
        LEFT JOIN medicine_dictionary md
          ON md.medicinehisid = pd.medhisid
          AND md.medicineunit = pd.medunit
          AND md.medfactoryname = pd.medfactoryname
        WHERE ph.pre_state = -1
        GROUP BY ph.id
        -- Stat order (ph.priority = 1, see frontend_sim/src/lib/orderPriority.ts)
        -- outranks everything else and floats to the top; otherwise
        -- newest-created first. Header-level priority, not the per-medicine
        -- prescription_detail.priority (different field, different scheme).
        ORDER BY (ph.priority = 1) DESC, ph.id DESC
        LIMIT $1 OFFSET $2
      `,
      [safePageSize, offset],
    );

    const total = res.rows.length > 0 ? Number(res.rows[0].total_count) : 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const items = res.rows.map(({ total_count, ...row }) => row);

    return { items, total, page: safePage, pageSize: safePageSize };
  }

  // Companion to findAll's pagination: lets the UI bulk-select "the first N"
  // prescriptions (e.g. 100 of 2000) without pulling every medicine line
  // item for rows that aren't even on the current page — same ordering as
  // findAll (Stat first, then newest) so "first N" matches what's visibly
  // at the top of the list.
  async findIds(limit = 100) {
    const safeLimit = Math.min(2000, Math.max(1, limit));

    const res = await this.pool.query(
      `
        SELECT ph.id
        FROM prescription_header ph
        WHERE ph.pre_state = -1
        ORDER BY (ph.priority = 1) DESC, ph.id DESC
        LIMIT $1
      `,
      [safeLimit],
    );

    return res.rows.map((row) => row.id as number);
  }

  // Fetches full prescription + medicine details for an arbitrary set of
  // ids, ignoring pagination — needed because "select first N" (findIds
  // above) can select prescriptions that aren't on the page currently
  // loaded in the browser, so send-batch has to backfill their full data
  // before it can build the SOAP payload.
  async findByIds(ids: number[]) {
    if (ids.length === 0) return [];

    const res = await this.pool.query(
      `
        SELECT
          ph.id,
          ph.mzno,
          ph.patientname,
          ph.patientage,
          ph.patientsex,
          ph.prescriptionhisid,
          ph.prescriptiondoctorname,
          ph.departmentname,
          ph.fetchwindow,
          ph.pre_state,
          ph.created_at,
          ph.updated_at,
          ph.patientbirthday,
          ph.patientvisitid,
          ph.patientbed,
          ph.doctorid,
          ph.administration,
          ph.repeatindicator,
          ph.deptcode,
          ph.nzp360_sent_at,
          ph.priority,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pd.id,
                'medhisid', pd.medhisid,
                'medunit', pd.medunit,
                'medicinenum', pd.medicinenum,
                'medicineheteromorphism', pd.medicineheteromorphism,
                'medicinehint', pd.medicinehint,
                'medicinenamech', pd.medicinenamech,
                'medfactoryid', pd.medfactoryid,
                'medfactoryname', pd.medfactoryname,
                'typeunit', md.typeunit,
                'hpmtypeunit', md.hpmtypeunit,
                'dispense_type', md.dispense_type,
                'drugspec', pd.drugspec,
                'drugpycode', pd.drugpycode,
                'dosage', pd.dosage,
                'dosageunit', pd.dosageunit,
                'dosageperunit', pd.dosageperunit,
                'dispensingtime', pd.dispensingtime,
                'performtime', pd.performtime,
                'performfreqdetail', pd.performfreqdetail,
                'performfreq', pd.performfreq,
                'performfreqprint', pd.performfreqprint,
                'nursingcode', pd.nursingcode,
                'priority', pd.priority
              )
              ORDER BY pd.id
            ) FILTER (WHERE pd.id IS NOT NULL),
            '[]'
          ) AS details
        FROM prescription_header ph
        LEFT JOIN prescription_detail pd ON pd.prescription_id = ph.id
        LEFT JOIN medicine_dictionary md
          ON md.medicinehisid = pd.medhisid
          AND md.medicineunit = pd.medunit
          AND md.medfactoryname = pd.medfactoryname
        WHERE ph.id = ANY($1) AND ph.pre_state = -1
        GROUP BY ph.id
      `,
      [ids],
    );

    return res.rows;
  }

  // Process Tracking's data source: prescriptions in progress (0) joined to
  // their bound basket's station_status, PLUS already-complete ones (1) so
  // pharmacists can still check them here — those no longer have a basket
  // bound once the patient has actually picked up the medicine (station 9
  // releases it back to the pool), so the join is LEFT and a missing
  // station_status is treated as that final station.
  async findInProgress(limit = 100) {
    const res = await this.pool.query(
      `
        SELECT
          ph.id,
          ph.mzno,
          ph.patientname,
          ph.patientage,
          ph.patientsex,
          ph.prescriptionhisid,
          ph.prescriptiondoctorname,
          ph.departmentname,
          ph.fetchwindow,
          ph.pre_state,
          ph.created_at,
          ph.updated_at,
          ph.patientbirthday,
          ph.patientvisitid,
          ph.patientbed,
          ph.doctorid,
          ph.administration,
          ph.repeatindicator,
          ph.deptcode,
          ph.priority,
          b.basket_id,
          COALESCE(b.station_status, CASE WHEN ph.pre_state = 1 THEN 9 ELSE 0 END) AS station_status,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pd.id,
                'medhisid', pd.medhisid,
                'medunit', pd.medunit,
                'medicinenum', pd.medicinenum,
                'medicineheteromorphism', pd.medicineheteromorphism,
                'medicinehint', pd.medicinehint,
                'medicinenamech', pd.medicinenamech,
                'medfactoryid', pd.medfactoryid,
                'medfactoryname', pd.medfactoryname,
                'typeunit', md.typeunit,
                'hpmtypeunit', md.hpmtypeunit,
                'dispense_type', md.dispense_type,
                'drugspec', pd.drugspec,
                'drugpycode', pd.drugpycode,
                'dosage', pd.dosage,
                'dosageunit', pd.dosageunit,
                'dosageperunit', pd.dosageperunit,
                'dispensingtime', pd.dispensingtime,
                'performtime', pd.performtime,
                'performfreqdetail', pd.performfreqdetail,
                'performfreq', pd.performfreq,
                'performfreqprint', pd.performfreqprint,
                'nursingcode', pd.nursingcode,
                'priority', pd.priority
              )
              ORDER BY pd.id
            ) FILTER (WHERE pd.id IS NOT NULL),
            '[]'
          ) AS details
        FROM prescription_header ph
        LEFT JOIN basket b ON b.prescription_id = ph.id
        LEFT JOIN prescription_detail pd ON pd.prescription_id = ph.id
        LEFT JOIN medicine_dictionary md
          ON md.medicinehisid = pd.medhisid
          AND md.medicineunit = pd.medunit
          AND md.medfactoryname = pd.medfactoryname
        WHERE ph.pre_state IN (0, 1)
        GROUP BY ph.id, b.basket_id, b.station_status
        ORDER BY ph.pre_state ASC, ph.updated_at DESC
        LIMIT $1
      `,
      [limit],
    );
    return res.rows;
  }
  // ------------------------------------------------

  // Monitor Queue's data source: prescriptions whose basket is sitting at
  // station_status = 8 ("call patient for pickup") — i.e. the pharmacist has
  // already called them but they haven't confirmed pickup (station 9) yet.
  // fetchwindow is the pickup counter/channel to display prominently.
  // Ordered oldest-called-first so the board reads like a real queue.
  async findCalledForPickup() {
    const res = await this.pool.query(
      `
      SELECT
        ph.prescriptionhisid,
        ph.mzno,
        ph.patientname,
        ph.fetchwindow,
        b.basket_id,
        b.updated_at AS called_at
      FROM basket b
      JOIN prescription_header ph ON ph.id = b.prescription_id
      WHERE b.station_status = 8
      ORDER BY b.updated_at ASC
      `,
    );
    return res.rows;
  }

  // Persists prescriptions coming in from the hospital HIS into prescription_header
  // (+ their medicines into prescription_detail) at pre_state = -1 ("received"), so
  // everything downstream (Machine Sim lookups, Process Tracking, send-batch) is
  // reading and writing the same rows instead of a separate in-memory queue.
  async receivePrescriptions(payload: any, source = 'pharmacy') {
    const prescriptions = Array.isArray(payload?.prescriptions)
      ? payload.prescriptions
      : Array.isArray(payload)
        ? payload
        : [payload?.prescription ?? payload];

    const validPrescriptions = prescriptions.filter(
      (item) => item && typeof item === 'object',
    );

    const client = await this.pool.connect();
    let insertedCount = 0;
    let skippedCount = 0;

    try {
      for (const prescription of validPrescriptions) {
        await client.query('BEGIN');
        try {
          const headerRes = await client.query(
            `
            INSERT INTO prescription_header
              (mzno, patientname, patientage, patientsex, prescriptionhisid, prescriptiondoctorname, prescriptionhint, departmentname, fetchwindow, pre_state,
               patientbirthday, patientvisitid, patientbed, doctorid, administration, repeatindicator, deptcode, priority)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, -1, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (prescriptionhisid) DO NOTHING
            RETURNING id
            `,
            [
              prescription?.mzno ?? '',
              prescription?.patientname ?? '',
              Number(prescription?.patientage ?? 0),
              Number(prescription?.patientsex ?? 0),
              prescription?.prescriptionhisid ?? '',
              prescription?.prescriptiondoctorname ?? null,
              prescription?.prescriptionhint ?? null,
              prescription?.departmentname ?? null,
              Number(prescription?.fetchwindow ?? 0),
              // NZP360-only fields — RB1500 never needed these, so HIS payloads
              // that don't send them just leave the column null.
              prescription?.patientbirthday ?? null,
              prescription?.patientvisitid ?? null,
              prescription?.patientbed ?? null,
              prescription?.doctorid ?? null,
              prescription?.administration ?? null,
              prescription?.repeatindicator ?? null,
              prescription?.deptcode ?? null,
              // Header-level RB1500 SendPrescription priority (0 Vending, 1
              // Stat, 2 New, 3 Discharge, 4 Continue) — distinct from each
              // medicine's own prescription_detail.priority below. Defaults
              // to New order (2) when the HIS payload doesn't specify one.
              Number(prescription?.priority ?? 2),
            ],
          );

          if (headerRes.rows.length === 0) {
            // prescriptionhisid already exists — skip rather than duplicate.
            await client.query('ROLLBACK');
            skippedCount += 1;
            continue;
          }

          const prescriptionId = headerRes.rows[0].id;
          const items: any[] = Array.isArray(prescription?.details)
            ? prescription.details
            : Array.isArray(prescription?.itmlist)
              ? prescription.itmlist
              : [];

          for (const item of items) {
            await client.query(
              `
              INSERT INTO prescription_detail
                (prescription_id, prescriptionhisid, medhisid, medunit, medicinenum, medicineheteromorphism, medicinehint, medfactoryid, medfactoryname, medicinenamech,
                 drugspec, drugpycode, dosage, dosageunit, dosageperunit, dispensingtime, performtime, performfreqdetail, performfreq, performfreqprint, nursingcode, priority)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
              `,
              [
                prescriptionId,
                prescription?.prescriptionhisid ?? '',
                item?.medhisid ?? '',
                item?.medunit ?? '',
                Number(item?.medicinenum ?? 0),
                Number(item?.medicineheteromorphism ?? 0),
                item?.medicinehint ?? null,
                item?.medfactoryid ?? null,
                item?.medfactoryname ?? '',
                item?.medicinenamech ?? '',
                // NZP360-only fields — see header insert above.
                item?.drugspec ?? null,
                item?.drugpycode ?? null,
                item?.dosage ?? null,
                item?.dosageunit ?? null,
                item?.dosageperunit ?? null,
                item?.dispensingtime ?? null,
                item?.performtime ?? null,
                item?.performfreqdetail ?? null,
                item?.performfreq ?? null,
                item?.performfreqprint ?? null,
                item?.nursingcode ?? null,
                Number(item?.priority ?? 4),
              ],
            );
          }

          await client.query('COMMIT');
          insertedCount += 1;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      client.release();
    }

    return {
      ok: true,
      received: validPrescriptions.length,
      inserted: insertedCount,
      skipped: skippedCount,
      source,
      receivedAt: new Date().toISOString(),
    };
  }

  //  ------------------------------------
  //!SECTION Send to robot methods
  //   -----------------------------------

  async receiveBatchForInspection(prescriptions: any[], destination: string) {
    // console.log('Batch inspection received:', { destination, count: prescriptions.length, prescriptions });

    return {
      ok: true,
      destination,
      count: prescriptions.length,
      message: 'Batch received by backend for inspection',
      receivedAt: new Date().toISOString(),
      prescriptions,
    };
  }

  // Binds a basket to a prescription *before* dispatching it, then sends TWO
  // SOAP calls: RB1500 always gets every medicine line item; NZP360 only
  // gets the subset with dispense_type = 'nzp360' (skipped entirely if there
  // are none — that's not a failure). The prescription only flips to
  // in-progress if RB1500 succeeded AND NZP360 succeeded-or-was-skipped;
  // otherwise the basket is released back to the pool — baskets are a
  // finite, reused physical resource, so a failed send must never leak one.
  async sendBatchToMachines(prescriptions: any[], destination: string) {
    let rb1500Target: string;
    try {
      rb1500Target = getMachineTarget(this.config, 'RB1500');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        destination,
        machineTarget: null,
        count: prescriptions.length,
        successfulCount: 0,
        message: `Unable to reach dispensing machine: ${message}`,
        sentAt: new Date().toISOString(),
        results: prescriptions.map((prescription) => ({
          id: prescription?.id,
          mzno: prescription?.mzno,
          ok: false,
          error: message,
        })),
      };
    }

    // Spread any cobot-dispensing prescriptions evenly across this batch
    // before anything else — see interleaveCobotPrescriptions for why.
    prescriptions = interleaveCobotPrescriptions(prescriptions);

    const results: Array<{
      id?: number;
      mzno?: string;
      status?: number;
      ok: boolean;
      error?: string;
    }> = [];
    let hasFailure = false;

    // Bind a basket per prescription first (still individual — baskets are a
    // per-prescription physical resource) so we know exactly which
    // prescriptions are actually eligible to go into an RB1500 batch call.
    const bound: Array<{ prescription: any; basketId: string }> = [];

    for (const prescription of prescriptions) {
      let basketId: string | null;
      try {
        basketId = await this.bindBasket(prescription?.id);
      } catch (error) {
        results.push({
          id: prescription?.id,
          mzno: prescription?.mzno,
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        hasFailure = true;
        continue;
      }

      if (!basketId) {
        results.push({
          id: prescription?.id,
          mzno: prescription?.mzno,
          ok: false,
          error: 'No basket available',
        });
        hasFailure = true;
        continue;
      }

      bound.push({ prescription, basketId });
    }

    // RB1500's SendPrescription accepts multiple sibling <prescription>
    // blocks in one <root> (same convention as SendMedicine/SendDeptInfo),
    // so batch up to MAX_MACHINE_BATCH_SIZE prescriptions into a single HTTP
    // call instead of one call each. The machine only returns one overall
    // <Result>, so a batch is all-or-nothing: if the call fails, every
    // prescription in that chunk is released and marked failed together.
    for (let i = 0; i < bound.length; i += MAX_MACHINE_BATCH_SIZE) {
      const chunk = bound.slice(i, i + MAX_MACHINE_BATCH_SIZE);

      let response: Response;
      let responseText: string;
      try {
        const xml = this.buildSoapEnvelopeForSendPrescriptionBatchRB1500(
          chunk.map((item) => item.prescription),
        );
        console.log(
          `RB1500 SendPrescription XML (batch of ${chunk.length}):`,
          xml,
        );
        response = await fetch(rb1500Target, {
          method: 'POST',
          headers: {
            'Content-Type': buildSoapContentType('SendPrescription'),
          },
          body: xml,
        });
        // The machine replies HTTP 200 even on failure — the real outcome is in the body.
        responseText = await response.text();
        console.log('RB1500 SendPrescription response:', responseText);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        for (const { prescription, basketId } of chunk) {
          await this.unbindBasket(basketId, prescription?.id);
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            ok: false,
            error: message,
          });
        }
        hasFailure = true;
        continue;
      }

      const machineResult = parseMachineResult(responseText);
      const rb1500Ok = response.ok && machineResult.success;

      if (!rb1500Ok) {
        const error = machineResult.error || `HTTP ${response.status}`;
        for (const { prescription, basketId } of chunk) {
          await this.unbindBasket(basketId, prescription?.id);
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            status: response.status,
            ok: false,
            error,
          });
        }
        hasFailure = true;
        continue;
      }

      // RB1500 accepted the whole chunk. NZP360 gets its own batched call —
      // same multi-patient-per-call convention — covering just the
      // nzp360-dispensed subset of this chunk (a chunk is already capped at
      // MAX_MACHINE_BATCH_SIZE, so its NZP360-eligible subset always fits in
      // one call too). Prescriptions with no nzp360 medicines skip straight
      // to completion; NZP360 failing here only affects this chunk's
      // nzp360-eligible prescriptions, not the whole RB1500 chunk. Anything
      // already flagged nzp360_sent_at (sent ahead of time via the standalone
      // /prescriptions/send-nzp360 flow) is treated as already-done too, so
      // this combined send never re-dispenses the same loose tablets.
      const withNzp360: Array<{
        prescription: any;
        basketId: string;
        nzp360Details: any[];
      }> = [];
      const withoutNzp360: Array<{ prescription: any; basketId: string }> = [];

      for (const item of chunk) {
        const nzp360Details = item.prescription?.nzp360_sent_at
          ? []
          : (Array.isArray(item.prescription?.details)
              ? item.prescription.details
              : []
            ).filter((detail: any) => detail?.dispense_type === 'nzp360');

        if (nzp360Details.length > 0) {
          withNzp360.push({ ...item, nzp360Details });
        } else {
          withoutNzp360.push(item);
        }
      }

      for (const { prescription, basketId } of withoutNzp360) {
        try {
          await this.pool.query(
            `UPDATE prescription_header SET pre_state = 0, updated_at = NOW() WHERE id = $1`,
            [prescription?.id],
          );
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            status: response.status,
            ok: true,
          });
        } catch (error) {
          await this.unbindBasket(basketId, prescription?.id);
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            ok: false,
            error: message,
          });
          hasFailure = true;
        }
      }

      if (withNzp360.length === 0) continue;

      let nzp360Response: Response;
      let nzp360ResponseText: string;
      try {
        const nzp360Target = getMachineTarget(this.config, 'NZP360');
        const nzp360Xml = this.buildSoapEnvelopeForSendPrescriptionBatchNZP360(
          withNzp360.map((item) => ({
            ...item.prescription,
            details: item.nzp360Details,
          })),
        );
        console.log(
          `NZP360 SendPrescription XML (batch of ${withNzp360.length}):`,
          nzp360Xml,
        );
        nzp360Response = await fetch(nzp360Target, {
          method: 'POST',
          headers: buildNzp360Headers(this.config, 'SendPrescription'),
          body: nzp360Xml,
        });
        nzp360ResponseText = await nzp360Response.text();
        console.log(
          'NZP360 SendPrescription response:',
          unescapeXmlEntities(nzp360ResponseText),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        for (const { prescription, basketId } of withNzp360) {
          await this.unbindBasket(basketId, prescription?.id);
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            ok: false,
            error: `NZP360: ${message}`,
          });
        }
        hasFailure = true;
        continue;
      }

      const nzp360MachineResult = parseMachineResult(nzp360ResponseText);
      const nzp360Ok = nzp360Response.ok && nzp360MachineResult.success;

      if (!nzp360Ok) {
        const error =
          nzp360MachineResult.error || `HTTP ${nzp360Response.status}`;
        for (const { prescription, basketId } of withNzp360) {
          await this.unbindBasket(basketId, prescription?.id);
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            ok: false,
            error: `NZP360: ${error}`,
          });
        }
        hasFailure = true;
        continue;
      }

      for (const { prescription, basketId } of withNzp360) {
        try {
          await this.pool.query(
            `UPDATE prescription_header SET pre_state = 0, nzp360_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [prescription?.id],
          );
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            status: response.status,
            ok: true,
          });
        } catch (error) {
          await this.unbindBasket(basketId, prescription?.id);
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            ok: false,
            error: message,
          });
          hasFailure = true;
        }
      }
    }

    const successfulCount = results.filter((item) => item.ok).length;

    return {
      ok: !hasFailure,
      destination,
      machineTarget: rb1500Target,
      count: prescriptions.length,
      successfulCount,
      message: hasFailure
        ? `Sent ${successfulCount}/${prescriptions.length} prescription(s)`
        : `Sent ${prescriptions.length} prescription(s) to robot`,
      sentAt: new Date().toISOString(),
      results,
    };
  }

  // Split-send counterpart to sendBatchToMachines: dispatches to RB1500 only,
  // independent of NZP360. This is what actually starts a prescription's trip
  // down the conveyor, so it still binds a basket and flips pre_state to 0 on
  // success — same as the combined flow, just without ever calling NZP360.
  // Lets a pharmacist send RB1500 before or after NZP360 in either order.
  async sendRb1500Only(prescriptions: any[]) {
    let rb1500Target: string;
    try {
      rb1500Target = getMachineTarget(this.config, 'RB1500');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        count: prescriptions.length,
        successfulCount: 0,
        message: `Unable to reach dispensing machine: ${message}`,
        sentAt: new Date().toISOString(),
        results: prescriptions.map((prescription) => ({
          id: prescription?.id,
          mzno: prescription?.mzno,
          ok: false,
          error: message,
        })),
      };
    }

    prescriptions = interleaveCobotPrescriptions(prescriptions);

    const results: Array<{
      id?: number;
      mzno?: string;
      status?: number;
      ok: boolean;
      error?: string;
    }> = [];
    let hasFailure = false;

    const bound: Array<{ prescription: any; basketId: string }> = [];

    for (const prescription of prescriptions) {
      let basketId: string | null;
      try {
        basketId = await this.bindBasket(prescription?.id);
      } catch (error) {
        results.push({
          id: prescription?.id,
          mzno: prescription?.mzno,
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        hasFailure = true;
        continue;
      }

      if (!basketId) {
        results.push({
          id: prescription?.id,
          mzno: prescription?.mzno,
          ok: false,
          error: 'No basket available',
        });
        hasFailure = true;
        continue;
      }

      bound.push({ prescription, basketId });
    }

    for (let i = 0; i < bound.length; i += MAX_MACHINE_BATCH_SIZE) {
      const chunk = bound.slice(i, i + MAX_MACHINE_BATCH_SIZE);

      let response: Response;
      let responseText: string;
      try {
        const xml = this.buildSoapEnvelopeForSendPrescriptionBatchRB1500(
          chunk.map((item) => item.prescription),
        );
        response = await fetch(rb1500Target, {
          method: 'POST',
          headers: {
            'Content-Type': buildSoapContentType('SendPrescription'),
          },
          body: xml,
        });
        responseText = await response.text();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        for (const { prescription, basketId } of chunk) {
          await this.unbindBasket(basketId, prescription?.id);
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            ok: false,
            error: message,
          });
        }
        hasFailure = true;
        continue;
      }

      const machineResult = parseMachineResult(responseText);
      const rb1500Ok = response.ok && machineResult.success;

      if (!rb1500Ok) {
        const error = machineResult.error || `HTTP ${response.status}`;
        for (const { prescription, basketId } of chunk) {
          await this.unbindBasket(basketId, prescription?.id);
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            status: response.status,
            ok: false,
            error,
          });
        }
        hasFailure = true;
        continue;
      }

      for (const { prescription, basketId } of chunk) {
        try {
          await this.pool.query(
            `UPDATE prescription_header SET pre_state = 0, updated_at = NOW() WHERE id = $1`,
            [prescription?.id],
          );
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            status: response.status,
            ok: true,
          });
        } catch (error) {
          await this.unbindBasket(basketId, prescription?.id);
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            ok: false,
            error: message,
          });
          hasFailure = true;
        }
      }
    }

    const successfulCount = results.filter((item) => item.ok).length;

    return {
      ok: !hasFailure,
      machineTarget: rb1500Target,
      count: prescriptions.length,
      successfulCount,
      message: hasFailure
        ? `Sent ${successfulCount}/${prescriptions.length} prescription(s) to RB1500`
        : `Sent ${prescriptions.length} prescription(s) to RB1500`,
      sentAt: new Date().toISOString(),
      results,
    };
  }

  // Split-send counterpart to sendBatchToMachines for NZP360: lets a
  // pharmacist tell NZP360 to start preparing loose tablets *before* RB1500
  // is dispatched, so the prep work is done by the time the basket physically
  // arrives. Deliberately never touches basket_id/pre_state — those track
  // RB1500's conveyor entry, and a prescription sent to NZP360 alone hasn't
  // entered the conveyor yet, so it must stay out of Process Tracking until
  // RB1500 is sent (either via sendRb1500Only or the combined send-batch).
  // Idempotent: a prescription with nzp360_sent_at already set is reported ok
  // without re-hitting the machine, so a repeat click can't double-dispense.
  async sendNzp360Only(prescriptions: any[]) {
    const results: Array<{
      id?: number;
      mzno?: string;
      status?: number;
      ok: boolean;
      error?: string;
    }> = [];

    const alreadySent = prescriptions.filter((p) => p?.nzp360_sent_at);
    for (const prescription of alreadySent) {
      results.push({
        id: prescription?.id,
        mzno: prescription?.mzno,
        ok: true,
      });
    }

    const eligible: Array<{ prescription: any; nzp360Details: any[] }> = [];
    for (const prescription of prescriptions) {
      if (prescription?.nzp360_sent_at) continue;

      const nzp360Details = (
        Array.isArray(prescription?.details) ? prescription.details : []
      ).filter((detail: any) => detail?.dispense_type === 'nzp360');

      if (nzp360Details.length === 0) {
        results.push({
          id: prescription?.id,
          mzno: prescription?.mzno,
          ok: false,
          error: 'No NZP360-dispensed medicines on this prescription',
        });
        continue;
      }

      eligible.push({ prescription, nzp360Details });
    }

    let hasFailure = results.some((item) => !item.ok);
    let nzp360Target: string | null = null;

    if (eligible.length > 0) {
      try {
        nzp360Target = getMachineTarget(this.config, 'NZP360');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        for (const { prescription } of eligible) {
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            ok: false,
            error: `Unable to reach dispensing machine: ${message}`,
          });
        }
        hasFailure = true;
        eligible.length = 0;
      }
    }

    for (let i = 0; i < eligible.length; i += MAX_MACHINE_BATCH_SIZE) {
      const chunk = eligible.slice(i, i + MAX_MACHINE_BATCH_SIZE);

      let response: Response;
      let responseText: string;
      try {
        const xml = this.buildSoapEnvelopeForSendPrescriptionBatchNZP360(
          chunk.map((item) => ({
            ...item.prescription,
            details: item.nzp360Details,
          })),
        );
        response = await fetch(nzp360Target as string, {
          method: 'POST',
          headers: buildNzp360Headers(this.config, 'SendPrescription'),
          body: xml,
        });
        responseText = await response.text();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        for (const { prescription } of chunk) {
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            ok: false,
            error: message,
          });
        }
        hasFailure = true;
        continue;
      }

      const machineResult = parseMachineResult(responseText);
      const nzp360Ok = response.ok && machineResult.success;

      if (!nzp360Ok) {
        const error = machineResult.error || `HTTP ${response.status}`;
        for (const { prescription } of chunk) {
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            status: response.status,
            ok: false,
            error,
          });
        }
        hasFailure = true;
        continue;
      }

      for (const { prescription } of chunk) {
        try {
          await this.pool.query(
            `UPDATE prescription_header SET nzp360_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [prescription?.id],
          );
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            status: response.status,
            ok: true,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            ok: false,
            error: message,
          });
          hasFailure = true;
        }
      }
    }

    const successfulCount = results.filter((item) => item.ok).length;

    return {
      ok: !hasFailure,
      machineTarget: nzp360Target,
      count: prescriptions.length,
      successfulCount,
      message: hasFailure
        ? `Sent ${successfulCount}/${prescriptions.length} prescription(s) to NZP360`
        : `Sent ${prescriptions.length} prescription(s) to NZP360`,
      sentAt: new Date().toISOString(),
      results,
    };
  }

  // Locks the prescription row first and refuses to bind a second basket if
  // it's no longer `received` (pre_state = -1) — a double-submitted send
  // (double-click, stale UI retry) would otherwise call assignBasket twice
  // for the same prescription, leaking a basket from the fixed 20-basket
  // pool forever since nothing ever frees the first one.
  private async bindBasket(
    prescriptionId: number | undefined,
  ): Promise<string | null> {
    if (!prescriptionId) return null;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const stateRes = await client.query(
        `SELECT pre_state FROM prescription_header WHERE id = $1 FOR UPDATE`,
        [prescriptionId],
      );
      if (stateRes.rows[0]?.pre_state !== -1) {
        await client.query('ROLLBACK');
        throw new Error(
          'Prescription already sent (not in received state) — refusing to bind another basket',
        );
      }

      const basketId = await this.basketsService.assignBasket(
        client,
        prescriptionId,
      );
      if (basketId) {
        await client.query(
          `UPDATE prescription_header SET basket_id = $1 WHERE id = $2`,
          [basketId, prescriptionId],
        );
      }
      await client.query('COMMIT');
      return basketId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async unbindBasket(
    basketId: string,
    prescriptionId: number | undefined,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.basketsService.releaseBasket(client, basketId);
      if (prescriptionId) {
        await client.query(
          `UPDATE prescription_header SET basket_id = NULL WHERE id = $1`,
          [prescriptionId],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Structure confirmed working against the real machine (Postman capture):
  // <root><prescription>...<itmlist><medicine>...</medicine></itmlist></prescription></root>
  // inside a SOAP 1.2 envelope, consistent with RB1500's other operations.
  // Notably absent from the confirmed sample: <destination> and <basket_id>
  // — the earlier <basket_id> tag was a guess (see the CLAUDE.md note it
  // came with) and wasn't actually part of the real contract, so this
  // machine has no way to know which physical basket a prescription is
  // destined for from this call alone; basket tracking stays purely
  // internal to this backend. <priority> (0-9, only 0-4 defined so far: 0
  // Vending machine, 1 Stat order, 2 New order, 3 Discharge order, 4
  // Continue order) is a later addition to the contract — one code per
  // prescription, from prescription_header.priority, not derived from any
  // medicine line item.
  //
  // <root> can hold multiple sibling <prescription> blocks (same convention
  // as SendMedicine's repeated <changemed>/SendDeptInfo's repeated
  // <Dept_info>) — sendBatchToMachines batches up to MAX_MACHINE_BATCH_SIZE
  // prescriptions into one call via this same builder, so the preview can
  // never drift from what a real batched send transmits. The machine only
  // returns one overall <Result>, not a per-prescription breakdown, so a
  // batch is all-or-nothing: if it fails, every prescription in that batch
  // must be treated as failed and have its basket released.
  private buildPrescriptionXmlBlockRB1500(prescription: any): string {
    const details = Array.isArray(prescription?.details)
      ? prescription.details
      : [];
    const medicineXml = details
      .map((detail: any) => {
        return `
            <medicine>
                <prescriptionhisid>${escapeXml(prescription?.prescriptionhisid ?? '')}</prescriptionhisid>
                <medhisid>${escapeXml(detail?.medhisid ?? '')}</medhisid>
                <medunit>${escapeXml(detail?.medunit ?? '')}</medunit>
                <medicinenum>${escapeXml(detail?.medicinenum ?? '')}</medicinenum>
                <medicineheteromorphism>${escapeXml(detail?.medicineheteromorphism ?? 0)}</medicineheteromorphism>
                <medicinehint>${escapeXml(detail?.medicinehint ?? '')}</medicinehint>
                <medfactoryid>${escapeXml(detail?.medfactoryid ?? '')}</medfactoryid>
                <medfactoryname>${escapeXml(detail?.medfactoryname ?? '')}</medfactoryname>
                <medicinenamech>${escapeXml(detail?.medicinenamech ?? '')}</medicinenamech>
            </medicine>`;
      })
      .join('');

    return `
    <prescription>
        <mzno>${escapeXml(prescription?.mzno ?? '')}</mzno>
        <patientname>${escapeXml(prescription?.patientname ?? '')}</patientname>
        <patientage>${escapeXml(prescription?.patientage ?? '')}</patientage>
        <patientsex>${escapeXml(prescription?.patientsex ?? '')}</patientsex>
        <prescriptionhisid>${escapeXml(prescription?.prescriptionhisid ?? '')}</prescriptionhisid>
        <prescriptiondoctorname>${escapeXml(prescription?.prescriptiondoctorname ?? '')}</prescriptiondoctorname>
        <prescriptionhint>${escapeXml(prescription?.prescriptionhint ?? '')}</prescriptionhint>
        <departmentname>${escapeXml(prescription?.departmentname ?? '')}</departmentname>
        <fetchwindow>${escapeXml(prescription?.fetchwindow ?? 0)}</fetchwindow>
        <priority>${escapeXml(prescription?.priority ?? '')}</priority>
        <itmlist>${medicineXml}
        </itmlist>
    </prescription>`;
  }

  private buildSoapEnvelopeForSendPrescriptionBatchRB1500(
    prescriptions: any[],
  ): string {
    const prescriptionXml = prescriptions
      .map((prescription) => this.buildPrescriptionXmlBlockRB1500(prescription))
      .join('');

    const payloadXml = `
<root>${prescriptionXml}
</root>
`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:SendPrescription xmlns:tns="http://tempuri.org/">
      <tns:str><![CDATA[${payloadXml}]]></tns:str>
    </tns:SendPrescription>
  </soap12:Body>
</soap12:Envelope>`;
  }

  private buildSoapEnvelopeForSendPrescriptionRB1500(prescription: any) {
    return this.buildSoapEnvelopeForSendPrescriptionBatchRB1500([prescription]);
  }

  // Builds the exact SOAP envelope(s) sendBatchToMachines would send,
  // without actually sending anything or binding a basket — reuses the same
  // private builders and the same chunk boundaries a real send uses, so the
  // preview can never drift from what actually goes out over the wire.
  // RB1500 batches every prescription in chunks of MAX_MACHINE_BATCH_SIZE;
  // NZP360 batches the nzp360-eligible subset *within each of those same
  // chunks* (mirroring sendBatchToMachines exactly — one NZP360 call per
  // RB1500 chunk's nzp360-eligible prescriptions, skipped if none).
  buildPreviewForBatch(prescriptions: any[]) {
    prescriptions = interleaveCobotPrescriptions(prescriptions);

    const rb1500Batches: Array<{
      prescriptionIds: Array<number | undefined>;
      mznos: Array<string | undefined>;
      prescriptionHisIds: Array<string | undefined>;
      // Aligned index-for-index with the arrays above — lets the UI mark
      // which prescriptions in this dispatch order actually need COBOT,
      // since interleaveCobotPrescriptions already decided their positions.
      cobotFlags: boolean[];
      xml: string;
    }> = [];
    const nzp360Batches: Array<{
      prescriptionIds: Array<number | undefined>;
      mznos: Array<string | undefined>;
      prescriptionHisIds: Array<string | undefined>;
      xml: string;
    }> = [];

    for (let i = 0; i < prescriptions.length; i += MAX_MACHINE_BATCH_SIZE) {
      const chunk = prescriptions.slice(i, i + MAX_MACHINE_BATCH_SIZE);
      rb1500Batches.push({
        prescriptionIds: chunk.map((p) => p?.id),
        mznos: chunk.map((p) => p?.mzno),
        prescriptionHisIds: chunk.map((p) => p?.prescriptionhisid),
        cobotFlags: chunk.map((p) => isCobotPrescription(p)),
        xml: this.buildSoapEnvelopeForSendPrescriptionBatchRB1500(chunk),
      });

      const nzp360Eligible = chunk
        .map((prescription) => ({
          prescription,
          nzp360Details: prescription?.nzp360_sent_at
            ? []
            : (Array.isArray(prescription?.details)
                ? prescription.details
                : []
              ).filter((detail: any) => detail?.dispense_type === 'nzp360'),
        }))
        .filter((item) => item.nzp360Details.length > 0);

      if (nzp360Eligible.length > 0) {
        nzp360Batches.push({
          prescriptionIds: nzp360Eligible.map((item) => item.prescription?.id),
          mznos: nzp360Eligible.map((item) => item.prescription?.mzno),
          prescriptionHisIds: nzp360Eligible.map(
            (item) => item.prescription?.prescriptionhisid,
          ),
          xml: this.buildSoapEnvelopeForSendPrescriptionBatchNZP360(
            nzp360Eligible.map((item) => ({
              ...item.prescription,
              details: item.nzp360Details,
            })),
          ),
        });
      }
    }

    const items = prescriptions.map((prescription) => ({
      id: prescription?.id,
      mzno: prescription?.mzno,
      prescriptionhisid: prescription?.prescriptionhisid,
    }));

    return { rb1500Batches, nzp360Batches, items };
  }

  // Preview counterpart to sendRb1500Only — same chunking, same builder, no
  // basket bind/machine call/DB write.
  buildPreviewForRb1500(prescriptions: any[]) {
    prescriptions = interleaveCobotPrescriptions(prescriptions);

    const batches: Array<{
      prescriptionIds: Array<number | undefined>;
      mznos: Array<string | undefined>;
      prescriptionHisIds: Array<string | undefined>;
      cobotFlags: boolean[];
      xml: string;
    }> = [];

    for (let i = 0; i < prescriptions.length; i += MAX_MACHINE_BATCH_SIZE) {
      const chunk = prescriptions.slice(i, i + MAX_MACHINE_BATCH_SIZE);
      batches.push({
        prescriptionIds: chunk.map((p) => p?.id),
        mznos: chunk.map((p) => p?.mzno),
        prescriptionHisIds: chunk.map((p) => p?.prescriptionhisid),
        cobotFlags: chunk.map((p) => isCobotPrescription(p)),
        xml: this.buildSoapEnvelopeForSendPrescriptionBatchRB1500(chunk),
      });
    }

    const items = prescriptions.map((prescription) => ({
      id: prescription?.id,
      mzno: prescription?.mzno,
      prescriptionhisid: prescription?.prescriptionhisid,
    }));

    return { batches, items };
  }

  // Preview counterpart to sendNzp360Only — mirrors its eligibility rules
  // (skip prescriptions already nzp360_sent_at, skip ones with no
  // nzp360-dispensed medicines) so the XML shown can never drift from what a
  // real send would transmit, and never claims to preview a call that
  // wouldn't actually happen.
  buildPreviewForNzp360(prescriptions: any[]) {
    const eligible = prescriptions
      .filter((prescription) => !prescription?.nzp360_sent_at)
      .map((prescription) => ({
        prescription,
        nzp360Details: (Array.isArray(prescription?.details)
          ? prescription.details
          : []
        ).filter((detail: any) => detail?.dispense_type === 'nzp360'),
      }))
      .filter((item) => item.nzp360Details.length > 0);

    const batches: Array<{
      prescriptionIds: Array<number | undefined>;
      mznos: Array<string | undefined>;
      prescriptionHisIds: Array<string | undefined>;
      xml: string;
    }> = [];

    for (let i = 0; i < eligible.length; i += MAX_MACHINE_BATCH_SIZE) {
      const chunk = eligible.slice(i, i + MAX_MACHINE_BATCH_SIZE);
      batches.push({
        prescriptionIds: chunk.map((item) => item.prescription?.id),
        mznos: chunk.map((item) => item.prescription?.mzno),
        prescriptionHisIds: chunk.map(
          (item) => item.prescription?.prescriptionhisid,
        ),
        xml: this.buildSoapEnvelopeForSendPrescriptionBatchNZP360(
          chunk.map((item) => ({
            ...item.prescription,
            details: item.nzp360Details,
          })),
        ),
      });
    }

    const items = prescriptions.map((prescription) => ({
      id: prescription?.id,
      mzno: prescription?.mzno,
      prescriptionhisid: prescription?.prescriptionhisid,
    }));

    return { batches, items };
  }

  // NZP360's SendPrescription contract, given as a working sample envelope —
  // wired up from sendBatchToMachines but not yet confirmed against the real
  // machine, unlike buildSoapEnvelopeForSendPrescriptionRB1500. Its schema is
  // completely different from RB1500's (DocumentElement/PatientInfo/DrugInfo
  // in UPPER_SNAKE_CASE fields, vs RB1500's root/prescription/itmlist).
  // Callers must pre-filter `prescription.details` down to dispense_type =
  // 'nzp360' lines before calling this — it does not filter itself, since
  // sendBatchToMachines also needs to know upfront whether there's anything
  // to send at all (to skip the NZP360 call entirely when there isn't). The
  // sample also only shows a single <DrugInfo> nested directly in
  // <PatientInfo> — whether multiple medicines repeat <DrugInfo> as siblings
  // (assumed here) or need a different shape entirely is unconfirmed.
  // ORDER_DRUG is confirmed to be this drug's 1-based position within the
  // prescription's drug list (1, 2, 3, ...) — NOT the medicine's HIS ID
  // (that's DRUG_CODE/ORDER_DRUG's earlier, incorrect value).
  //
  // <DocumentElement> can hold multiple sibling <PatientInfo> blocks (same
  // multi-patient-per-call convention adopted for RB1500's <root>) —
  // sendBatchToMachines batches up to MAX_MACHINE_BATCH_SIZE prescriptions
  // per NZP360 call the same way it does for RB1500. Like RB1500, NZP360
  // only returns one overall result per call, so a batch is all-or-nothing.
  private buildPatientInfoXmlBlockNZP360(prescription: any): string {
    const details = Array.isArray(prescription?.details)
      ? prescription.details
      : [];
    const drugInfoXml = details
      .map((detail: any, index: number) => {
        return `
    <DrugInfo>
      <ORDER_DRUG>${escapeXml(index + 1)}</ORDER_DRUG>
      <DISPENSING_TIME>${escapeXml(detail?.dispensingtime ?? '')}</DISPENSING_TIME>
      <DRUG_CODE>${escapeXml(detail?.medhisid ?? '')}</DRUG_CODE>
      <DRUG_TEXT>${escapeXml(detail?.medicinenamech ?? '')}</DRUG_TEXT>
      <DRUG_SPEC>${escapeXml(detail?.drugspec ?? '')}</DRUG_SPEC>
      <DRUG_FID>${escapeXml(detail?.medfactoryid ?? '')}</DRUG_FID>
      <DRUG_FNAME>${escapeXml(detail?.medfactoryname ?? '')}</DRUG_FNAME>
      <DRUG_HINT>${escapeXml(detail?.medicinehint ?? '')}</DRUG_HINT>
      <DRUG_PY>${escapeXml(detail?.drugpycode ?? '')}</DRUG_PY>
      <DOSAGE>${escapeXml(detail?.dosage ?? detail?.medicinenum ?? '')}</DOSAGE>
      <DOSAGE_UNIT>${escapeXml(detail?.dosageunit ?? detail?.medunit ?? '')}</DOSAGE_UNIT>
      <DOSAGE_PER_UNIT>${escapeXml(detail?.dosageperunit ?? '')}</DOSAGE_PER_UNIT>
      <PERFORM_TIME>${escapeXml(detail?.performtime ?? '')}</PERFORM_TIME>
      <PERFORM_FREQ_DETAIL>${escapeXml(detail?.performfreqdetail ?? '')}</PERFORM_FREQ_DETAIL>
      <PERFORM_FREQ>${escapeXml(detail?.performfreq ?? '')}</PERFORM_FREQ>
      <PERFORM_FREQ_PRINT>${escapeXml(detail?.performfreqprint ?? '')}</PERFORM_FREQ_PRINT>
      <NURSING_CODE>${escapeXml(detail?.nursingcode ?? '')}</NURSING_CODE>
      <NURSING_RESERVED></NURSING_RESERVED>
    </DrugInfo>`;
      })
      .join('');

    return `
  <PatientInfo>
    <ORDER_NO>${escapeXml(prescription?.prescriptionhisid ?? '')}</ORDER_NO>
    <ORDER_PRE>${escapeXml(prescription?.prescriptionhisid ?? '')}</ORDER_PRE>
    <ORDER_DEPT>${escapeXml(prescription?.deptcode ?? '')}</ORDER_DEPT>
    <ORDER_BED>${escapeXml(prescription?.patientbed ?? '')}</ORDER_BED>
    <PRE_ADMINISTRATION>${escapeXml(prescription?.administration ?? '')}</PRE_ADMINISTRATION>
    <PRE_REPEAT_INDICATOR>${escapeXml(prescription?.repeatindicator ?? '')}</PRE_REPEAT_INDICATOR>
    <PRE_HINT>${escapeXml(prescription?.prescriptionhint ?? '')}</PRE_HINT>
    <DOCTOR_ID>${escapeXml(prescription?.doctorid ?? '')}</DOCTOR_ID>
    <DOCTOR_NAME>${escapeXml(prescription?.prescriptiondoctorname ?? '')}</DOCTOR_NAME>
    <PATIENT_ID>${escapeXml(prescription?.mzno ?? '')}</PATIENT_ID>
    <PATIENT_NAME>${escapeXml(prescription?.patientname ?? '')}</PATIENT_NAME>
    <PATIENT_SEX>${escapeXml(prescription?.patientsex ?? '')}</PATIENT_SEX>
    <PATIENT_BIRTHDAY>${escapeXml(prescription?.patientbirthday ?? '')}</PATIENT_BIRTHDAY>
    <PATIENT_AGE>${escapeXml(prescription?.patientage ?? '')}</PATIENT_AGE>
    <PATIENT_BED>${escapeXml(prescription?.patientbed ?? '')}</PATIENT_BED>
    <PATIENT_VISITID>${escapeXml(prescription?.patientvisitid ?? '')}</PATIENT_VISITID>${drugInfoXml}
  </PatientInfo>`;
  }

  private buildSoapEnvelopeForSendPrescriptionBatchNZP360(
    prescriptions: any[],
  ): string {
    const patientInfoXml = prescriptions
      .map((prescription) => this.buildPatientInfoXmlBlockNZP360(prescription))
      .join('');

    const medXml = `<?xml version="1.0" encoding="UTF-8"?>
<DocumentElement>${patientInfoXml}
</DocumentElement>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:SendPrescription xmlns:tns="RssServer">
      <tns:Prescription_XML><![CDATA[${medXml}]]></tns:Prescription_XML>
    </tns:SendPrescription>
  </soap12:Body>
</soap12:Envelope>`;
  }

  private buildSoapEnvelopeForSendPrescriptionNZP360(
    prescription: any,
  ): string {
    return this.buildSoapEnvelopeForSendPrescriptionBatchNZP360([prescription]);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
