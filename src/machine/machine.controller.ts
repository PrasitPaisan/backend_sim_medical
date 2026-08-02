import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { MachineService, UpdateCobotTaskInput } from './machine.service';
import { BasketsService } from '../baskets/baskets.service';

function parseUpdateCobotTaskInput(
  body: Partial<UpdateCobotTaskInput>,
): UpdateCobotTaskInput {
  const { machineId, cobotId, taskNo, taskState } = body ?? {};

  if (
    machineId === undefined ||
    !cobotId ||
    !taskNo ||
    taskState === undefined
  ) {
    throw new BadRequestException(
      'machineId, cobotId, taskNo and taskState are required',
    );
  }

  return {
    machineId: Number(machineId),
    cobotId,
    taskNo,
    taskState: Number(taskState),
    taskErrorId:
      body.taskErrorId !== undefined ? Number(body.taskErrorId) : undefined,
    taskMessage: body.taskMessage,
  };
}

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

  // Lets the UI show the exact SOAP body before confirming a QueryBasket
  // call — no machine call, purely a preview of what /query-basket would
  // transmit for this str/type. type doubles as a lighting command (1 blue,
  // 2 green, 3 red, anything else = plain query) — see queryBasketFromRB1500.
  @Get('query-basket/preview')
  queryBasketPreview(@Query('str') str?: string, @Query('type') type?: string) {
    if (!str || !type) {
      throw new BadRequestException('str and type are required');
    }

    return {
      xml: this.machineService.buildSoapEnvelopeForQueryBasketPreview(
        str,
        type,
      ),
    };
  }

  @Get('query-basket')
  async queryBasket(@Query('str') str?: string, @Query('type') type?: string) {
    if (!str || !type) {
      throw new BadRequestException('str and type are required');
    }

    return await this.machineService.queryBasketFromRB1500(str, type);
  }

  // Lets the UI show the exact SOAP body before confirming a GetMachineStatus
  // call — no machine call, purely a preview of what /status would transmit
  // for this machineId.
  @Get('status/preview')
  getMachineStatusPreview(@Query('machineId') machineId?: string) {
    if (!machineId) {
      throw new BadRequestException('machineId is required');
    }

    return {
      xml: this.machineService.buildSoapEnvelopeForGetMachineStatusPreview(
        Number(machineId),
      ),
    };
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

  // Lets the UI show the exact SOAP body before confirming a QueryCOBOTTask
  // call — no machine call, purely a preview of what /query-cobot-task would
  // transmit for this machineId/cobotId.
  @Get('query-cobot-task/preview')
  queryCobotTaskPreview(
    @Query('machineId') machineId?: string,
    @Query('cobotId') cobotId?: string,
  ) {
    if (!machineId || !cobotId) {
      throw new BadRequestException('machineId and cobotId are required');
    }

    return {
      xml: this.machineService.buildSoapEnvelopeForQueryCobotTaskPreview(
        Number(machineId),
        cobotId,
      ),
    };
  }

  @Get('query-cobot-task')
  async queryCobotTask(
    @Query('machineId') machineId?: string,
    @Query('cobotId') cobotId?: string,
  ) {
    if (!machineId || !cobotId) {
      throw new BadRequestException('machineId and cobotId are required');
    }

    return await this.machineService.queryCobotTaskFromRB1500(
      Number(machineId),
      cobotId,
    );
  }

  // Lets the UI show the exact SOAP body before confirming a
  // QueryBasketPosition call — no machine call, purely a preview of what
  // /query-basket-position would transmit for this withinTime.
  @Get('query-basket-position/preview')
  queryBasketPositionPreview(@Query('withinTime') withinTime?: string) {
    return {
      xml: this.machineService.buildSoapEnvelopeForQueryBasketPositionPreview(
        withinTime ? Number(withinTime) : 300,
      ),
    };
  }

  // Bulk position query — returns every basket RB1500 has moved recently, not
  // just one prescription's (see MachineService.queryBasketPositionFromRB1500
  // for why withinTime defaults to 300s / 5 minutes, matching RB1500's spec).
  @Get('query-basket-position')
  async queryBasketPosition(@Query('withinTime') withinTime?: string) {
    return await this.machineService.queryBasketPositionFromRB1500(
      withinTime ? Number(withinTime) : 300,
    );
  }

  // Lets the UI show the exact SOAP body before confirming an
  // UpdateCOBOTTask call — no machine call, purely a preview of what
  // /update-cobot-task would transmit for this task update.
  @Post('update-cobot-task/preview')
  updateCobotTaskPreview(@Body() body: Partial<UpdateCobotTaskInput>) {
    const input = parseUpdateCobotTaskInput(body);

    return {
      xml: this.machineService.buildSoapEnvelopeForUpdateCobotTaskPreview(
        input,
      ),
    };
  }

  // Real machine call, so POST — this is what actually tells RB1500 a COBOT
  // finished (or failed) its task, letting the basket carry on past the
  // COBOT station. Not wired into any database state yet — machine-only
  // call for now, same as eliminate-prescription/update-ready-state.
  @Post('update-cobot-task')
  async updateCobotTask(@Body() body: Partial<UpdateCobotTaskInput>) {
    const input = parseUpdateCobotTaskInput(body);

    return await this.machineService.updateCobotTaskOnRB1500(input);
  }

  // Lets the UI show the exact SOAP body before confirming an
  // UpdateReadyPrescriptionState call — no machine call, purely a preview of
  // what /update-ready-state would transmit for this prescriptionhisid.
  @Post('update-ready-state/preview')
  updateReadyStatePreview(@Body() body: { prescriptionhisid?: string }) {
    const { prescriptionhisid } = body ?? {};

    if (!prescriptionhisid) {
      throw new BadRequestException('prescriptionhisid is required');
    }

    return {
      xml: this.machineService.buildSoapEnvelopeForUpdateReadyPrescriptionStatePreview(
        prescriptionhisid,
      ),
    };
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

  // Pharmacist Recheck's "Confirm Dispensing" action — same SOAP call as
  // /update-ready-state above (reuses the same preview builder, so no
  // separate preview route), but this one also marks the prescription
  // pre_state = 1 (complete) once the machine confirms, without releasing
  // the basket (see BasketsService.confirmRecheckByPrescriptionHisId).
  // Deliberately a separate endpoint from /update-ready-state — that one is
  // Machine Sim's machine-only test action and must keep doing nothing to
  // the database, so this new behavior can't be bolted onto it.
  @Post('confirm-recheck/preview')
  confirmRecheckPreview(@Body() body: { prescriptionhisid?: string }) {
    const { prescriptionhisid } = body ?? {};

    if (!prescriptionhisid) {
      throw new BadRequestException('prescriptionhisid is required');
    }

    return {
      xml: this.machineService.buildSoapEnvelopeForUpdateReadyPrescriptionStatePreview(
        prescriptionhisid,
      ),
    };
  }

  @Post('confirm-recheck')
  async confirmRecheck(@Body() body: { prescriptionhisid?: string }) {
    const { prescriptionhisid } = body ?? {};

    if (!prescriptionhisid) {
      throw new BadRequestException('prescriptionhisid is required');
    }

    const machineResult =
      await this.machineService.updateReadyPrescriptionStateOnRB1500(
        prescriptionhisid,
      );

    if (!machineResult.ok) {
      return machineResult;
    }

    const confirmResult =
      await this.basketsService.confirmRecheckByPrescriptionHisId(
        prescriptionhisid,
      );

    return { ...machineResult, confirmed: confirmResult.ok };
  }

  // Lets the UI show the exact SOAP body before confirming an
  // ExecEliminatePrescription call — no machine call, no basket release,
  // purely a preview of what /eliminate-prescription would transmit for
  // this prescriptionhisid.
  @Post('eliminate-prescription/preview')
  eliminatePrescriptionPreview(@Body() body: { prescriptionhisid?: string }) {
    const { prescriptionhisid } = body ?? {};

    if (!prescriptionhisid) {
      throw new BadRequestException('prescriptionhisid is required');
    }

    return {
      xml: this.machineService.buildSoapEnvelopeForExecEliminatePrescriptionPreview(
        prescriptionhisid,
      ),
    };
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
