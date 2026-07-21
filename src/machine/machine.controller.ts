import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { MachineService } from './machine.service';
import { BasketsService } from '../baskets/baskets.service';

@Controller('machine')
export class MachineController {
  constructor(
    private readonly machineService: MachineService,
    private readonly basketsService: BasketsService,
  ) {}

  @Get('query-ready')
  async queryReady() {
    return this.machineService.queryReadyPrescriptionsFromRB1500();
  }

  @Get('query-basket')
  async queryBasket(@Query('str') str?: string, @Query('type') type?: string) {
    if (!str || !type) {
      throw new BadRequestException('str and type are required');
    }

    return await this.machineService.queryBasketFromRB1500(str, type);
  }

  @Get('status')
  async getMachineStatus(@Query('machineId') machineId?: string) {
    if (!machineId) {
      throw new BadRequestException('machineId is required');
    }

    return await this.machineService.getMachineStatusFromRB1500(
      Number(machineId),
    );
  }

  @Post('update-ready-state')
  async updateReadyState(@Body() body: { prescriptionhisid?: string }) {
    const { prescriptionhisid } = body ?? {};

    if (!prescriptionhisid) {
      throw new BadRequestException('prescriptionhisid is required');
    }

    return this.machineService.updateReadyPrescriptionStateOnRB1500(
      prescriptionhisid,
    );
  }

  // Real machine mutation, so POST. Once the machine confirms the
  // elimination, releases whatever basket was bound to this prescription
  // back to the pool for reuse and marks it eliminated (pre_state = 2 —
  // see BasketsService.eliminateByPrescriptionHisId) so it stops showing up
  // as "complete" and drops out of every existing queue view. If the
  // machine call itself fails, the database is left untouched — nothing
  // was actually eliminated on the real machine.
  @Post('eliminate-prescription')
  async eliminatePrescription(@Body() body: { prescriptionhisid?: string }) {
    const { prescriptionhisid } = body ?? {};

    if (!prescriptionhisid) {
      throw new BadRequestException('prescriptionhisid is required');
    }

    const machineResult =
      await this.machineService.execEliminatePrescriptionOnRB1500(
        prescriptionhisid,
      );

    if (!machineResult.ok) {
      return machineResult;
    }

    const releaseResult =
      await this.basketsService.eliminateByPrescriptionHisId(prescriptionhisid);

    return {
      ...machineResult,
      basketReleased: releaseResult.ok ? releaseResult.basketId : null,
    };
  }
}
