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
  // nzp360SentOnly narrows this to prescriptions already split-sent to
  // NZP360 alone (nzp360_sent_at set) but still waiting on RB1500 — lets the
  // pharmacist find these without scanning every page for the "Sent to
  // NZP360" tag, since they can otherwise land anywhere in the list.
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('nzp360SentOnly') nzp360SentOnly?: string,
  ) {
    return this.prescriptionsService.findAll(
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 50,
      nzp360SentOnly === 'true',
    );
  }

  // Bulk-select support for Prescription Managements: returns just the ids
  // of the first `limit` prescriptions in the same order findAll uses, so
  // the UI can select e.g. "first 100" across pages without fetching every
  // prescription's full medicine details. nzp360SentOnly must mirror
  // whatever filter the list itself is currently under (see findAll) —
  // otherwise "select first N" while the NZP360-sent filter is active would
  // silently pull in unfiltered ids the pharmacist can't even see on screen.
  @Get('ids')
  async ids(
    @Query('limit') limit?: string,
    @Query('nzp360SentOnly') nzp360SentOnly?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : 100;
    return this.prescriptionsService.findIds(
      parsedLimit,
      nzp360SentOnly === 'true',
    );
  }

  // Backfills full prescription + medicine data for ids the browser doesn't
  // have loaded (e.g. selected via the "first N" bulk-select on a page other
  // than the one currently displayed) — send-batch needs the full medicine
  // list to build the SOAP payload, not just the id.
  @Post('by-ids')
  async byIds(@Body() body: { ids?: number[] }) {
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((id) => Number.isFinite(id))
      : [];
    return this.prescriptionsService.findByIds(ids);
  }

  // In progress (pre_state = 0), joined with each bound basket's station_status
  // — Process Tracking.
  @Get('tracking')
  async tracking(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : 100;
    return this.prescriptionsService.findInProgress(parsedLimit);
  }

  // Monitor Queue's data source: prescriptions currently called for pickup
  // (basket station_status = 8), each with the fetchwindow (pickup
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

  // Lets the UI show the exact SOAP body(ies) before the user confirms
  // sending — no machine call, no basket binding, no database write, purely
  // a preview of what /send-batch would transmit for each prescription.
  @Post('preview-send')
  previewSend(@Body() body: { prescriptions?: any[] }) {
    const prescriptions = body?.prescriptions;

    if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
      throw new BadRequestException('prescriptions must be a non-empty array');
    }

    return this.prescriptionsService.buildPreviewForBatch(prescriptions);
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

  // Split-send: lets a pharmacist send NZP360 and RB1500 independently, in
  // either order — e.g. NZP360 first so loose tablets are ready before the
  // basket physically arrives on RB1500's conveyor. See preview-send for the
  // combined preview; these mirror the same preview-before-send pattern per
  // machine so the UI can show each XML before confirming.
  @Post('preview-send-rb1500')
  previewSendRb1500(@Body() body: { prescriptions?: any[] }) {
    const prescriptions = body?.prescriptions;

    if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
      throw new BadRequestException('prescriptions must be a non-empty array');
    }

    return this.prescriptionsService.buildPreviewForRb1500(prescriptions);
  }

  @Post('send-rb1500')
  async sendRb1500(@Body() body: { prescriptions?: any[] }) {
    const prescriptions = body?.prescriptions ?? [];

    const sendResult =
      await this.prescriptionsService.sendRb1500Only(prescriptions);

    const updatedIds = sendResult.results
      .filter((result) => result.ok && result.id !== undefined)
      .map((result) => result.id as number);

    return { ...sendResult, updatedIds };
  }

  @Post('preview-send-nzp360')
  previewSendNzp360(@Body() body: { prescriptions?: any[] }) {
    const prescriptions = body?.prescriptions;

    if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
      throw new BadRequestException('prescriptions must be a non-empty array');
    }

    return this.prescriptionsService.buildPreviewForNzp360(prescriptions);
  }

  @Post('send-nzp360')
  async sendNzp360(@Body() body: { prescriptions?: any[] }) {
    const prescriptions = body?.prescriptions ?? [];

    const sendResult =
      await this.prescriptionsService.sendNzp360Only(prescriptions);

    // Named sentIds rather than updatedIds — sending NZP360 alone never
    // removes a prescription from Prescription Managements (pre_state stays
    // -1), unlike send-batch/send-rb1500's updatedIds. The frontend uses this
    // to flag nzp360_sent_at locally instead of dropping the row.
    const sentIds = sendResult.results
      .filter((result) => result.ok && result.id !== undefined)
      .map((result) => result.id as number);

    return { ...sendResult, sentIds };
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
