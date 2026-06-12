import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProxyService } from './proxy.service';
import { ProxyController } from './proxy.controller';
import { AggregateHealthController } from './aggregate-health.controller';

@Module({
  imports:     [HttpModule],
  providers:   [ProxyService],
  controllers: [ProxyController, AggregateHealthController],
})
export class ProxyModule {}
