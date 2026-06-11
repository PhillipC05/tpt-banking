import { Injectable, Logger } from '@nestjs/common';
import { YieldCurveService, YieldCurve } from '../yield-curve/yield-curve.service';

export interface IrsParams {
  /** Notional principal amount */
  notional: number;
  /** Fixed rate paid/received */
  fixedRate: number;
  /** Maturity in years */
  maturityYears: number;
  /** Coupon frequency per year (2=semi-annual, 4=quarterly) */
  fixedFrequency: number;
  /** Floating index reset frequency */
  floatFrequency: number;
  /** Position: PAYER (pay fixed, receive float) | RECEIVER (receive fixed, pay float) */
  position: 'PAYER' | 'RECEIVER';
  /** Discount / OIS curve */
  discountCurve: YieldCurve;
  /** Forward / projection curve (for floating leg) */
  forwardCurve: YieldCurve;
}

export interface IrsValuation {
  /** NPV from position perspective */
  npv: number;
  /** PV of fixed leg */
  pvFixed: number;
  /** PV of floating leg */
  pvFloat: number;
  /** DV01 — dollar value of a 1bp shift in rates */
  dv01: number;
  /** PV01 — present value of 1bp (per unit notional) */
  pv01: number;
  /** Par/Fair swap rate (rate that makes NPV = 0) */
  fairSwapRate: number;
  fixedCashFlows: Array<{ date: number; cashFlow: number; discountFactor: number; pv: number }>;
  floatCashFlows: Array<{ date: number; forwardRate: number; cashFlow: number; discountFactor: number; pv: number }>;
}

/**
 * Interest Rate Swap (IRS) pricing service.
 *
 * Values a fixed-for-floating IRS using the standard multi-curve framework:
 *   - Discounting curve: OIS (SOFR, ESTR) for present value
 *   - Projection curve: LIBOR/SOFR for forward floating rates
 *
 * PV of Fixed Leg  = N * c * Σ(df(ti) * dt)
 * PV of Float Leg  = N * Σ(forward_rate(ti-1, ti) * df(ti) * dt)
 *
 * Fair swap rate r* = PV_Float / (annuity factor)
 */
@Injectable()
export class IrsPricingService {
  private readonly logger = new Logger(IrsPricingService.name);

  constructor(private readonly yieldCurveService: YieldCurveService) {}

  price(params: IrsParams): IrsValuation {
    const { notional, fixedRate, maturityYears, fixedFrequency, floatFrequency,
            position, discountCurve, forwardCurve } = params;

    // ── Fixed Leg ────────────────────────────────────────────────────────────
    const fixedDt = 1 / fixedFrequency;
    const fixedTenors: number[] = [];
    let t = fixedDt;
    while (t <= maturityYears + fixedDt / 2) {
      fixedTenors.push(Math.min(t, maturityYears));
      if (t >= maturityYears) break;
      t += fixedDt;
    }

    const fixedCashFlows = fixedTenors.map((tenor, i) => {
      const df = this.yieldCurveService.getDiscountFactor(discountCurve, tenor);
      const cashFlow = notional * fixedRate * fixedDt;
      return { date: tenor, cashFlow, discountFactor: df, pv: cashFlow * df };
    });

    // Add notional at maturity (receive notional on the fixed leg)
    const finalDf = this.yieldCurveService.getDiscountFactor(discountCurve, maturityYears);
    fixedCashFlows[fixedCashFlows.length - 1].cashFlow += notional;
    fixedCashFlows[fixedCashFlows.length - 1].pv =
      fixedCashFlows[fixedCashFlows.length - 1].cashFlow * finalDf;

    const pvFixed = fixedCashFlows.reduce((s, cf) => s + cf.pv, 0);

    // ── Floating Leg ──────────────────────────────────────────────────────────
    const floatDt = 1 / floatFrequency;
    const floatTenors: number[] = [];
    let tf = floatDt;
    while (tf <= maturityYears + floatDt / 2) {
      floatTenors.push(Math.min(tf, maturityYears));
      if (tf >= maturityYears) break;
      tf += floatDt;
    }

    const floatCashFlows = floatTenors.map((tenor, i) => {
      const startTenor = i === 0 ? 0 : floatTenors[i - 1];
      const { forwardRate } = this.yieldCurveService.getForwardRate(
        forwardCurve,
        startTenor,
        tenor,
      );
      const df = this.yieldCurveService.getDiscountFactor(discountCurve, tenor);
      const cashFlow = notional * forwardRate * floatDt;
      return { date: tenor, forwardRate, cashFlow, discountFactor: df, pv: cashFlow * df };
    });

    // Add notional return at maturity
    floatCashFlows[floatCashFlows.length - 1].cashFlow += notional;
    floatCashFlows[floatCashFlows.length - 1].pv =
      floatCashFlows[floatCashFlows.length - 1].cashFlow * finalDf;

    const pvFloat = floatCashFlows.reduce((s, cf) => s + cf.pv, 0);

    // ── Fair Swap Rate ────────────────────────────────────────────────────────
    const annuityFactor = fixedCashFlows
      .slice(0, -1)
      .reduce((s, cf) => s + cf.discountFactor * fixedDt, 0) +
      finalDf * fixedDt;

    const pvFloatNoNotional = floatCashFlows
      .map((cf, i) => i === floatCashFlows.length - 1
        ? (cf.cashFlow - notional) * cf.discountFactor
        : cf.pv)
      .reduce((s, v) => s + v, 0);

    const fairSwapRate = pvFloatNoNotional / (notional * annuityFactor);

    // ── NPV ──────────────────────────────────────────────────────────────────
    const npv = position === 'PAYER'
      ? pvFloat - pvFixed  // Pay fixed, receive float
      : pvFixed - pvFloat; // Receive fixed, pay float

    // ── DV01 / PV01 ──────────────────────────────────────────────────────────
    const pv01 = annuityFactor * fixedDt;
    const dv01 = notional * pv01 * 0.0001; // 1bp = 0.0001

    return {
      npv,
      pvFixed,
      pvFloat,
      dv01,
      pv01,
      fairSwapRate,
      fixedCashFlows,
      floatCashFlows,
    };
  }
}
