import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CddAssessment } from '@tpt/database';
import { CddService } from './cdd.service';
import { CddController } from './cdd.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CddAssessment])],
  controllers: [CddController],
  providers: [CddService],
  exports: [CddService],
})
export class CddModule {}
