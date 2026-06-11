import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ctr } from '@tpt/database';
import { CtrService } from './ctr.service';
import { CtrController } from './ctr.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Ctr])],
  providers: [CtrService],
  controllers: [CtrController],
  exports: [CtrService],
})
export class CtrModule {}
