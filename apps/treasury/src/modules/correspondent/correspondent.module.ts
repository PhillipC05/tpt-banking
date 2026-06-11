import { Module } from '@nestjs/common';
import { CorrespondentService } from './correspondent.service';
import { CorrespondentController } from './correspondent.controller';

@Module({
  providers: [CorrespondentService],
  controllers: [CorrespondentController],
  exports: [CorrespondentService],
})
export class CorrespondentModule {}
