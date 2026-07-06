import { Controller, Get, Query } from '@nestjs/common';
import { MedicinesService } from './medicines.service';

@Controller('medicines')
export class MedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const l = limit ? Number(limit) : 100;
    return this.medicinesService.findAll(l);
  }
}
