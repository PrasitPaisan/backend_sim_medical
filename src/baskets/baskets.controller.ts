import { Controller, Get, Post } from '@nestjs/common';
import { BasketsService } from './baskets.service';

@Controller('baskets')
export class BasketsController {
  constructor(private readonly basketsService: BasketsService) {}

  @Get()
  async list() {
    return this.basketsService.findAll();
  }

  // Machine Sim "Reset Simulation" button — see BasketsService.resetAll for why
  // a blunt full reset is acceptable here (this app simulates the pipeline,
  // it isn't the real one).
  @Post('reset')
  async reset() {
    return this.basketsService.resetAll();
  }
}
