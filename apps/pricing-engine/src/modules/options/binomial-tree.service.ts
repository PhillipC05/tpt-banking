import { Injectable } from '@nestjs/common';

export interface BinomialTreeParams {
  spot: number;
  strike: number;
  riskFreeRate: number;
  dividendYield: number;
  volatility: number;
  timeToExpiry: number;
  optionType: 'call' | 'put';
  exerciseType: 'european' | 'american';
  numSteps?: number; // Default 200
}

export interface BinomialTreeResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  earlyExercisePremium?: number; // American - European price
}

/**
 * Binomial Tree (Cox-Ross-Rubinstein) options pricing.
 *
 * Supports both European and American options.
 * American options can be exercised at any node — optimal early exercise is computed
 * by backward induction comparing intrinsic vs continuation value.
 *
 * CRR parameters:
 *   u = exp(σ√(T/N))    — up factor
 *   d = 1/u             — down factor
 *   p = (e^(r-q)dt - d) / (u - d) — risk-neutral probability of up move
 */
@Injectable()
export class BinomialTreeService {
  price(params: BinomialTreeParams): BinomialTreeResult {
    const {
      spot: S0, strike: K, riskFreeRate: r, dividendYield: q,
      volatility: σ, timeToExpiry: T,
      optionType, exerciseType, numSteps = 200,
    } = params;

    const isCall = optionType === 'call';
    const isAmerican = exerciseType === 'american';

    const dt = T / numSteps;
    const u = Math.exp(σ * Math.sqrt(dt));
    const d = 1 / u;
    const df = Math.exp(-r * dt);
    const p = (Math.exp((r - q) * dt) - d) / (u - d);
    const q_ = 1 - p;

    if (p < 0 || p > 1) {
      throw new Error(
        `Risk-neutral probability p=${p.toFixed(4)} is out of [0,1]. ` +
        `Reduce time step or check parameters.`,
      );
    }

    // Build terminal stock prices: S0 * u^j * d^(N-j) for j=0..N
    const V: number[] = new Array(numSteps + 1);
    for (let j = 0; j <= numSteps; j++) {
      const terminalS = S0 * Math.pow(u, j) * Math.pow(d, numSteps - j);
      V[j] = isCall ? Math.max(terminalS - K, 0) : Math.max(K - terminalS, 0);
    }

    // Backward induction
    for (let i = numSteps - 1; i >= 0; i--) {
      for (let j = 0; j <= i; j++) {
        const continuation = df * (p * V[j + 1] + q_ * V[j]);
        if (isAmerican) {
          const nodeS = S0 * Math.pow(u, j) * Math.pow(d, i - j);
          const intrinsic = isCall ? Math.max(nodeS - K, 0) : Math.max(K - nodeS, 0);
          V[j] = Math.max(continuation, intrinsic);
        } else {
          V[j] = continuation;
        }
      }
    }

    const price = V[0];

    // Greeks via finite difference on the tree
    const Su = S0 * u;
    const Sd = S0 * d;
    const deltaU = isCall ? Math.max(Su - K, 0) : Math.max(K - Su, 0);
    const deltaD = isCall ? Math.max(Sd - K, 0) : Math.max(K - Sd, 0);

    const delta = (deltaU - deltaD) / (Su - Sd);
    const gamma = 2 * (deltaU - price + deltaD - price) / ((Su - Sd) * (Su - Sd) / 4);
    const theta = (price - V[0]) / T; // Approximate

    // Early exercise premium (American - European)
    let earlyExercisePremium: number | undefined;
    if (isAmerican) {
      const euResult = this.price({ ...params, exerciseType: 'european' });
      earlyExercisePremium = Math.max(price - euResult.price, 0);
    }

    return { price, delta, gamma, theta, earlyExercisePremium };
  }
}
