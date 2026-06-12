import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EddQuestionnaire } from '@tpt/database';
import { EddService } from './edd.service';
import { EddController } from './edd.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EddQuestionnaire])],
  controllers: [EddController],
  providers: [EddService],
  exports: [EddService],
})
export class EddModule {}
