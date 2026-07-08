import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  buildSoapContentType,
  escapeXml,
  extractTagValues,
  getMachineTarget,
  parseMachineResult,
} from '../common/soap.util';
import { BasketsService } from '../baskets/baskets.service';

@Injectable()
export class PrescriptionsService implements OnModuleDestroy {
  private pool: Pool;

  constructor(
    private config: ConfigService,
    private basketsService: BasketsService,
  ) {
    this.pool = new Pool({
      host: this.config.get<string>('DB_HOST') ?? 'localhost',
      port: Number(this.config.get<number>('DB_PORT') ?? 5432),
      user: this.config.get<string>('DB_USER') ?? 'postgres',
      password: this.config.get<string>('DB_PASSWORD') ?? 'postgres',
      database: this.config.get<string>('DB_NAME') ?? 'electronic_shell',
    });
  }
  // ------------------------------------
  //   DB Prescription
  // ------------------------------------

  // pre_state now only has 3 meanings: -1 received, 0 in progress, 1 complete.
  // Station-level progress lives on the bound basket (see findInProgress).
  async findAll(limit = 100) {
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
                'nursingcode', pd.nursingcode
              )
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
        ORDER BY ph.id DESC
        LIMIT $1
      `,
      [limit],
    );
    return res.rows;
  }

  // Process Tracking's data source: prescriptions in progress (0) joined to
  // their bound basket's station_status, PLUS already-complete ones (1) so
  // pharmacists can still check them here — those no longer have a basket
  // bound once the patient has actually picked up the medicine (station 8
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
          b.basket_id,
          COALESCE(b.station_status, CASE WHEN ph.pre_state = 1 THEN 8 ELSE 0 END) AS station_status,
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
                'nursingcode', pd.nursingcode
              )
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
  // station_status = 7 ("call patient for pickup") — i.e. the pharmacist has
  // already called them but they haven't confirmed pickup (station 8) yet.
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
      WHERE b.station_status = 7
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
               patientbirthday, patientvisitid, patientbed, doctorid, administration, repeatindicator, deptcode)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, -1, $10, $11, $12, $13, $14, $15, $16)
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
                 drugspec, drugpycode, dosage, dosageunit, dosageperunit, dispensingtime, performtime, performfreqdetail, performfreq, performfreqprint, nursingcode)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
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

  async sendToRB1500(prescription: any, destination: string) {
    return this.sendBatchToMachines([prescription], destination);
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

    const results: Array<{
      id?: number;
      mzno?: string;
      status?: number;
      ok: boolean;
      error?: string;
    }> = [];
    let hasFailure = false;

    for (const prescription of prescriptions) {
      const basketId = await this.bindBasket(prescription?.id);

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

      try {
        const xml = this.buildSoapEnvelopeForSendPrescriptionRB1500(
          prescription,
          destination,
          basketId,
        );
        console.log('RB1500 SendPrescription XML:', xml);
        const response = await fetch(rb1500Target, {
          method: 'POST',
          headers: {
            'Content-Type': buildSoapContentType('SendPrescription'),
          },
          body: xml,
        });

        // The machine replies HTTP 200 even on failure — the real outcome is in the body.
        const responseText = await response.text();
        const machineResult = parseMachineResult(responseText);
        const rb1500Ok = response.ok && machineResult.success;

        if (!rb1500Ok) {
          await this.unbindBasket(basketId, prescription?.id);
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            status: response.status,
            ok: false,
            error: machineResult.error || `HTTP ${response.status}`,
          });
          hasFailure = true;
          continue;
        }

        const nzp360Details = (
          Array.isArray(prescription?.details) ? prescription.details : []
        ).filter((detail: any) => detail?.dispense_type === 'nzp360');

        let nzp360Ok = true;
        let nzp360Error: string | undefined;

        if (nzp360Details.length > 0) {
          try {
            const nzp360Target = getMachineTarget(this.config, 'NZP360');
            const nzp360Xml = this.buildSoapEnvelopeForSendPrescriptionNZP360({
              ...prescription,
              details: nzp360Details,
            });
            console.log('NZP360 SendPrescription XML:', nzp360Xml);
            const nzp360Response = await fetch(nzp360Target, {
              method: 'POST',
              headers: {
                'Content-Type': buildSoapContentType(
                  'SendPrescription',
                  'RssServer',
                ),
              },
              body: nzp360Xml,
            });

            const nzp360ResponseText = await nzp360Response.text();
            const nzp360MachineResult = parseMachineResult(nzp360ResponseText);
            nzp360Ok = nzp360Response.ok && nzp360MachineResult.success;
            if (!nzp360Ok) {
              nzp360Error =
                nzp360MachineResult.error || `HTTP ${nzp360Response.status}`;
            }
          } catch (error) {
            nzp360Ok = false;
            nzp360Error =
              error instanceof Error ? error.message : 'Unknown error';
          }
        }

        if (!nzp360Ok) {
          await this.unbindBasket(basketId, prescription?.id);
          results.push({
            id: prescription?.id,
            mzno: prescription?.mzno,
            status: response.status,
            ok: false,
            error: `NZP360: ${nzp360Error}`,
          });
          hasFailure = true;
          continue;
        }

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

  private async bindBasket(
    prescriptionId: number | undefined,
  ): Promise<string | null> {
    if (!prescriptionId) return null;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
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

  private buildSoapEnvelopeForSendPrescriptionRB1500(
    prescription: any,
    destination: string,
    basketId: string,
  ) {
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

    const payloadXml = `<?xml version="1.0" encoding="utf-8"?>
<root>
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
    <destination>${escapeXml(destination)}</destination>
    <basket_id>${escapeXml(basketId)}</basket_id>
    <itmlist>${medicineXml}
    </itmlist>
  </prescription>
</root>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:SendPrescription xmlns:tns="http://tempuri.org/">
      <tns:str><![CDATA[${payloadXml}]]></tns:str>
    </tns:SendPrescription>
  </soap12:Body>
</soap12:Envelope>`;
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
  private buildSoapEnvelopeForSendPrescriptionNZP360(
    prescription: any,
  ): string {
    const details = Array.isArray(prescription?.details)
      ? prescription.details
      : [];
    const drugInfoXml = details
      .map((detail: any) => {
        return `
    <DrugInfo>
      <ORDER_DRUG>${escapeXml(detail?.medhisid ?? '')}</ORDER_DRUG>
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

