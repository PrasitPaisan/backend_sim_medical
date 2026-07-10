import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MachineService } from './machine.service';
import { MachineController } from './machine.controller';

@Module({
  imports: [ConfigModule],
  controllers: [MachineController],
  providers: [MachineService],
})
export class MachineModule {}
