import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { DepartmentsService, DepartmentInput } from './departments.service';

function assertValidDepartments(
  departments: unknown,
): asserts departments is DepartmentInput[] {
  if (!Array.isArray(departments) || departments.length === 0) {
    throw new BadRequestException('departments must be a non-empty array');
  }

  for (const department of departments as DepartmentInput[]) {
    if (!department?.deptcode || !department?.deptname || !department?.deptpy) {
      throw new BadRequestException(
        'deptcode, deptname and deptpy are required for every department',
      );
    }
  }
}

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const l = limit ? Number(limit) : 100;
    return this.departmentsService.findAll(l);
  }

  // Lets the UI show the exact SOAP body before the user confirms sending —
  // no machine call, no database write, purely a preview of what POST /
  // (createDepartments) would transmit.
  @Post('preview')
  preview(@Body() body: { departments?: DepartmentInput[] }) {
    assertValidDepartments(body?.departments);

    const xml = this.departmentsService.buildSoapEnvelopeForPreview(
      body.departments.map((department) => ({
        deptCode: department.deptcode,
        deptName: department.deptname,
        deptPyCode: department.deptpy,
      })),
    );

    return { xml };
  }

  @Post()
  async create(@Body() body: { departments?: DepartmentInput[] }) {
    assertValidDepartments(body?.departments);
    return this.departmentsService.createDepartments(body.departments);
  }

  // Saves departments straight to department_dictionary with no machine
  // call at all — lets a department be prepared ahead of time without
  // needing the physical machine reachable right now. Rows land as
  // sync_status = 'pending' (upsertDepartment's CASE guard means this can
  // never downgrade an already-'synced' row).
  @Post('save')
  async save(@Body() body: { departments?: DepartmentInput[] }) {
    assertValidDepartments(body?.departments);
    return this.departmentsService.saveDepartments(body.departments);
  }
}
