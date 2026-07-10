import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { BasketsService } from '../baskets/baskets.service';

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
    private readonly basketsService: BasketsService,
  ) {}

  // Received, not yet sent (pre_state = -1) — Prescription Managements.
  @Get()
  async list(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : 100;
    return this.prescriptionsService.findAll(parsedLimit);
  }

  // In progress (pre_state = 0), joined with each bound basket's station_status
  // — Process Tracking.
  @Get('tracking')
  async tracking(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : 100;
    return this.prescriptionsService.findInProgress(parsedLimit);
  }

  // Monitor Queue's data source: prescriptions currently called for pickup
  // (basket station_status = 7), each with the fetchwindow (pickup
  // counter/channel) to display to the patient.
  @Get('monitor-queue')
  async monitorQueue() {
    return await this.prescriptionsService.findCalledForPickup();
  }

  @Post('receive')
  async receive(@Body() body: any) {
    console.log('Received prescription data:', body);
    return this.prescriptionsService.receivePrescriptions(body);
  }

  @Post('send')
  async send(@Body() body: { prescription?: any; destination?: string }) {
    return this.prescriptionsService.sendToRB1500(
      body?.prescription ?? body,
      body?.destination ?? 'robot-a',
    );
  }

  @Post('send-batch')
  async sendBatch(
    @Body() body: { prescriptions?: any[]; destination?: string },
  ) {
    const prescriptions = body?.prescriptions ?? [];

    // Basket binding + pre_state transition both happen inside sendBatchToMachines
    // now, since a failed machine call must release that prescription's basket
    // specifically, not just skip a state update.
    const sendResult = await this.prescriptionsService.sendBatchToMachines(
      prescriptions,
      body?.destination ?? 'Station1',
    );

    const updatedIds = sendResult.results
      .filter((result) => result.ok && result.id !== undefined)
      .map((result) => result.id as number);

    return { ...sendResult, updatedIds };
  }

  // Machine Sim "Pass" action: advances the basket bound to this prescription
  // to the next station. Reaching the final station also completes the
  // prescription and frees the basket — handled inside BasketsService.
  @Post('advance-station')
  async advanceStation(
    @Body() body: { prescriptionhisid?: string; station?: number },
  ) {
    const { prescriptionhisid, station } = body ?? {};

    if (!prescriptionhisid || typeof station !== 'number') {
      throw new BadRequestException(
        'prescriptionhisid and station are required',
      );
    }

    const result = await this.basketsService.advanceStationByPrescriptionHisId(
      prescriptionhisid,
      station,
    );

    if (!result.ok) {
      if (result.reason === 'not_found') {
        throw new NotFoundException(
          `No prescription found with prescriptionhisid ${prescriptionhisid}`,
        );
      }
      if (result.reason === 'no_basket_bound') {
        throw new BadRequestException(
          `Prescription ${prescriptionhisid} has no basket bound yet — send it to the machine first`,
        );
      }
      throw new BadRequestException(
        `Basket for ${prescriptionhisid} is currently at station ${result.currentStatus}, cannot advance to ${station} — stations can be skipped, but not repeated or moved backward`,
      );
    }

    return result;
  }
}