    const medXml = `<?xml version="1.0" encoding="GB2312"?>
<DocumentElement>
  <PatientInfo>
    <!-- ORDER_NO/ORDER_PRE: NEEDS CONFIRMATION — guessing prescriptionhisid covers the order/prescription id pairing that the sample splits in two -->
    <ORDER_NO>${escapeXml(prescription?.prescriptionhisid ?? '')}</ORDER_NO>
    <ORDER_PRE>${escapeXml(prescription?.prescriptionhisid ?? '')}</ORDER_PRE>
    <ORDER_DEPT>${escapeXml(prescription?.deptcode ?? '')}</ORDER_DEPT>
    <ORDER_BED>${escapeXml(prescription?.patientbed ?? '')}</ORDER_BED>
    <PRE_ADMINISTRATION>${escapeXml(prescription?.administration ?? '')}</PRE_ADMINISTRATION>
    <PRE_REPEAT_INDICATOR>${escapeXml(prescription?.repeatindicator ?? '')}</PRE_REPEAT_INDICATOR>
    <PRE_HINT>${escapeXml(prescription?.prescriptionhint ?? '')}</PRE_HINT>
    <DOCTOR_ID>${escapeXml(prescription?.doctorid ?? '')}</DOCTOR_ID>
    <DOCTOR_NAME>${escapeXml(prescription?.prescriptiondoctorname ?? '')}</DOCTOR_NAME>
    <!-- mzno IS the patient identifier here — RB1500 and NZP360 just name the same value differently, so there's no separate patienthisid column. -->
    <PATIENT_ID>${escapeXml(prescription?.mzno ?? '')}</PATIENT_ID>
    <PATIENT_NAME>${escapeXml(prescription?.patientname ?? '')}</PATIENT_NAME>
    <PATIENT_SEX>${escapeXml(prescription?.patientsex ?? '')}</PATIENT_SEX>
    <PATIENT_BIRTHDAY>${escapeXml(prescription?.patientbirthday ?? '')}</PATIENT_BIRTHDAY>
    <PATIENT_AGE>${escapeXml(prescription?.patientage ?? '')}</PATIENT_AGE>
    <PATIENT_BED>${escapeXml(prescription?.patientbed ?? '')}</PATIENT_BED>
    <PATIENT_VISITID>${escapeXml(prescription?.patientvisitid ?? '')}</PATIENT_VISITID>${drugInfoXml}
  </PatientInfo>
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

  // Asks the machine for the HIS ids of prescriptions the robot has already
  // finished dispensing (ready for pharmacist pickup/recheck) — read-only
  // against the machine, and deliberately does not touch the database at all
  // (no matching/writing against prescription_header) until that's asked for.
  async queryReadyPrescriptionsFromRB1500() {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'RB1500');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        queriedAt: new Date().toISOString(),
      };
    }

    const xml = this.buildSoapEnvelopeForQueryReadyPrescriptionRB1500();
    console.log('RB1500 QueryReadyPrescription XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('QueryReadyPrescription'),
        },
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      const machineResult = parseMachineResult(responseText);

      const readyPrescriptionHisIds = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'PreHISId')
        : [];

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? 'Fetched ready prescriptions from machine'
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        readyPrescriptionHisIds,
        raw: responseText,
        queriedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        queriedAt: new Date().toISOString(),
      };
    }
  }

  private buildSoapEnvelopeForQueryReadyPrescriptionRB1500() {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:QueryReadyPrescription xmlns:tns="http://tempuri.org/"/>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Asks the machine for basket info by some identifier (str) and a query
  // type (type) — read-only against the machine, no database reads or
  // writes here, same as queryReadyPrescriptionsFromRB1500.
  async queryBasketFromRB1500(str: string, type: string) {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'RB1500');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        queriedAt: new Date().toISOString(),
      };
    }

    const xml = this.buildSoapEnvelopeForQueryBasketRB1500(str, type);
    console.log('RB1500 QueryBasket XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('QueryBasket'),
        },
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      const machineResult = parseMachineResult(responseText);

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Queried basket for ${str}`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        innerXml: machineResult.innerXml,
        raw: responseText,
        queriedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        queriedAt: new Date().toISOString(),
      };
    }
  }

  private buildSoapEnvelopeForQueryBasketRB1500(str: string, type: string) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:QueryBasket xmlns:tns="http://tempuri.org/">
      <tns:str>${escapeXml(str)}</tns:str>
      <tns:type>${escapeXml(type)}</tns:type>
    </tns:QueryBasket>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Tells the machine that a prescription's pharmacist recheck is done — the
  // real-world counterpart of Machine Sim's station 6 (Pharmacist Recheck).
  // Calling this is expected to clear that prescriptionhisid out of the
  // machine's own "ready" queue (see queryReadyPrescriptionsFromRB1500), so
  // it must only be called once recheck is genuinely complete — NOT wired
  // into advance-station automatically yet (see chat summary for why).
  async updateReadyPrescriptionStateOnRB1500(prescriptionhisid: string) {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'RB1500');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        updatedAt: new Date().toISOString(),
      };
    }

    const xml =
      this.buildSoapEnvelopeForUpdateReadyPrescriptionStateRB1500(
        prescriptionhisid,
      );
    console.log('RB1500 UpdateReadyPrescriptionState XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('UpdateReadyPrescriptionState'),
        },
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      const machineResult = parseMachineResult(responseText);

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Marked ${prescriptionhisid} as recheck-complete on the machine`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        raw: responseText,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  private buildSoapEnvelopeForUpdateReadyPrescriptionStateRB1500(
    prescriptionhisid: string,
  ) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:UpdateReadyPrescriptionState xmlns:tns="http://tempuri.org/">
      <tns:str>${escapeXml(prescriptionhisid)}</tns:str>
    </tns:UpdateReadyPrescriptionState>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Tells the machine to eliminate/cancel a prescription it's holding — same
  // shape as updateReadyPrescriptionStateOnRB1500 (one <tns:str> carrying the
  // prescriptionhisid), just a different operation name. Not wired into any
  // database state yet — machine-only call for now, as requested.
  async execEliminatePrescriptionOnRB1500(prescriptionhisid: string) {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'RB1500');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        updatedAt: new Date().toISOString(),
      };
    }

    const xml =
      this.buildSoapEnvelopeForExecEliminatePrescriptionRB1500(
        prescriptionhisid,
      );
    console.log('RB1500 ExecEliminatePrescription XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('ExecEliminatePrescription'),
        },
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      const machineResult = parseMachineResult(responseText);

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Eliminated ${prescriptionhisid} on the machine`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        raw: responseText,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  private buildSoapEnvelopeForExecEliminatePrescriptionRB1500(
    prescriptionhisid: string,
  ) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:ExecEliminatePrescription xmlns:tns="http://tempuri.org/">
      <tns:str>${escapeXml(prescriptionhisid)}</tns:str>
    </tns:ExecEliminatePrescription>
  </soap12:Body>
</soap12:Envelope>`;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
