import { Module } from '@nestjs/common';
import { TrustEstateService } from './trust-estate.service';
import { TrustEstateController } from './trust-estate.controller';

@Module({
  providers:   [TrustEstateService],
  controllers: [TrustEstateController],
  exports:     [TrustEstateService],
})
export class TrustEstateModule {}
