import { Module } from '@nestjs/common';
import { VarService } from './var.service';
import { VarController } from './var.controller';

@Module({
  providers: [VarService],
  controllers: [VarController],
  exports: [VarService],
})
export class VarModule {}
