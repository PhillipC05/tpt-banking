import { createHmac, timingSafeEqual } from 'crypto';

export abstract class WebhookValidator {
  abstract validate(
    headers: Record<string, string>,
    rawBody: Buffer,
    secret: string,
  ): boolean;
}

export interface HmacWebhookValidatorOptions {
  /** Header name that carries the signature. e.g. 'x-stripe-signature', 'x-jumio-signature' */
  signatureHeader: string;
  /** Optional prefix to strip from the header value before comparing. e.g. 'sha256=' */
  prefix?: string;
}

export class HmacWebhookValidator extends WebhookValidator {
  constructor(private readonly options: HmacWebhookValidatorOptions) {
    super();
  }

  validate(
    headers: Record<string, string>,
    rawBody: Buffer,
    secret: string,
  ): boolean {
    const headerVal = headers[this.options.signatureHeader.toLowerCase()];
    if (!headerVal) return false;

    const incoming = this.options.prefix && headerVal.startsWith(this.options.prefix)
      ? headerVal.slice(this.options.prefix.length)
      : headerVal;

    const expected = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    try {
      return timingSafeEqual(Buffer.from(incoming, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      // Buffer lengths may differ if header value is not valid hex — treat as invalid
      return false;
    }
  }
}

export class ApiKeyWebhookValidator extends WebhookValidator {
  constructor(private readonly headerName: string) {
    super();
  }

  validate(
    headers: Record<string, string>,
    _rawBody: Buffer,
    secret: string,
  ): boolean {
    const headerVal = headers[this.headerName.toLowerCase()];
    if (!headerVal) return false;

    try {
      return timingSafeEqual(
        Buffer.from(headerVal),
        Buffer.from(secret),
      );
    } catch {
      return false;
    }
  }
}
