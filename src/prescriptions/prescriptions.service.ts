import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class PrescriptionsService implements OnModuleDestroy {
  private pool: Pool;

  constructor(private config: ConfigService) {
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

  async findAll(limit = 100, minState: number | null = null) {
    const stateFilter = minState === null ? 'ph.pre_state = 0' : 'ph.pre_state >= $2';
    const params = minState === null ? [limit] : [limit, minState];

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
          COALESCE(
            json_agg(
              json_build_object(
                'id', pd.id,
                'medhisid', pd.medhisid,
                'medunit', pd.medunit,
                'medicinenum', pd.medicinenum,
                'medicineheteromorphism', pd.medicineheteromorphism,
                'medicinenamech', pd.medicinenamech,
                'medfactoryname', pd.medfactoryname
              )
            ) FILTER (WHERE pd.id IS NOT NULL),
            '[]'
          ) AS details
        FROM prescription_header ph
        LEFT JOIN prescription_detail pd ON pd.prescription_id = ph.id
        WHERE ${stateFilter}
        GROUP BY ph.id
        ORDER BY ph.id DESC
        LIMIT $1
      `,
      params,
    );
    return res.rows;
  }

  async updateMultiplePrescriptionStates(prescriptionIds: number[], newState: number) {
  // 1. ดักไว้ก่อน เผื่อมีการส่ง Array ว่างมา จะได้ไม่เกิด Error ในฝั่ง Database
    if (!prescriptionIds || prescriptionIds.length === 0) {
        return [];
    }

    // 2. ใช้ ANY($2) เพื่อบอก Postgres ให้หา id ที่ตรงกับค่าใดๆ ใน Array
    const res = await this.pool.query(
        `
        UPDATE prescription_header
        SET pre_state = $1, updated_at = NOW()
        WHERE id = ANY($2::int[])
        RETURNING *
        `,
        [newState, prescriptionIds],
    );
    
    // 3. คืนค่ากลับไปทั้งหมด (ได้เป็น Array ของ Row ที่อัปเดตสำเร็จ)
    return res.rows;
    }

  async updateStateByHisId(prescriptionhisid: string, newState: number) {
    const res = await this.pool.query(
      `
      UPDATE prescription_header
      SET pre_state = $1, updated_at = NOW()
      WHERE prescriptionhisid = $2
      RETURNING *
      `,
      [newState, prescriptionhisid],
    );
    return res.rows[0] ?? null;
  }
// ------------------------------------------------


  // Persists prescriptions coming in from the hospital HIS into prescription_header
  // (+ their medicines into prescription_detail) at pre_state = 0 ("received"), so
  // everything downstream (Machine Sim lookups, Process Tracking, send-batch) is
  // reading and writing the same rows instead of a separate in-memory queue.
  async receivePrescriptions(payload: any, source = 'pharmacy') {
    const prescriptions = Array.isArray(payload?.prescriptions)
      ? payload.prescriptions
      : Array.isArray(payload)
        ? payload
        : [payload?.prescription ?? payload]

    const validPrescriptions = prescriptions.filter((item) => item && typeof item === 'object')

    const client = await this.pool.connect()
    let insertedCount = 0
    let skippedCount = 0

    try {
      for (const prescription of validPrescriptions) {
        await client.query('BEGIN')
        try {
          const headerRes = await client.query(
            `
            INSERT INTO prescription_header
              (mzno, patientname, patientage, patientsex, prescriptionhisid, prescriptiondoctorname, prescriptionhint, departmentname, fetchwindow, pre_state)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0)
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
            ],
          )

          if (headerRes.rows.length === 0) {
            // prescriptionhisid already exists — skip rather than duplicate.
            await client.query('ROLLBACK')
            skippedCount += 1
            continue
          }

          const prescriptionId = headerRes.rows[0].id
          const items: any[] = Array.isArray(prescription?.details)
            ? prescription.details
            : Array.isArray(prescription?.itmlist)
              ? prescription.itmlist
              : []

          for (const item of items) {
            await client.query(
              `
              INSERT INTO prescription_detail
                (prescription_id, prescriptionhisid, medhisid, medunit, medicinenum, medicineheteromorphism, medicinehint, medfactoryid, medfactoryname, medicinenamech)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
              ],
            )
          }

          await client.query('COMMIT')
          insertedCount += 1
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        }
      }
    } finally {
      client.release()
    }

    return {
      ok: true,
      received: validPrescriptions.length,
      inserted: insertedCount,
      skipped: skippedCount,
      source,
      receivedAt: new Date().toISOString(),
    }
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
    }
  }

  async sendToRobot(prescription: any, destination: string) {
    return this.sendBatchToRobot([prescription], destination)
  }

  async sendBatchToRobot(prescriptions: any[], destination: string) {
    let machineTarget: string
    try {
      machineTarget = this.getMachineTarget()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
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
      }
    }

    const results: Array<{ id?: number; mzno?: string; status?: number; ok: boolean; error?: string }> = []
    let hasFailure = false

    for (const prescription of prescriptions) {
      try {
        const xml = this.buildSoapEnvelope(prescription, destination)
        const response = await fetch(machineTarget, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            Accept: 'application/xml',
          },
          body: xml,
        })
        console.log(`Response from machine: ${await response.text()} `)
        results.push({
          id: prescription?.id,
          mzno: prescription?.mzno,
          status: response.status,
          ok: response.ok,
          error: response.ok ? undefined : `HTTP ${response.status}`,
        })
        // console.log(`pres${xml}`)
        if (!response.ok) {
          hasFailure = true
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          id: prescription?.id,
          mzno: prescription?.mzno,
          ok: false,
          error: message,
        })
        hasFailure = true
      }
    }

    const successfulCount = results.filter((item) => item.ok).length

    return {
      ok: !hasFailure,
      destination,
      machineTarget,
      count: prescriptions.length,
      successfulCount,
      message: hasFailure
        ? `Sent ${successfulCount}/${prescriptions.length} prescription(s)`
        : `Sent ${prescriptions.length} prescription(s) to robot`,
      sentAt: new Date().toISOString(),
      results,
    }
  }

  private getMachineTarget(): string {
  // ดึงค่าจาก .env ตาม Priority (ถ้ามี ROBOT_MACHINE_PATH ให้ใช้ก่อน ถ้าไม่มีค่อยใช้ MACHINE_PATH)
    const configuredPath = this.config.get<string>('ROBOT_MACHINE_PATH') 
        ?? this.config.get<string>('MACHINE_PATH');

    // ถ้าใน .env ไม่ได้ระบุไว้เลย ให้โยน Error ทันทีเพื่อความปลอดภัยของระบบ
    if (!configuredPath) {
        throw new Error('Critical Error: MACHINE_PATH is not defined in .env environment variables');
    }
    return configuredPath;
    }

  private buildSoapEnvelope(prescription: any, destination: string) {
    const details = Array.isArray(prescription?.details) ? prescription.details : []
    const medicineXml = details
      .map((detail: any) => {
        return `
      <medicine>
        <prescriptionhisid>${this.escapeXml(prescription?.prescriptionhisid ?? '')}</prescriptionhisid>
        <medhisid>${this.escapeXml(detail?.medhisid ?? '')}</medhisid>
        <medunit>${this.escapeXml(detail?.medunit ?? '')}</medunit>
        <medicinenum>${this.escapeXml(detail?.medicinenum ?? '')}</medicinenum>
        <medicineheteromorphism>${this.escapeXml(detail?.medicineheteromorphism ?? 0)}</medicineheteromorphism>
        <medicinehint>${this.escapeXml(detail?.medicinehint ?? '')}</medicinehint>
        <medfactoryid>${this.escapeXml(detail?.medfactoryid ?? '')}</medfactoryid>
        <medfactoryname>${this.escapeXml(detail?.medfactoryname ?? '')}</medfactoryname>
        <medicinenamech>${this.escapeXml(detail?.medicinenamech ?? '')}</medicinenamech>
      </medicine>`
      })
      .join('')

    const payloadXml = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <prescription>
    <mzno>${this.escapeXml(prescription?.mzno ?? '')}</mzno>
    <patientname>${this.escapeXml(prescription?.patientname ?? '')}</patientname>
    <patientage>${this.escapeXml(prescription?.patientage ?? '')}</patientage>
    <patientsex>${this.escapeXml(prescription?.patientsex ?? '')}</patientsex>
    <prescriptionhisid>${this.escapeXml(prescription?.prescriptionhisid ?? '')}</prescriptionhisid>
    <prescriptiondoctorname>${this.escapeXml(prescription?.prescriptiondoctorname ?? '')}</prescriptiondoctorname>
    <prescriptionhint>${this.escapeXml(prescription?.prescriptionhint ?? '')}</prescriptionhint>
    <departmentname>${this.escapeXml(prescription?.departmentname ?? '')}</departmentname>
    <fetchwindow>${this.escapeXml(prescription?.fetchwindow ?? 0)}</fetchwindow>
    <destination>${this.escapeXml(destination)}</destination>
    <itmlist>${medicineXml}
    </itmlist>
  </prescription>
</root>`

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:SendPrescription xmlns:tns="http://tempuri.org/">
      <tns:str><![CDATA[${payloadXml}]]></tns:str>
    </tns:SendPrescription>
  </soap12:Body>
</soap12:Envelope>`
  }

  private escapeXml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
