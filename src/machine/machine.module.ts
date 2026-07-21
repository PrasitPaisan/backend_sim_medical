import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MachineService } from './machine.service';
import { MachineController } from './machine.controller';
import { BasketsModule } from '../baskets/baskets.module';

@Module({
  imports: [ConfigModule, BasketsModule],
  controllers: [MachineController],
  providers: [MachineService],
})
export class MachineModule {}
