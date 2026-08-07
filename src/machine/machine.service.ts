import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildNzp360Headers,
  buildSoapContentType,
  escapeXml,
  extractRepeatedBlocks,
  extractTagValues,
  getMachineTarget,
  parseMachineResult,
  unescapeXmlEntities,
} from '../common/soap.util';

// Machine-only calls that don't belong to any single business entity
// (prescription/medicine/department) — they're either read-only queries
// against RB1500's own state or direct machine mutations, with no
// corresponding database read/write here. Kept separate from
// PrescriptionsService so that service can stay about prescription_header/
// prescription_detail CRUD, not arbitrary machine calls.

// taskState: 0 Unprocessed new task, 1 Received, 2 Process complete, 3
// Process failed — see updateCobotTaskOnRB1500.
export type UpdateCobotTaskInput = {
  machineId: number;
  cobotId: string;
  taskNo: string;
  taskState: number;
  taskErrorId?: number;
  taskMessage?: string;
};

// Position: 1 Binding card position, 2 Manual replenishment position,
// 3 NZP360 dispensing position, 4 T type exit, 5 COBOT dispensing position —
// RB1500's own numbering, confirmed to run 1-5 only (the machine does not
// report Idle/0 or End/6 at all). Deliberately NOT the same scale as this
// backend's basket.station_status (they diverge at 2/3/4), so never map one
// onto the other. See queryBasketPositionFromRB1500.
export type BasketPositionItem = {
  basketId?: string;
  preNo?: string;
  splitNo?: string;
  position?: number;
  lastTime?: string;
};

// Mirrors QueryInventory's <InventoryItem> fields. IsShortage is kept as the
// raw '0'/'1' string from the machine rather than coerced to boolean here —
// let the frontend decide how to render it, same as the other RB1500 fields
// in this file.
export type InventoryItem = {
  locationCode?: string;
  medHisId?: string;
  medName?: string;
  medSpecs?: string;
  medFactory?: string;
  medUnit?: string;
  currentQuantity?: string;
  maximumQuantity?: string;
  shortagePercentage?: string;
  isShortage?: string;
};

// Mirrors NZP360's QueryPackagedInfo <PackagedItem>/<PackagedMedItem> fields
// (ATDPS doc §3.7.1) — one packaged pouch, with the medicines packed into
// it. See queryPackagedInfoFromNZP360.
export type PackagedMedItem = {
  medCode?: string;
  medNumber?: string;
  nursingCode?: string;
};

export type PackagedItem = {
  packId?: string;
  patId?: string;
  exeTime?: string;
  orderNo?: string;
  orderPre?: string;
  deptCode?: string;
  medList: PackagedMedItem[];
};

// Mirrors NZP360's Nursing <PrescriptionMedicine> fields (ATDPS doc §3.4.3) —
// one drug line belonging to the prescription identified by the drug bag's
// 2D code (KF[MZNO]_[RCPreId] — see nursingFromNZP360). Flat, non-nested, so
// parsed the same way queryCobotTaskFromRB1500's DataTable fields are.
export type NursingPrescriptionMedicineItem = {
  medbag2DCode?: string;
  deptName?: string;
  deptCode?: string;
  bedNo?: string;
  atfAdministration?: string;
  doctor?: string;
  patientId?: string;
  patientName?: string;
  patientAge?: string;
  orderCode?: string;
  orderText?: string;
  firmName?: string;
  orderUnit?: string;
  typeUnit?: string;
  medNum?: string;
  finishTime?: string;
  doctorName?: string;
  visitId?: string;
};

@Injectable()
export class MachineService {
  constructor(private config: ConfigService) {}

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
      console.log('RB1500 QueryReadyPrescription response:', responseText);
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

  // Builds the exact SOAP envelope queryReadyPrescriptionsFromRB1500 would
  // send, without actually sending it — reuses the same private builder so
  // the preview shown to the user before confirming can never drift from
  // the real call. Takes no params since the envelope itself is static.
  buildSoapEnvelopeForQueryReadyPrescriptionPreview(): string {
    return this.buildSoapEnvelopeForQueryReadyPrescriptionRB1500();
  }

