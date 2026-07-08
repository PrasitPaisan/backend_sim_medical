import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const l = limit ? Number(limit) : 100;
    return this.departmentsService.findAll(l);
  }

  @Post()
  async create(
    @Body() body: { deptcode?: string; deptname?: string; deptpy?: string },
  ) {
    if (!body?.deptcode || !body?.deptname || !body?.deptpy) {
      throw new BadRequestException(
        'deptcode, deptname and deptpy are required',
      );
    }

    return this.departmentsService.createDepartment({
      deptcode: body.deptcode,
      deptname: body.deptname,
      deptpy: body.deptpy,
    });
  }
}
