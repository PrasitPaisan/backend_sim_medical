import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  buildSoapContentType,
  escapeXml,
  getMachineTarget,
  parseMachineResult,
} from '../common/soap.util';
import { createPool } from '../common/db.util';

export type MedicineInput = {
  medicinehisid: string;
  medicinenamech: string;
  medicinenameen?: string;
  medicineunit: string;
  medicinestate?: number;
  medfactoryid?: string;
  medfactoryname: string;
  typeunit: string;
  hpmtypeunit: string;
  numcode?: string;
  pycode: string;
  boxmaxnum?: number;
  medposition?: string;
  med_batch?: string;
  validate_time?: string;
  /** NZP360-only field (med_unit_capacity in its DataTable) — not part of the RB1500 SendMedicine contract. */
  med_unit_capacity?: number;
  /** Which station/machine this medicine is dispensed by (manual, cobot, or a machine model code like nzp360/rb1500). DB-only — not part of the SendMedicine XML contract. */
  dispense_type?: string;
};

export type SendMedicineResult = {
  ok: boolean;
  status?: number;
  machineTarget: string | null;
  message: string;
  sentAt: string;
};

@Injectable()
export class MedicinesService implements OnModuleDestroy {
  private pool: Pool;

  constructor(private config: ConfigService) {
    this.pool = createPool(this.config);
  }

  // ------------------------------------
  //   DB Medicines
  // ------------------------------------

  async findAll(limit = 100) {
    const res = await this.pool.query(
      'SELECT * FROM medicine_dictionary ORDER BY id DESC LIMIT $1',
      [limit],
    );
    return res.rows;
  }

  // Adds/updates the machine's copy of a medicine once the machine itself has
  // confirmed it (see sendMedicineToRB1500) — this table is how the UI shows
  // "which medicines are already on the machine" in the Add Medicine page.
  async upsertMedicine(medicine: MedicineInput) {
    const res = await this.pool.query(
      `
      INSERT INTO medicine_dictionary
        (medicinehisid, medicinenamech, medicinenameen, medicineunit, medicinestate, medfactoryid, medfactoryname, typeunit, hpmtypeunit, numcode, pycode, boxmaxnum, medposition, med_batch, validate_time, dispense_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (medicinehisid, medicineunit, medfactoryname) DO UPDATE SET
        medicinenamech = EXCLUDED.medicinenamech,
        medicinenameen = EXCLUDED.medicinenameen,
        medicinestate = EXCLUDED.medicinestate,
        medfactoryid = EXCLUDED.medfactoryid,
        typeunit = EXCLUDED.typeunit,
        hpmtypeunit = EXCLUDED.hpmtypeunit,
        numcode = EXCLUDED.numcode,
        pycode = EXCLUDED.pycode,
        boxmaxnum = EXCLUDED.boxmaxnum,
        medposition = EXCLUDED.medposition,
        med_batch = EXCLUDED.med_batch,
        validate_time = EXCLUDED.validate_time,
        dispense_type = EXCLUDED.dispense_type,
        updated_at = NOW()
      RETURNING *
      `,
      [
        medicine.medicinehisid,
        medicine.medicinenamech,
        medicine.medicinenameen ?? null,
        medicine.medicineunit,
        medicine.medicinestate ?? 1,
        medicine.medfactoryid ?? null,
        medicine.medfactoryname,
        medicine.typeunit,
        medicine.hpmtypeunit,
        medicine.numcode ?? null,
        medicine.pycode,
        medicine.boxmaxnum ?? 1,
        medicine.medposition ?? null,
        medicine.med_batch ?? null,
        medicine.validate_time ?? null,
        medicine.dispense_type ?? 'manual',
      ],
    );
    return res.rows[0];
  }

  // ------------------------------------
  //   Send to machine
  // ------------------------------------

