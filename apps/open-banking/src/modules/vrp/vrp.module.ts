import { Module } from '@nestjs/common';
import { VrpService } from './vrp.service';
import { VrpController } from './vrp.controller';
import { ObieModule } from '../obie/obie.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports:     [ObieModule, WebhooksModule],
  providers:   [VrpService],
  controllers: [VrpController],
})
export class VrpModule {}
