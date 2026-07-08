import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BasketsService } from './baskets.service';
import { BasketsController } from './baskets.controller';

@Module({
  imports: [ConfigModule],
  controllers: [BasketsController],
  providers: [BasketsService],
  exports: [BasketsService],
})
export class BasketsModule {}
