import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { MachineService } from './machine.service';

@Controller('machine')
export class MachineController {
  constructor(private readonly machineService: MachineService) {}

  // Returns the HIS ids of prescriptions the robot has already finished
  // dispensing (ready for pharmacist pickup/recheck) — read-only against the
  // machine, no database reads or writes here.
  @Get('query-ready')
  async queryReady() {
    return this.machineService.queryReadyPrescriptionsFromRB1500();
  }

  // Asks the machine for basket info by identifier (str) and query type
  // (type) — read-only against the machine, no database reads or writes here.
  @Get('query-basket')
  async queryBasket(@Query('str') str?: string, @Query('type') type?: string) {
    if (!str || !type) {
      throw new BadRequestException('str and type are required');
    }

    return await this.machineService.queryBasketFromRB1500(str, type);
  }

  // Asks RB1500 for its own machine status — read-only against the machine,
  // no database reads or writes here.
  @Get('status')
  async getMachineStatus(@Query('machineId') machineId?: string) {
    if (!machineId) {
      throw new BadRequestException('machineId is required');
    }

    return await this.machineService.getMachineStatusFromRB1500(
      Number(machineId),
    );
  }

  // Tells the machine a prescription's pharmacist recheck is complete — a
  // real machine mutation (clears it from the machine's own ready queue), so
  // this is POST, unlike query-ready. Not wired into advance-station yet.
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

  // Tells the machine to eliminate/cancel a prescription it's holding — a
  // real machine mutation, so POST. Machine-only for now, no database writes.
  @Post('eliminate-prescription')
  async eliminatePrescription(@Body() body: { prescriptionhisid?: string }) {
    const { prescriptionhisid } = body ?? {};

    if (!prescriptionhisid) {
      throw new BadRequestException('prescriptionhisid is required');
    }

    return await this.machineService.execEliminatePrescriptionOnRB1500(
      prescriptionhisid,
    );
  }
}
