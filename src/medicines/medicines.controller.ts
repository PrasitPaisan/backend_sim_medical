import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { MedicinesService, MedicineInput } from './medicines.service';

@Controller('medicines')
export class MedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const l = limit ? Number(limit) : 100;
    return this.medicinesService.findAll(l);
  }

  // targetMachine picks which physical machine's SOAP endpoint to hit
  // (RB1500's WebService.asmx or NZP360's RssServer.asmx) — purely a routing
  // choice for this test page. It's independent of medicine.dispense_type,
  // which is still what gets persisted to medicine_dictionary and drives
  // station routing elsewhere (Process Tracking/Machine Sim); the DB write
  // below is unchanged regardless of which machine this was sent to.
  @Post('send')
  async send(
    @Body()
    body: {
      medicine?: MedicineInput;
      targetMachine?: 'RB1500' | 'NZP360';
    },
  ) {
    const medicine = body?.medicine;

    if (
      !medicine?.medicinehisid ||
      !medicine?.medicinenamech ||
      !medicine?.medfactoryname
    ) {
      throw new BadRequestException(
        'medicine.medicinehisid, medicinenamech and medfactoryname are required',
      );
    }

    const targetMachine =
      body?.targetMachine === 'NZP360' ? 'NZP360' : 'RB1500';
    const sendResult =
      targetMachine === 'NZP360'
        ? await this.medicinesService.sendMedicineToNZP360([medicine])
        : await this.medicinesService.sendMedicineToRB1500([medicine]);

    // Only record it as "added" once the machine actually accepted it —
    // mirrors how prescriptions only flip state after a 200 from the machine.
    if (!sendResult.ok) {
      return sendResult;
    }

    const saved = await this.medicinesService.upsertMedicine(medicine);
    return { ...sendResult, medicine: saved };
  }
}
