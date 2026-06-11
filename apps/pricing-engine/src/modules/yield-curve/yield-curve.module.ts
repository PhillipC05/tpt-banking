import { Module } from '@nestjs/common';
import { YieldCurveService } from './yield-curve.service';
import { YieldCurveController } from './yield-curve.controller';

@Module({
  providers: [YieldCurveService],
  controllers: [YieldCurveController],
  exports: [YieldCurveService],
})
export class YieldCurveModule {}
