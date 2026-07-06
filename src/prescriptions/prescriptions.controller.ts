import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get()
  async list(@Query('limit') limit?: string, @Query('minState') minState?: string) {
    const parsedLimit = limit ? Number(limit) : 100;
    const parsedMinState = minState !== undefined ? Number(minState) : null;
    return this.prescriptionsService.findAll(parsedLimit, parsedMinState);
  }

  @Post('receive')
  async receive(@Body() body: any) {
    console.log('Received prescription data:', body);
    return this.prescriptionsService.receivePrescriptions(body);
  }

  @Post('send')
  async send(@Body() body: { prescription?: any; destination?: string }) {
    return this.prescriptionsService.sendToRobot(body?.prescription ?? body, body?.destination ?? 'robot-a');
  }

  @Post('send-batch')
  async sendBatch(@Body() body: { prescriptions?: any[]; destination?: string }) {
    const prescriptions = body?.prescriptions ?? [];

    // Only mark a prescription as Ordered (pre_state = 1) once the dispensing
    // machine has actually accepted it (HTTP 200 OK). Prescriptions the machine
    // rejected or that never reached it must keep their current state so they
    // stay visible in Prescription Managements for retry.
    const sendResult = await this.prescriptionsService.sendBatchToRobot(prescriptions, body?.destination ?? 'Station1');

    const updatedIds = sendResult.results
      .filter((result) => result.ok && result.id !== undefined)
      .map((result) => result.id as number);

    if (updatedIds.length > 0) {
      await this.prescriptionsService.updateMultiplePrescriptionStates(updatedIds, 1);
    }

    return { ...sendResult, updatedIds };
  }

  @Post('advance-state')
  async advanceState(@Body() body: { prescriptionhisid?: string; state?: number }) {
    const { prescriptionhisid, state } = body ?? {};

    if (!prescriptionhisid || typeof state !== 'number') {
      throw new BadRequestException('prescriptionhisid and state are required');
    }

    const updated = await this.prescriptionsService.updateStateByHisId(prescriptionhisid, state);
    if (!updated) {
      throw new NotFoundException(`No prescription found with prescriptionhisid ${prescriptionhisid}`);
    }

    return updated;
  }
}
