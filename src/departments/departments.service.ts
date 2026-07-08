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
    this.pool = new Pool({
      host: this.config.get<string>('DB_HOST') ?? 'localhost',
      port: Number(this.config.get<number>('DB_PORT') ?? 5432),
      user: this.config.get<string>('DB_USER') ?? 'postgres',
      password: this.config.get<string>('DB_PASSWORD') ?? 'postgres',
      database: this.config.get<string>('DB_NAME') ?? 'electronic_shell',
    });
  }

  async findAll(limit = 100) {
    const res = await this.pool.query(
      'SELECT * FROM department_dictionary ORDER BY dept_name ASC LIMIT $1',
      [limit],
    );
    return res.rows;
  }

  // Entry point for the Add Department form: the department is only written
  // to department_dictionary once NZP360 itself has confirmed it via
  // <Result>0</Result> — a department the machine rejected must not appear
  // saved locally, since the machine's own dictionary is what prescriptions
  // actually get validated against downstream.
  async createDepartment(department: DepartmentInput) {
    const sendResult = await this.sendDeptInfoToNZP360([
      {
        deptCode: department.deptcode,
        deptName: department.deptname,
        deptPyCode: department.deptpy,
      },
    ]);

    if (!sendResult.ok) {
      throw new BadRequestException(
        `NZP360 rejected the department: ${sendResult.message}`,
      );
    }

    return this.upsertDepartment(department);
  }

  async upsertDepartment(department: DepartmentInput) {
    const res = await this.pool.query(
      `
      INSERT INTO department_dictionary (dept_code, dept_name, dept_py)
      VALUES ($1, $2, $3)
      ON CONFLICT (dept_code) DO UPDATE SET
        dept_name = EXCLUDED.dept_name,
        dept_py = EXCLUDED.dept_py,
        updated_at = NOW()
      RETURNING *
      `,
      [department.deptcode, department.deptname, department.deptpy],
    );
    return res.rows[0];
  }

  // ------------------------------------
  //   Send to machine
  // ------------------------------------

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