  async sendMedicineToRB1500(
    medicines: MedicineInput[],
  ): Promise<SendMedicineResult> {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'RB1500');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        sentAt: new Date().toISOString(),
      };
    }

    const xml = this.buildSoapEnvelopeForSendMedicineRB1500(medicines);
    console.log('RB1500 SendMedicine XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('SendMedicine'),
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
          ? `Sent ${medicines.length} medicine(s) to machine`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        sentAt: new Date().toISOString(),
      };
    }
  }

  // Structure confirmed working against the real machine: the inner CDATA
  // payload is <medicine><itmlist><changemed>...</changemed></itmlist></medicine>,
  // with field names matching our own medicine_dictionary columns 1:1 — no
  // translation needed here, unlike the earlier DocumentElement/DataTable shape.
  private buildSoapEnvelopeForSendMedicineRB1500(
    medicines: MedicineInput[],
  ): string {
    const changemedXml = medicines
      .map(
        (medicine) => `
                <changemed>
                <medicinehisid>${escapeXml(medicine.medicinehisid)}</medicinehisid>
                <medicinenamech>${escapeXml(medicine.medicinenamech)}</medicinenamech>
                <medicinenameen>${escapeXml(medicine.medicinenameen ?? '')}</medicinenameen>
                <medicineunit>${escapeXml(medicine.medicineunit)}</medicineunit>
                <medicinestate>${escapeXml(medicine.medicinestate ?? 1)}</medicinestate>
                <medfactoryid>${escapeXml(medicine.medfactoryid ?? '')}</medfactoryid>
                <medfactoryname>${escapeXml(medicine.medfactoryname)}</medfactoryname>
                <typeunit>${escapeXml(medicine.typeunit)}</typeunit>
                <hpmtypeunit>${escapeXml(medicine.hpmtypeunit)}</hpmtypeunit>
                <numcode>${escapeXml(medicine.numcode ?? '')}</numcode>
                <pycode>${escapeXml(medicine.pycode)}</pycode>
                <boxmaxnum>${escapeXml(medicine.boxmaxnum ?? 1)}</boxmaxnum>
                <medposition>${escapeXml(medicine.medposition ?? '')}</medposition>
                <med_batch>${escapeXml(medicine.med_batch ?? '')}</med_batch>
                <validate_time>${escapeXml(medicine.validate_time ?? '')}</validate_time>
                </changemed>`,
      )
      .join('');

    const medicineXml = `
            <medicine>
            <itmlist>${changemedXml}
            </itmlist>
            </medicine>
      `;
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:SendMedicine xmlns:tns="http://tempuri.org/">
      <tns:str><![CDATA[${medicineXml}]]></tns:str>
    </tns:SendMedicine>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // NZP360's SendMedicine contract, given as a working sample envelope but not
  // yet confirmed against the real machine (unlike sendMedicineToRB1500,
  // which was verified field-by-field over Postman) — check this first if
  // calls to it start failing. Note the different inner shape vs RB1500:
  // DocumentElement/DataTable (GB2312-declared) instead of medicine/itmlist,
  // and a smaller, differently-named field set (no hpmtypeunit, medposition,
  // med_batch, or validate_time on this machine).
  async sendMedicineToNZP360(
    medicines: MedicineInput[],
  ): Promise<SendMedicineResult> {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'NZP360');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        sentAt: new Date().toISOString(),
      };
    }

    const xml = this.buildSoapEnvelopeForSendMedicineNZP360(medicines);
    console.log('NZP360 SendMedicine XML:', xml);
    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('SendMedicine', 'RssServer'),
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
          ? `Sent ${medicines.length} medicine(s) to machine`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        sentAt: new Date().toISOString(),
      };
    }
  }

  private buildSoapEnvelopeForSendMedicineNZP360(
    medicines: MedicineInput[],
  ): string {
    const dataTableXml = medicines
      .map(
        (medicine) => `
    <DataTable>
        <Medicine_His_Id>${escapeXml(medicine.medicinehisid)}</Medicine_His_Id>
        <Medicine_Name_CH>${escapeXml(medicine.medicinenamech)}</Medicine_Name_CH>
        <Medicine_Name_EN>${escapeXml(medicine.medicinenameen ?? '')}</Medicine_Name_EN>
        <Medicine_Unit>${escapeXml(medicine.medicineunit)}</Medicine_Unit>
        <Medicine_State>${escapeXml(medicine.medicinestate ?? 1)}</Medicine_State>
        <Med_Factory>${escapeXml(medicine.medfactoryname)}</Med_Factory>
        <Med_Factory_ID>${escapeXml(medicine.medfactoryid ?? '')}</Med_Factory_ID>
        <Type_Unit>${escapeXml(medicine.typeunit)}</Type_Unit>
        <med_unit_capacity>${escapeXml(medicine.med_unit_capacity ?? 1)}</med_unit_capacity>
        <Num_Code>${escapeXml(medicine.numcode ?? '')}</Num_Code>
        <py_code>${escapeXml(medicine.pycode)}</py_code>
        <Box_max_num>${escapeXml(medicine.boxmaxnum ?? 1)}</Box_max_num>
    </DataTable>`,
      )
      .join('');

    const medXml = `<?xml version="1.0" encoding="GB2312"?>
<DocumentElement>${dataTableXml}
</DocumentElement>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:SendMedicine xmlns:tns="RssServer">
      <tns:Med_XML><![CDATA[${medXml}]]></tns:Med_XML>
    </tns:SendMedicine>
  </soap12:Body>
</soap12:Envelope>`;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
