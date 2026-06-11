/**
 * Statistical utility functions for risk analytics.
 * All computations use native JavaScript Math — no external numeric dependencies.
 */

export function normCdf(x: number): number {
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429;
  const p = 0.2316419, c = 0.39894228;
  if (x >= 0) {
    const t = 1.0 / (1.0 + p * x);
    return 1.0 - c * Math.exp(-x * x / 2.0) * t * (t * (t * (t * (t * a5 + a4) + a3) + a2) + a1);
  } else {
    const t = 1.0 / (1.0 - p * x);
    return c * Math.exp(-x * x / 2.0) * t * (t * (t * (t * (t * a5 + a4) + a3) + a2) + a1);
  }
}

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Acklam rational approximation, max error < 1.15e-9 */
export function normInv(p: number): number {
  if (p <= 0 || p >= 1) throw new Error(`normInv: p must be in (0,1), got ${p}`);
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    const q = p - 0.5, r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

export function boxMuller(): [number, number] {
  const u1 = Math.random(), u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
  return [z0, z1];
}

export function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function variance(values: number[]): number {
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
}

export function stdDev(values: number[]): number {
  return Math.sqrt(variance(values));
}

export function covariance(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys);
  return xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / (xs.length - 1);
}

/** Pearson correlation coefficient */
export function correlation(xs: number[], ys: number[]): number {
  return covariance(xs, ys) / (stdDev(xs) * stdDev(ys));
}

/** Cholesky decomposition of a positive-definite n×n matrix. Returns lower triangular L such that A = L*Lᵀ */
export function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error(`Cholesky: matrix not positive-definite at (${i},${i})`);
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

export function discountFactor(rate: number, timeYears: number): number {
  return Math.exp(-rate * timeYears);
}

/** Sort array ascending and return value at given percentile (0–1) */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error('percentile: empty array');
  const sorted = [...values].sort((a, b) => a - b);
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
