import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';
import { BasketsModule } from '../baskets/baskets.module';

@Module({
  imports: [ConfigModule, BasketsModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
})
export class PrescriptionsModule {}
