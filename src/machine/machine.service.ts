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
}
