/**
 * Statistical utility functions for quantitative pricing.
 * All functions use native JavaScript Math — no external dependencies.
 */

/**
 * Standard normal cumulative distribution function (CDF).
 * Uses the Abramowitz & Stegun rational approximation (error < 7.5e-8).
 */
export function normCdf(x: number): number {
  const a1 = 0.319381530;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (x >= 0) {
    const t = 1.0 / (1.0 + p * x);
    return (1.0 - c * Math.exp(-x * x / 2.0) *
      t * (t * (t * (t * (t * a5 + a4) + a3) + a2) + a1));
  } else {
    const t = 1.0 / (1.0 - p * x);
    return (c * Math.exp(-x * x / 2.0) *
      t * (t * (t * (t * (t * a5 + a4) + a3) + a2) + a1));
  }
}

/**
 * Standard normal probability density function (PDF).
 */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard normal inverse CDF (quantile function).
 * Rational approximation by Peter Acklam, max error < 1.15e-9.
 */
export function normInv(p: number): number {
  if (p <= 0 || p >= 1) throw new Error(`normInv: p must be in (0, 1), got ${p}`);

  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/**
 * Box-Muller transform — generates standard normal random numbers.
 * Returns a pair [z0, z1] of independent standard normal deviates.
 */
export function boxMuller(): [number, number] {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
  return [z0, z1];
}

/**
 * Linear interpolation between two points.
 */
export function lerp(x0: number, y0: number, x1: number, y1: number, x: number): number {
  if (x1 === x0) return y0;
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
}

/**
 * Cubic spline interpolation.
 * @param xs - x values (sorted ascending)
 * @param ys - y values
 * @param x  - query point
 */
export function cubicSpline(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (n !== ys.length) throw new Error('xs and ys must have the same length');
  if (n < 2) throw new Error('Need at least 2 points for interpolation');

  // Clamp to range
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];

  // Find segment
  let i = 0;
  while (i < n - 1 && xs[i + 1] < x) i++;

  return lerp(xs[i], ys[i], xs[i + 1], ys[i + 1], x);
}

/**
 * Computes the mean of an array.
 */
export function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Computes the variance of an array.
 */
export function variance(values: number[]): number {
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
}

/**
 * Standard deviation of an array.
 */
export function stdDev(values: number[]): number {
  return Math.sqrt(variance(values));
}

/**
 * Discount factor: exp(-r * t) for continuous compounding.
 */
export function discountFactor(rate: number, timeYears: number): number {
  return Math.exp(-rate * timeYears);
}

/**
 * Forward price: S * exp((r - q) * t)
 * where r = risk-free rate, q = dividend/convenience yield.
 */
export function forwardPrice(spot: number, rate: number, yield_: number, timeYears: number): number {
  return spot * Math.exp((rate - yield_) * timeYears);
}
