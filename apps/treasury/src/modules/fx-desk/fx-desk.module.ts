import { Module } from '@nestjs/common';
import { FxDeskService } from './fx-desk.service';
import { FxDeskController } from './fx-desk.controller';

@Module({
  providers: [FxDeskService],
  controllers: [FxDeskController],
  exports: [FxDeskService],
})
export class FxDeskModule {}
