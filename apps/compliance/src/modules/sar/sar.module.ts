import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sar } from '@tpt/database';
import { SarService } from './sar.service';
import { SarController } from './sar.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Sar])],
  providers: [SarService],
  controllers: [SarController],
  exports: [SarService],
})
export class SarModule {}
