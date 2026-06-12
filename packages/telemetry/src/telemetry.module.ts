import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { TraceInterceptor } from './trace.interceptor';

@Global()
@Module({
  providers: [MetricsService, TraceInterceptor],
  exports: [MetricsService, TraceInterceptor],
})
export class TelemetryModule {}
