import { Module } from '@nestjs/common';
import { CcarDfastService } from './ccar-dfast.service';
import { CcarDfastController } from './ccar-dfast.controller';

@Module({
  providers: [CcarDfastService],
  controllers: [CcarDfastController],
  exports: [CcarDfastService],
})
export class CcarDfastModule {}
