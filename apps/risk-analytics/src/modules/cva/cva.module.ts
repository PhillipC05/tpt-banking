import { Module } from '@nestjs/common';
import { CvaService } from './cva.service';
import { CvaController } from './cva.controller';

@Module({
  providers: [CvaService],
  controllers: [CvaController],
  exports: [CvaService],
})
export class CvaModule {}