  private buildSoapEnvelopeForQueryReadyPrescriptionRB1500() {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:QueryReadyPrescription xmlns:tns="http://tempuri.org/"/>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Asks the machine for the basket bound to a prescription — despite the
  // name this isn't purely read-only: `type` doubles as a lighting command
  // (per RB1500's spec): 1 = light the basket blue, 2 = green, 3 = red,
  // anything else = plain query with no lighting side effect. `str` is the
  // prescriptionhisid (RB1500 calls it "unique number of prescription in
  // HIS"). No database reads or writes on our side either way.
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
      console.log('RB1500 QueryBasket response:', responseText);
      const machineResult = parseMachineResult(responseText);

      // DataTable's fields mirror prescription_header columns almost 1:1
      // (patient_name/fetch_window/delete_flag/basket_Id/finish_time) —
      // confirmed via a real error-case capture (Result=-1, "PrescriptionID
      // not exist!" when str isn't a prescriptionhisid RB1500 recognizes).
      const patientName = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'patient_name')[0]
        : undefined;
      const fetchWindow = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'fetch_window')[0]
        : undefined;
      const deleteFlag = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'delete_flag')[0]
        : undefined;
      const basketId = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'basket_Id')[0]
        : undefined;
      const finishTime = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'finish_time')[0]
        : undefined;

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Queried basket for ${str}`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        patientName,
        fetchWindow,
        deleteFlag,
        basketId,
        finishTime,
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

  // Builds the exact SOAP envelope queryBasketFromRB1500 would send, without
  // actually sending it — reuses the same private builder so the preview
  // shown to the user before confirming can never drift from the real call.
  buildSoapEnvelopeForQueryBasketPreview(str: string, type: string): string {
    return this.buildSoapEnvelopeForQueryBasketRB1500(str, type);
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

  // Asks RB1500 for its own machine status (online/health-check style call,
  // distinct from QueryBasket/QueryReadyPrescription which ask about specific
  // prescriptions/baskets) — read-only against the machine, no database
  // reads or writes here, same as the other RB1500 query methods.
  async getMachineStatusFromRB1500(machineId: number) {
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

    const xml = this.buildSoapEnvelopeForGetMachineStatusRB1500(machineId);
    console.log('RB1500 QueryMachineState XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('QueryMachineState'),
        },
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log('RB1500 QueryMachineState response:', responseText);
      const machineResult = parseMachineResult(responseText);

      // The machine wraps its DataTable in literal "<![CDATA[" / "]]>" text
      // rather than actual XML CDATA (see the raw response) — extractTagValues'
      // plain regex match still finds MachineState/MachineMessage fine
      // either way, since it doesn't care about surrounding text.
      const machineState = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'MachineState')[0]
        : undefined;
      const machineMessage = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'MachineMessage')[0]
        : undefined;

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Fetched status for machine ${machineId}`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        machineState,
        machineMessage,
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

  // The real operation name is QueryMachineState, not GetMachineStatus —
  // confirmed by the machine's own SOAP fault when called under the wrong
  // name ("无法识别操作 GetMachineStatus"). The inner Root/Body/MachineId/
  // Timestamp document (utf-16, CDATA-wrapped inside <tns:str>) was already
  // confirmed separately and is unchanged; only the operation name/action
  // was wrong.
  // Builds the exact SOAP envelope getMachineStatusFromRB1500 would send,
  // without actually sending it — reuses the same private builder so the
  // preview shown to the user before confirming can never drift from the
  // real call.
  buildSoapEnvelopeForGetMachineStatusPreview(machineId: number): string {
    return this.buildSoapEnvelopeForGetMachineStatusRB1500(machineId);
  }

  private buildSoapEnvelopeForGetMachineStatusRB1500(machineId: number) {
    const now = new Date();
    const pad2 = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const statusXml = `<?xml version="1.0" encoding="utf-16"?>
<Root>
<Body>
<MachineId>${escapeXml(machineId)}</MachineId>
<Timestamp>${escapeXml(timestamp)}</Timestamp>
</Body>
</Root>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:QueryMachineState xmlns:tns="http://tempuri.org/">
      <tns:str><![CDATA[${statusXml}]]></tns:str>
    </tns:QueryMachineState>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // NZP360's QueryMachineState (ATDPS doc §3.6) — same Root/Body/MachineId/
  // Timestamp input as RB1500's above, but its response additionally carries
  // a PartList/PartItem breakdown (PartName/PartId/PartState/PartMessage)
  // that RB1500's QueryMachineState doesn't have — parsed with
  // extractRepeatedBlocks the same way QueryInventory's InventoryItem list
  // is. Not yet confirmed against the real machine (sample envelope only).
  async getMachineStatusFromNZP360(machineId: number) {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'NZP360');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        queriedAt: new Date().toISOString(),
      };
    }

    const xml = this.buildSoapEnvelopeForGetMachineStatusNZP360(machineId);
    console.log('NZP360 QueryMachineState XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: buildNzp360Headers(this.config, 'QueryMachineState'),
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log(
        'NZP360 QueryMachineState response:',
        unescapeXmlEntities(responseText),
      );
      const machineResult = parseMachineResult(responseText);

      const machineState = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'MachineState')[0]
        : undefined;
      const machineMessage = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'MachineMessage')[0]
        : undefined;
      const parts = machineResult.innerXml
        ? extractRepeatedBlocks(machineResult.innerXml, 'PartItem').map(
            (block) => ({
              partName: extractTagValues(block, 'PartName')[0],
              partId: extractTagValues(block, 'PartId')[0],
              partState: extractTagValues(block, 'PartState')[0],
              partMessage: extractTagValues(block, 'PartMessage')[0],
            }),
          )
        : [];

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Fetched status for machine ${machineId}`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        machineState,
        machineMessage,
        parts,
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

  // Builds the exact SOAP envelope getMachineStatusFromNZP360 would send,
  // without actually sending it — same preview-before-send pattern as
  // buildSoapEnvelopeForGetMachineStatusPreview above.
  buildSoapEnvelopeForGetMachineStatusNZP360Preview(machineId: number): string {
    return this.buildSoapEnvelopeForGetMachineStatusNZP360(machineId);
  }

  private buildSoapEnvelopeForGetMachineStatusNZP360(machineId: number) {
    const now = new Date();
    const pad2 = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const statusXml = `<?xml version="1.0" encoding="utf-16"?>
<Root>
<Body>
<MachineId>${escapeXml(machineId)}</MachineId>
<Timestamp>${escapeXml(timestamp)}</Timestamp>
</Body>
</Root>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:QueryMachineState xmlns:tns="RssServer">
      <tns:str><![CDATA[${statusXml}]]></tns:str>
    </tns:QueryMachineState>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // NZP360's QueryPackagedInfo (ATDPS doc §3.7.1) — plays the same role as
  // RB1500's QueryReadyPrescription: detects which pouches NZP360 has
  // finished packaging, for the pharmacist to review before acknowledging
  // via updatePackagedInfoOnNZP360 below. Read-only against the machine, no
  // database reads/writes here. Each pouch's nested MedList/PackagedMedItem
  // is parsed the same way QueryInventory's InventoryItem list is (via
  // extractRepeatedBlocks), run once more within each PackagedItem block to
  // pull out its medicines. Not yet confirmed against the real machine
  // (sample envelope only).
  async queryPackagedInfoFromNZP360(machineId: number) {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'NZP360');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        pouches: [] as PackagedItem[],
        queriedAt: new Date().toISOString(),
      };
    }

    const xml = this.buildSoapEnvelopeForQueryPackagedInfoNZP360(machineId);
    console.log('NZP360 QueryPackagedInfo XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: buildNzp360Headers(this.config, 'QueryPackagedInfo'),
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log(
        'NZP360 QueryPackagedInfo response:',
        unescapeXmlEntities(responseText),
      );
      const machineResult = parseMachineResult(responseText);

      const pouches: PackagedItem[] = machineResult.innerXml
        ? extractRepeatedBlocks(machineResult.innerXml, 'PackagedItem').map(
            (block) => ({
              packId: extractTagValues(block, 'PackId')[0],
              patId: extractTagValues(block, 'PatId')[0],
              exeTime: extractTagValues(block, 'ExeTime')[0],
              orderNo: extractTagValues(block, 'OrderNo')[0],
              orderPre: extractTagValues(block, 'OrderPre')[0],
              deptCode: extractTagValues(block, 'DeptCode')[0],
              medList: extractRepeatedBlocks(block, 'PackagedMedItem').map(
                (medBlock) => ({
                  medCode: extractTagValues(medBlock, 'MedCode')[0],
                  medNumber: extractTagValues(medBlock, 'MedNumber')[0],
                  nursingCode: extractTagValues(medBlock, 'NursingCode')[0],
                }),
              ),
            }),
          )
        : [];

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Fetched ${pouches.length} packaged pouch(es)`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        pouches,
        raw: responseText,
        queriedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        pouches: [] as PackagedItem[],
        queriedAt: new Date().toISOString(),
      };
    }
  }

  // Builds the exact SOAP envelope queryPackagedInfoFromNZP360 would send,
  // without actually sending it — same preview-before-send pattern as the
  // other NZP360/RB1500 query builders.
  buildSoapEnvelopeForQueryPackagedInfoNZP360Preview(
    machineId: number,
  ): string {
    return this.buildSoapEnvelopeForQueryPackagedInfoNZP360(machineId);
  }

  private buildSoapEnvelopeForQueryPackagedInfoNZP360(machineId: number) {
    const now = new Date();
    const pad2 = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const packagedXml = `<?xml version="1.0" encoding="utf-16"?>
<Root>
<Body>
<MachineId>${escapeXml(machineId)}</MachineId>
<Timestamp>${escapeXml(timestamp)}</Timestamp>
</Body>
</Root>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:QueryPackagedInfo xmlns:tns="RssServer">
      <tns:str><![CDATA[${packagedXml}]]></tns:str>
    </tns:QueryPackagedInfo>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // NZP360's UpdatePackagedInfo (ATDPS doc §3.7.2) — QueryPackagedInfo's
  // write counterpart: acknowledges/filters one or more pouches by PackId
  // (the pharmacist reviewing QueryPackagedInfo's list decides which are
  // done being checked). Response carries no DataTable, just Result/Error —
  // same shape as RB1500's ExecEliminatePrescription. Not wired into any
  // database state (machine-only call, same as the other machine-only
  // actions in this file). Not yet confirmed against the real machine
  // (sample envelope only).
  async updatePackagedInfoOnNZP360(machineId: number, packIds: string[]) {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'NZP360');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        updatedAt: new Date().toISOString(),
      };
    }

    const xml = this.buildSoapEnvelopeForUpdatePackagedInfoNZP360(
      machineId,
      packIds,
    );
    console.log('NZP360 UpdatePackagedInfo XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: buildNzp360Headers(this.config, 'UpdatePackagedInfo'),
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log(
        'NZP360 UpdatePackagedInfo response:',
        unescapeXmlEntities(responseText),
      );
      const machineResult = parseMachineResult(responseText);

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Filtered ${packIds.length} packaged pouch(es)`
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

  // Builds the exact SOAP envelope updatePackagedInfoOnNZP360 would send,
  // without actually sending it — same preview-before-send pattern as the
  // other NZP360/RB1500 write builders.
  buildSoapEnvelopeForUpdatePackagedInfoPreview(
    machineId: number,
    packIds: string[],
  ): string {
    return this.buildSoapEnvelopeForUpdatePackagedInfoNZP360(
      machineId,
      packIds,
    );
  }

  private buildSoapEnvelopeForUpdatePackagedInfoNZP360(
    machineId: number,
    packIds: string[],
  ) {
    const now = new Date();
    const pad2 = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const packItemsXml = packIds
      .map(
        (packId) =>
          `<PackItem><PackId>${escapeXml(packId)}</PackId></PackItem>`,
      )
      .join('');

    const updateXml = `<?xml version="1.0" encoding="utf-16"?>
<Root>
<Body>
<MachineId>${escapeXml(machineId)}</MachineId>
<PackList>${packItemsXml}</PackList>
<Timestamp>${escapeXml(timestamp)}</Timestamp>
</Body>
</Root>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:UpdatePackagedInfo xmlns:tns="RssServer">
      <tns:str><![CDATA[${updateXml}]]></tns:str>
    </tns:UpdatePackagedInfo>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Asks RB1500 which task a given COBOT should work on next — read-only
  // against the machine, no database reads or writes here, same as the other
  // RB1500 query methods. Same inner-document shape as QueryMachineState
  // (Root/Body/..., utf-16 declared, CDATA-wrapped inside <tns:str>) plus a
  // CobotId field identifying which physical COBOT unit is asking.
  async queryCobotTaskFromRB1500(machineId: number, cobotId: string) {
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

    const xml = this.buildSoapEnvelopeForQueryCobotTaskRB1500(
      machineId,
      cobotId,
    );
    console.log('RB1500 QueryCOBOTTask XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('QueryCOBOTTask'),
        },
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log('RB1500 QueryCOBOTTask response:', responseText);
      const machineResult = parseMachineResult(responseText);

      // Only the flat identifying fields are pulled out individually — the
      // rest of the task (MedicineList/MedicineItem, nested) is left in
      // innerXml for the caller to read, same as queryBasketFromRB1500 does,
      // since extractTagValues only handles flat repeated tags cleanly.
      const taskNo = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'TaskNo')[0]
        : undefined;
      const preHisId = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'PreHisId')[0]
        : undefined;
      const preId = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'PreId')[0]
        : undefined;
      const basketId = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'BasketId')[0]
        : undefined;
      const splitId = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'SplitId')[0]
        : undefined;

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Fetched COBOT task for ${cobotId}`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        taskNo,
        preHisId,
        preId,
        basketId,
        splitId,
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

  // Builds the exact SOAP envelope queryCobotTaskFromRB1500 would send,
  // without actually sending it — reuses the same private builder so the
  // preview shown to the user before confirming can never drift from the
  // real call.
  buildSoapEnvelopeForQueryCobotTaskPreview(
    machineId: number,
    cobotId: string,
  ): string {
    return this.buildSoapEnvelopeForQueryCobotTaskRB1500(machineId, cobotId);
  }

  private buildSoapEnvelopeForQueryCobotTaskRB1500(
    machineId: number,
    cobotId: string,
  ) {
    const now = new Date();
    const pad2 = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const taskXml = `<?xml version="1.0" encoding="utf-16"?>
<Root>
<Body>
<MachineId>${escapeXml(machineId)}</MachineId>
<CobotId>${escapeXml(cobotId)}</CobotId>
<Timestamp>${escapeXml(timestamp)}</Timestamp>
</Body>
</Root>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:QueryCOBOTTask xmlns:tns="http://tempuri.org/">
      <tns:str><![CDATA[${taskXml}]]></tns:str>
    </tns:QueryCOBOTTask>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Bulk query — unlike queryBasketFromRB1500 (one prescription at a time),
  // this asks for every basket that's moved within the last `withinTime`
  // seconds in one call (spec recommends 300s / 5 min, polled every 5s if
  // you were polling continuously — this backend only calls it on-demand,
  // from a "Fetch live position" button on Process Tracking, not on a
  // timer). Read-only, no database reads or writes here — the frontend
  // matches each BasketItem.preNo against its own tracked prescriptionhisid
  // itself rather than this backend trying to reconcile the two.
  async queryBasketPositionFromRB1500(withinTimeSeconds: number) {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'RB1500');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        items: [] as BasketPositionItem[],
        queriedAt: new Date().toISOString(),
      };
    }

    const xml =
      this.buildSoapEnvelopeForQueryBasketPositionRB1500(withinTimeSeconds);
    console.log('RB1500 QueryBasketPosition XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('QueryBasketPosition'),
        },
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log('RB1500 QueryBasketPosition response:', responseText);
      const machineResult = parseMachineResult(responseText);

      const items: BasketPositionItem[] = machineResult.innerXml
        ? extractRepeatedBlocks(machineResult.innerXml, 'BasketItem').map(
            (block) => {
              const position = extractTagValues(block, 'Position')[0];
              return {
                basketId: extractTagValues(block, 'BasketId')[0],
                preNo: extractTagValues(block, 'PreNo')[0],
                splitNo: extractTagValues(block, 'SplitNo')[0],
                position: position !== undefined ? Number(position) : undefined,
                lastTime: extractTagValues(block, 'LastTime')[0],
              };
            },
          )
        : [];

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Fetched position for ${items.length} basket(s)`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        items,
        raw: responseText,
        queriedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        items: [] as BasketPositionItem[],
        queriedAt: new Date().toISOString(),
      };
    }
  }

  // Builds the exact SOAP envelope queryBasketPositionFromRB1500 would send,
  // without actually sending it — reuses the same private builder so the
  // preview shown to the user before confirming can never drift from the
  // real call.
  buildSoapEnvelopeForQueryBasketPositionPreview(
    withinTimeSeconds: number,
  ): string {
    return this.buildSoapEnvelopeForQueryBasketPositionRB1500(
      withinTimeSeconds,
    );
  }

  private buildSoapEnvelopeForQueryBasketPositionRB1500(
    withinTimeSeconds: number,
  ) {
    const now = new Date();
    const pad2 = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const positionXml = `<?xml version="1.0" encoding="utf-16"?>
<Root>
<Body>
<WithinTime>${escapeXml(withinTimeSeconds)}</WithinTime>
<Timestamp>${escapeXml(timestamp)}</Timestamp>
</Body>
</Root>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:QueryBasketPosition xmlns:tns="http://tempuri.org/">
      <tns:str><![CDATA[${positionXml}]]></tns:str>
    </tns:QueryBasketPosition>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Asks RB1500 for its current medication inventory — read-only, no
  // database reads or writes here. operation: 1 query shortage inventory,
  // 2 query inventory summary, 3 query inventory details (see spec).
  async queryInventoryFromRB1500(machineId: number, operation: number) {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'RB1500');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        items: [] as InventoryItem[],
        queriedAt: new Date().toISOString(),
      };
    }

    const xml = this.buildSoapEnvelopeForQueryInventoryRB1500(
      machineId,
      operation,
    );
    console.log('RB1500 QueryInventory XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('QueryInventory'),
        },
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log('RB1500 QueryInventory response:', responseText);
      const machineResult = parseMachineResult(responseText);

      const items: InventoryItem[] = machineResult.innerXml
        ? extractRepeatedBlocks(machineResult.innerXml, 'InventoryItem').map(
            (block) => ({
              locationCode: extractTagValues(block, 'LocationCode')[0],
              medHisId: extractTagValues(block, 'MedHisId')[0],
              medName: extractTagValues(block, 'MedName')[0],
              medSpecs: extractTagValues(block, 'MedSpecs')[0],
              medFactory: extractTagValues(block, 'MedFactory')[0],
              medUnit: extractTagValues(block, 'MedUnit')[0],
              currentQuantity: extractTagValues(block, 'CurrentQuantity')[0],
              maximumQuantity: extractTagValues(block, 'MaximumQuantity')[0],
              shortagePercentage: extractTagValues(
                block,
                'ShortagePercentage',
              )[0],
              isShortage: extractTagValues(block, 'IsShortage')[0],
            }),
          )
        : [];

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Fetched inventory for ${items.length} medicine(s)`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        items,
        raw: responseText,
        queriedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        items: [] as InventoryItem[],
        queriedAt: new Date().toISOString(),
      };
    }
  }

  // Builds the exact SOAP envelope queryInventoryFromRB1500 would send,
  // without actually sending it — reuses the same private builder so the
  // preview shown to the user before confirming can never drift from the
  // real call.
  buildSoapEnvelopeForQueryInventoryPreview(
    machineId: number,
    operation: number,
  ): string {
    return this.buildSoapEnvelopeForQueryInventoryRB1500(machineId, operation);
  }

  private buildSoapEnvelopeForQueryInventoryRB1500(
    machineId: number,
    operation: number,
  ) {
    const now = new Date();
    const pad2 = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const inventoryXml = `<?xml version="1.0" encoding="utf-16"?>
<Root>
<Body>
<MachineId>${escapeXml(machineId)}</MachineId>
<Operation>${escapeXml(operation)}</Operation>
<Timestamp>${escapeXml(timestamp)}</Timestamp>
</Body>
</Root>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:QueryInventory xmlns:tns="http://tempuri.org/">
      <tns:str><![CDATA[${inventoryXml}]]></tns:str>
    </tns:QueryInventory>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // NZP360's QueryInventory (ATDPS integration doc §3.5) — same Root/Body/
  // MachineId/Operation/Timestamp input and InventoryList/InventoryItem
  // output shape as RB1500's QueryInventory above (field names identical),
  // just a different machine/envelope namespace. operation: 1 query shortage
  // inventory, 2 query inventory summary, 3 query inventory details. Not yet
  // confirmed against the real machine (sample envelope only).
  async queryInventoryFromNZP360(machineId: number, operation: number) {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'NZP360');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        items: [] as InventoryItem[],
        queriedAt: new Date().toISOString(),
      };
    }

    const xml = this.buildSoapEnvelopeForQueryInventoryNZP360(
      machineId,
      operation,
    );
    console.log('NZP360 QueryInventory XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: buildNzp360Headers(this.config, 'QueryInventory'),
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log(
        'NZP360 QueryInventory response:',
        unescapeXmlEntities(responseText),
      );
      const machineResult = parseMachineResult(responseText);

      const items: InventoryItem[] = machineResult.innerXml
        ? extractRepeatedBlocks(machineResult.innerXml, 'InventoryItem').map(
            (block) => ({
              locationCode: extractTagValues(block, 'LocationCode')[0],
              medHisId: extractTagValues(block, 'MedHisId')[0],
              medName: extractTagValues(block, 'MedName')[0],
              medSpecs: extractTagValues(block, 'MedSpecs')[0],
              medFactory: extractTagValues(block, 'MedFactory')[0],
              medUnit: extractTagValues(block, 'MedUnit')[0],
              currentQuantity: extractTagValues(block, 'CurrentQuantity')[0],
              maximumQuantity: extractTagValues(block, 'MaximumQuantity')[0],
              shortagePercentage: extractTagValues(
                block,
                'ShortagePercentage',
              )[0],
              isShortage: extractTagValues(block, 'IsShortage')[0],
            }),
          )
        : [];

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Fetched inventory for ${items.length} medicine(s)`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        items,
        raw: responseText,
        queriedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        items: [] as InventoryItem[],
        queriedAt: new Date().toISOString(),
      };
    }
  }

  // Builds the exact SOAP envelope queryInventoryFromNZP360 would send,
  // without actually sending it — same preview-before-send pattern as
  // buildSoapEnvelopeForQueryInventoryPreview above.
  buildSoapEnvelopeForQueryInventoryNZP360Preview(
    machineId: number,
    operation: number,
  ): string {
    return this.buildSoapEnvelopeForQueryInventoryNZP360(machineId, operation);
  }

  private buildSoapEnvelopeForQueryInventoryNZP360(
    machineId: number,
    operation: number,
  ) {
    const now = new Date();
    const pad2 = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const inventoryXml = `<?xml version="1.0" encoding="utf-16"?>
<Root>
<Body>
<MachineId>${escapeXml(machineId)}</MachineId>
<Operation>${escapeXml(operation)}</Operation>
<Timestamp>${escapeXml(timestamp)}</Timestamp>
</Body>
</Root>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:QueryInventory xmlns:tns="RssServer">
      <tns:str><![CDATA[${inventoryXml}]]></tns:str>
    </tns:QueryInventory>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Tells RB1500 a COBOT has finished (or failed) working on a task — this is
  // what actually lets RB1500 carry the basket onward past the COBOT
  // station, the software counterpart of "the physical arm is done, go
  // ahead." Same inner-document shape as queryCobotTaskFromRB1500 (Root/
  // Body/..., utf-16 declared, CDATA-wrapped inside <tns:str>), plus the
  // task outcome fields. Unlike QueryCOBOTTask, the response carries no
  // DataTable — just Result/Error, same shape as ExecEliminatePrescription.
  // Not wired into any database state yet — machine-only call for now.
  async updateCobotTaskOnRB1500(input: UpdateCobotTaskInput) {
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

    const xml = this.buildSoapEnvelopeForUpdateCobotTaskRB1500(input);
    console.log('RB1500 UpdateCOBOTTask XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('UpdateCOBOTTask'),
        },
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log('RB1500 UpdateCOBOTTask response:', responseText);
      const machineResult = parseMachineResult(responseText);

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Updated task ${input.taskNo} to state ${input.taskState}`
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

  // Builds the exact SOAP envelope updateCobotTaskOnRB1500 would send,
  // without actually sending it — reuses the same private builder so the
  // preview shown to the user before confirming can never drift from the
  // real call.
  buildSoapEnvelopeForUpdateCobotTaskPreview(
    input: UpdateCobotTaskInput,
  ): string {
    return this.buildSoapEnvelopeForUpdateCobotTaskRB1500(input);
  }

  private buildSoapEnvelopeForUpdateCobotTaskRB1500(
    input: UpdateCobotTaskInput,
  ) {
    const now = new Date();
    const pad2 = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    const taskXml = `<?xml version="1.0" encoding="utf-16"?>
<Root>
<Body>
<MachineId>${escapeXml(input.machineId)}</MachineId>
<CobotId>${escapeXml(input.cobotId)}</CobotId>
<TaskNo>${escapeXml(input.taskNo)}</TaskNo>
<TaskState>${escapeXml(input.taskState)}</TaskState>
<TaskErrorId>${escapeXml(input.taskErrorId ?? 0)}</TaskErrorId>
<TaskMessage>${escapeXml(input.taskMessage ?? '')}</TaskMessage>
<Timestamp>${escapeXml(timestamp)}</Timestamp>
</Body>
</Root>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:UpdateCOBOTTask xmlns:tns="http://tempuri.org/">
      <tns:str><![CDATA[${taskXml}]]></tns:str>
    </tns:UpdateCOBOTTask>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // Tells the machine that a prescription's pharmacist recheck is done — the
  // real-world counterpart of Machine Sim's station 7 (Pharmacist Recheck).
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
      console.log(
        'RB1500 UpdateReadyPrescriptionState response:',
        responseText,
      );
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

  // Builds the exact SOAP envelope updateReadyPrescriptionStateOnRB1500
  // would send, without actually sending it — reuses the same private
  // builder so the preview shown to the user before confirming can never
  // drift from the real call.
  buildSoapEnvelopeForUpdateReadyPrescriptionStatePreview(
    prescriptionhisid: string,
  ): string {
    return this.buildSoapEnvelopeForUpdateReadyPrescriptionStateRB1500(
      prescriptionhisid,
    );
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
      console.log('RB1500 ExecEliminatePrescription response:', responseText);
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

  // Builds the exact SOAP envelope execEliminatePrescriptionOnRB1500 would
  // send, without actually sending it — reuses the same private builder so
  // the preview shown to the user before confirming can never drift from
  // the real call.
  buildSoapEnvelopeForExecEliminatePrescriptionPreview(
    prescriptionhisid: string,
  ): string {
    return this.buildSoapEnvelopeForExecEliminatePrescriptionRB1500(
      prescriptionhisid,
    );
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

  // NZP360's Nursing Interface 1 (ATDPS doc §3.4.3) — given a drug bag's 2D
  // code, returns every PrescriptionMedicine line belonging to it, for a
  // nurse scanning the bag to see what's inside. medbag2DCodeParam1 is the
  // RCPreId part of the bag's KF[MZNO]_[RCPreId] code (NOT the full code —
  // per the doc's field description, e.g. "1000117420" out of
  // "KF259446_1000117420"). Read-only against the machine, no database reads
  // or writes here, same as the other NZP360 query methods. Not yet
  // confirmed against the real machine (doc sample envelope only, and the
  // doc gives no PostMan test for this one specifically — see
  // buildSoapEnvelopeForNursingCodeNZP360 below where a PostMan example does
  // exist and uses a different param tag name).
  async nursingFromNZP360(medbag2DCodeParam1: string) {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'NZP360');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        medications: [] as NursingPrescriptionMedicineItem[],
        queriedAt: new Date().toISOString(),
      };
    }

    const xml = this.buildSoapEnvelopeForNursingNZP360(medbag2DCodeParam1);
    console.log('NZP360 Nursing XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: buildNzp360Headers(this.config, 'Nursing'),
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log(
        'NZP360 Nursing response:',
        unescapeXmlEntities(responseText),
      );
      const machineResult = parseMachineResult(responseText);

      const medications: NursingPrescriptionMedicineItem[] =
        machineResult.innerXml
          ? extractRepeatedBlocks(
              machineResult.innerXml,
              'PrescriptionMedicine',
            ).map((block) => ({
              medbag2DCode: extractTagValues(block, 'Medbag2DCode')[0],
              deptName: extractTagValues(block, 'DEPT_NAME')[0],
              deptCode: extractTagValues(block, 'DEPT_CODE')[0],
              bedNo: extractTagValues(block, 'BED_NO')[0],
              atfAdministration: extractTagValues(
                block,
                'ATF_ADMINISTRATION',
              )[0],
              doctor: extractTagValues(block, 'DOCTOR')[0],
              patientId: extractTagValues(block, 'PATIENT_ID')[0],
              patientName: extractTagValues(block, 'PATIENT_NAME')[0],
              patientAge: extractTagValues(block, 'PATIENT_AGE')[0],
              orderCode: extractTagValues(block, 'ORDER_CODE')[0],
              orderText: extractTagValues(block, 'ORDER_TEXT')[0],
              firmName: extractTagValues(block, 'FIRM_NAME')[0],
              orderUnit: extractTagValues(block, 'ORDER_UNIT')[0],
              typeUnit: extractTagValues(block, 'Type_Unit')[0],
              medNum: extractTagValues(block, 'med_num')[0],
              finishTime: extractTagValues(block, 'finish_time')[0],
              doctorName: extractTagValues(block, 'doctor_name')[0],
              visitId: extractTagValues(block, 'VISIT_ID')[0],
            }))
          : [];

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Fetched ${medications.length} medicine line(s) for ${medbag2DCodeParam1}`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        medications,
        raw: responseText,
        queriedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        medications: [] as NursingPrescriptionMedicineItem[],
        queriedAt: new Date().toISOString(),
      };
    }
  }

  // Builds the exact SOAP envelope nursingFromNZP360 would send, without
  // actually sending it — same preview-before-send pattern as the other
  // NZP360/RB1500 query builders.
  buildSoapEnvelopeForNursingPreview(medbag2DCodeParam1: string): string {
    return this.buildSoapEnvelopeForNursingNZP360(medbag2DCodeParam1);
  }

  private buildSoapEnvelopeForNursingNZP360(medbag2DCodeParam1: string) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:Nursing xmlns:tns="RssServer">
      <tns:Medbag2DCodeParam1>${escapeXml(medbag2DCodeParam1)}</tns:Medbag2DCodeParam1>
    </tns:Nursing>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // NZP360's Nursing Interface 2 (ATDPS doc §3.4.4) — given the same
  // RCPreId param as Nursing above, returns the list of nursing codes HIS
  // has already provided for this drug bag. Read-only against the machine,
  // no database reads or writes here. The doc's own PostMan Test example
  // (§3.4.5) uses body tag <Medbag2DCode> rather than the
  // <Medbag2DCodeParam1> the function signature implies — followed the
  // PostMan example here since it's the more concrete, directly-testable
  // artifact (same tradeoff as the doc's other internal inconsistencies
  // noted elsewhere in this file).
  async nursingCodeFromNZP360(medbag2DCodeParam1: string) {
    let machineTarget: string;
    try {
      machineTarget = getMachineTarget(this.config, 'NZP360');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget: null,
        message: `Unable to reach dispensing machine: ${message}`,
        nursingCodes: [] as string[],
        queriedAt: new Date().toISOString(),
      };
    }

    const xml = this.buildSoapEnvelopeForNursingCodeNZP360(medbag2DCodeParam1);
    console.log('NZP360 NursingCode XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: buildNzp360Headers(this.config, 'NursingCode'),
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log(
        'NZP360 NursingCode response:',
        unescapeXmlEntities(responseText),
      );
      const machineResult = parseMachineResult(responseText);

      const nursingCodes = machineResult.innerXml
        ? extractTagValues(machineResult.innerXml, 'NursingCode')
        : [];

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Fetched ${nursingCodes.length} nursing code(s) for ${medbag2DCodeParam1}`
          : machineResult.error ||
            `Machine responded with HTTP ${response.status}`,
        resultCode: machineResult.resultCode,
        nursingCodes,
        raw: responseText,
        queriedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        ok: false,
        machineTarget,
        message,
        nursingCodes: [] as string[],
        queriedAt: new Date().toISOString(),
      };
    }
  }

  // Builds the exact SOAP envelope nursingCodeFromNZP360 would send, without
  // actually sending it — same preview-before-send pattern as the other
  // NZP360/RB1500 query builders.
  buildSoapEnvelopeForNursingCodePreview(medbag2DCodeParam1: string): string {
    return this.buildSoapEnvelopeForNursingCodeNZP360(medbag2DCodeParam1);
  }

  private buildSoapEnvelopeForNursingCodeNZP360(medbag2DCodeParam1: string) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:NursingCode xmlns:tns="RssServer">
      <tns:Medbag2DCode>${escapeXml(medbag2DCodeParam1)}</tns:Medbag2DCode>
    </tns:NursingCode>
  </soap12:Body>
</soap12:Envelope>`;
  }
}
