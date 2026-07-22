import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { MedicinesService, MedicineInput } from './medicines.service';

function assertValidMedicines(
  medicines: unknown,
): asserts medicines is MedicineInput[] {
  if (!Array.isArray(medicines) || medicines.length === 0) {
    throw new BadRequestException('medicines must be a non-empty array');
  }

  for (const medicine of medicines as MedicineInput[]) {
    if (
      !medicine?.medicinehisid ||
      !medicine?.medicinenamech ||
      !medicine?.medfactoryname
    ) {
      throw new BadRequestException(
        'medicine.medicinehisid, medicinenamech and medfactoryname are required for every medicine',
      );
    }
  }
}

@Controller('medicines')
export class MedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const l = limit ? Number(limit) : 100;
    return this.medicinesService.findAll(l);
  }

  // Lets the UI show the exact SOAP body before the user confirms sending —
  // no machine call, no database write, purely a preview of what /send
  // would transmit for this targetMachine.
  @Post('preview')
  preview(
    @Body()
    body: {
      medicines?: MedicineInput[];
      targetMachine?: 'RB1500' | 'NZP360';
    },
  ) {
    assertValidMedicines(body?.medicines);

    const targetMachine =
      body?.targetMachine === 'NZP360' ? 'NZP360' : 'RB1500';
    const xml = this.medicinesService.buildSoapEnvelopeForPreview(
      body.medicines,
      targetMachine,
    );

    return { xml };
  }

  // targetMachine picks which physical machine's SOAP endpoint to hit
  // (RB1500's WebService.asmx or NZP360's RssServer.asmx) — purely a routing
  // choice for this test page. It's independent of medicine.dispense_type,
  // which is still what gets persisted to medicine_dictionary and drives
  // station routing elsewhere (Process Tracking/Machine Sim); the DB write
  // below is unchanged regardless of which machine this was sent to.
  //
  // Accepts one or many medicines in a single call — both
  // sendMedicineToNZP360/RB1500 already build one <DataTable>/<changemed>
  // block per medicine, so a multi-item batch is a single SOAP call. This is
  // all-or-nothing: if the machine rejects the batch, nothing is persisted,
  // so the caller can retry/edit the same staged list.
  @Post('send')
  async send(
    @Body()
    body: {
      medicines?: MedicineInput[];
      targetMachine?: 'RB1500' | 'NZP360';
    },
  ) {
    assertValidMedicines(body?.medicines);
    const medicines = body.medicines;

    const targetMachine =
      body?.targetMachine === 'NZP360' ? 'NZP360' : 'RB1500';
    const sendResult =
      targetMachine === 'NZP360'
        ? await this.medicinesService.sendMedicineToNZP360(medicines)
        : await this.medicinesService.sendMedicineToRB1500(medicines);

    // Only record them as "added" once the machine actually accepted the
    // whole batch — mirrors how prescriptions only flip state after a 200
    // from the machine.
    if (!sendResult.ok) {
      return sendResult;
    }

    const saved = await Promise.all(
      medicines.map((medicine) =>
        this.medicinesService.upsertMedicine(medicine),
      ),
    );
    return { ...sendResult, medicines: saved };
  }

  // Saves medicines straight to medicine_dictionary with no machine call at
  // all — lets a pharmacist prepare tomorrow's medicine data today without
  // needing the physical machine reachable right now. Rows land as
  // sync_status = 'pending' (upsertMedicine's CASE guard means this can
  // never downgrade an already-'synced' row), so "Medicines on the machine"
  // can still tell prepared-but-undispatched apart from machine-confirmed.
  @Post('save')
  async save(
    @Body()
    body: {
      medicines?: MedicineInput[];
    },
  ) {
    assertValidMedicines(body?.medicines);
    const medicines = body.medicines;

    const saved = await Promise.all(
      medicines.map((medicine) =>
        this.medicinesService.upsertMedicine(medicine, 'pending'),
      ),
    );

    return {
      ok: true,
      message: `Saved ${saved.length} medicine(s) to the database`,
      medicines: saved,
    };
  }
}
