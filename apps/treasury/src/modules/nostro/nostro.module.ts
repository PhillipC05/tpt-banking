import { Module } from '@nestjs/common';
import { NostroService } from './nostro.service';
import { NostroController } from './nostro.controller';

@Module({
  providers: [NostroService],
  controllers: [NostroController],
  exports: [NostroService],
})
export class NostroModule {}
