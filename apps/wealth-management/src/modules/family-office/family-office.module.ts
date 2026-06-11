import { Module } from '@nestjs/common';
import { FamilyOfficeService } from './family-office.service';
import { FamilyOfficeController } from './family-office.controller';

@Module({
  providers:   [FamilyOfficeService],
  controllers: [FamilyOfficeController],
  exports:     [FamilyOfficeService],
})
export class FamilyOfficeModule {}
