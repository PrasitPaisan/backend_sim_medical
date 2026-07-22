import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  buildSoapContentType,
  escapeXml,
  getMachineTarget,
  parseMachineResult,
} from '../common/soap.util';
import { createPool } from '../common/db.util';

export type DepartmentInput = {
  deptcode: string;
  deptname: string;
  deptpy: string;
};

export type DeptInfoInput = {
  deptCode: string;
  deptName: string;
  deptPyCode: string;
};

export type SendDeptInfoResult = {
  ok: boolean;
  status?: number;
  machineTarget: string | null;
  message: string;
  sentAt: string;
};

@Injectable()
export class DepartmentsService implements OnModuleDestroy {
  private pool: Pool;

  constructor(private config: ConfigService) {
    this.pool = createPool(this.config);
  }

  async findAll(limit = 100) {
    const res = await this.pool.query(
      'SELECT * FROM department_dictionary ORDER BY dept_name ASC LIMIT $1',
      [limit],
    );
    return res.rows;
  }

  // Entry point for the Add Department form: departments are only written
  // to department_dictionary once NZP360 itself has confirmed the whole
  // batch via <Result>0</Result> — a department the machine rejected must
  // not appear saved locally, since the machine's own dictionary is what
  // prescriptions actually get validated against downstream. All-or-nothing,
  // same as medicines' /send: one SOAP call for every department passed in.
  async createDepartments(departments: DepartmentInput[]) {
    const sendResult = await this.sendDeptInfoToNZP360(
      departments.map((department) => ({
        deptCode: department.deptcode,
        deptName: department.deptname,
        deptPyCode: department.deptpy,
      })),
    );

    if (!sendResult.ok) {
      throw new BadRequestException(
        `NZP360 rejected the department(s): ${sendResult.message}`,
      );
    }

    const saved = await Promise.all(
      departments.map((department) =>
        this.upsertDepartment(department, 'synced'),
      ),
    );

    return { ...sendResult, departments: saved };
  }

  // Persists departments straight to department_dictionary with no machine
  // call at all — lets a department be prepared ahead of time and dispatched
  // later by reselecting it from the Departments list (see createDepartments).
  async saveDepartments(departments: DepartmentInput[]) {
    const saved = await Promise.all(
      departments.map((department) =>
        this.upsertDepartment(department, 'pending'),
      ),
    );

    return {
      ok: true,
      message: `Saved ${saved.length} department(s) to the database`,
      departments: saved,
    };
  }

  // syncStatus is 'synced' once the real machine has confirmed it (see
  // createDepartments), or 'pending' when it's only been saved locally via
  // saveDepartments. The CASE guard means a plain local save can never
  // downgrade a row that's already 'synced' back to 'pending'.
  async upsertDepartment(
    department: DepartmentInput,
    syncStatus: 'pending' | 'synced' = 'synced',
  ) {
    const res = await this.pool.query(
      `
      INSERT INTO department_dictionary (dept_code, dept_name, dept_py, sync_status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (dept_code) DO UPDATE SET
        dept_name = EXCLUDED.dept_name,
        dept_py = EXCLUDED.dept_py,
        sync_status = CASE
          WHEN department_dictionary.sync_status = 'synced' THEN 'synced'
          ELSE EXCLUDED.sync_status
        END,
        updated_at = NOW()
      RETURNING *
      `,
      [department.deptcode, department.deptname, department.deptpy, syncStatus],
    );
    return res.rows[0];
  }

  // ------------------------------------
  //   Send to machine
  // ------------------------------------

  // Builds the exact SOAP envelope sendDeptInfoToNZP360 would send, without
  // actually sending it — reuses the same private builder so the preview
  // shown to the user before confirming can never drift from the real call.
  buildSoapEnvelopeForPreview(depts: DeptInfoInput[]): string {
    return this.buildSoapEnvelopeForSendDeptInfoNZP360(depts);
  }

  async sendDeptInfoToNZP360(
    depts: DeptInfoInput[],
  ): Promise<SendDeptInfoResult> {
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

    const xml = this.buildSoapEnvelopeForSendDeptInfoNZP360(depts);
    console.log('NZP360 SendDeptInfo XML:', xml);

    try {
      const response = await fetch(machineTarget, {
        method: 'POST',
        headers: {
          'Content-Type': buildSoapContentType('SendDeptInfo', 'RssServer'),
        },
        body: xml,
      });

      // The machine replies HTTP 200 even on failure — the real outcome is in the body.
      const responseText = await response.text();
      console.log('NZP360 SendDeptInfo response:', responseText);
      const machineResult = parseMachineResult(responseText);

      return {
        ok: response.ok && machineResult.success,
        status: response.status,
        machineTarget,
        message: machineResult.success
          ? `Sent ${depts.length} department(s) to machine`
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

  // NZP360's SendDeptInfo contract, given as a working sample envelope — not
  // yet confirmed against the real machine (unlike RB1500's SendPrescription,
  // which was verified field-by-field). Supports multiple departments as
  // sibling <Dept_info> blocks per the sample.
  private buildSoapEnvelopeForSendDeptInfoNZP360(
    depts: DeptInfoInput[],
  ): string {
    const deptInfoXml = depts
      .map(
        (dept) => `
  <Dept_info>
    <DEPT_CODE>${escapeXml(dept.deptCode)}</DEPT_CODE>
    <DEPT_NAME>${escapeXml(dept.deptName)}</DEPT_NAME>
    <DEPT_PY>${escapeXml(dept.deptPyCode)}</DEPT_PY>
  </Dept_info>`,
      )
      .join('');

    const deptXml = `<?xml version="1.0" encoding="GB2312"?>
<DocumentElement>${deptInfoXml}
</DocumentElement>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <tns:SendDeptInfo xmlns:tns="RssServer">
      <tns:DeptInfo_XML><![CDATA[${deptXml}]]></tns:DeptInfo_XML>
    </tns:SendDeptInfo>
  </soap12:Body>
</soap12:Envelope>`;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
