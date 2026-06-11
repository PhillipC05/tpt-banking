import { Module } from '@nestjs/common';
import { CollateralManagementService } from './collateral-management.service';
import { CollateralManagementController } from './collateral-management.controller';

@Module({
  providers:   [CollateralManagementService],
  controllers: [CollateralManagementController],
  exports:     [CollateralManagementService],
})
export class CollateralManagementModule {}
