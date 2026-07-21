import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildSoapContentType,
  escapeXml,
  extractTagValues,
  getMachineTarget,
  parseMachineResult,
} from '../common/soap.util';

// Machine-only calls that don't belong to any single business entity
// (prescription/medicine/department) — they're either read-only queries
// against RB1500's own state or direct machine mutations, with no
// corresponding database read/write here. Kept separate from
// PrescriptionsService so that service can stay about prescription_header/
// prescription_detail CRUD, not arbitrary machine calls.
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
      console.log('RB1500 QueryBasket response:', responseText);
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
    console.log('RB1500 GetMachineStatus XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('GetMachineStatus'),
        },
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log('RB1500 GetMachineStatus response:', responseText);
      const machineResult = parseMachineResult(responseText);

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Fetched status for machine ${machineId}`
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

  // Sample envelope only — NOT confirmed against the real machine yet
  // (unlike SendPrescription's RB1500 shape, which was verified field-by-
  // field). Two things need checking first if this starts failing:
  // 1. The inner Root/Body/MachineId/Timestamp document is assumed to be
  //    CDATA-wrapped inside <tns:str>, mirroring SendPrescription/
  //    SendMedicine's inner-document convention — but the sample given
  //    doesn't show the outer soap12:Envelope, so this is a guess, not a
  //    confirmed shape (could instead be flat params like QueryBasket's
  //    str/type, or a different operation/param name entirely).
  // 2. The inner document's encoding="utf-16" is preserved as given even
  //    though every other RB1500 inner document declares utf-8 — NZP360's
  //    inner documents differ from their outer envelope's encoding too
  //    (GB2312 vs utf-8), so this isn't unprecedented, but it's still
  //    unconfirmed whether RB1500 actually expects utf-16 here specifically.
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
    <tns:GetMachineStatus xmlns:tns="http://tempuri.org/">
      <tns:str><![CDATA[${statusXml}]]></tns:str>
    </tns:GetMachineStatus>
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
      console.log('RB1500 UpdateReadyPrescriptionState response:', responseText);
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
}
