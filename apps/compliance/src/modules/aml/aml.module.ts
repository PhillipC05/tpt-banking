import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmlAlert } from '@tpt/database';
import { AmlService } from './aml.service';
import { AmlController } from './aml.controller';
import { AmlRulesEngine } from './rules/aml-rules.engine';
import { getRepositoryToken } from '@nestjs/typeorm';

// We need the Transaction entity from banking-core — inject by token
// In production this would be a shared read replica or Kafka consumer
@Module({
  imports: [TypeOrmModule.forFeature([AmlAlert])],
  providers: [
    AmlService,
    {
      provide: AmlRulesEngine,
      useFactory: (amlAlertRepo: unknown, txnRepo: unknown) =>
        new AmlRulesEngine(txnRepo as never),
      inject: [getRepositoryToken(AmlAlert)],
    },
  ],
  controllers: [AmlController],
  exports: [AmlService],
})
export class AmlModule {}
