import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceCase } from '@tpt/database';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ComplianceCase])],
  providers: [CasesService],
  controllers: [CasesController],
  exports: [CasesService],
})
export class CasesModule {}
