import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';
import sgMail from '@sendgrid/mail';
import * as nodemailer from 'nodemailer';
import * as postmark from 'postmark';
import { SESClient } from '@aws-sdk/client-ses';
import * as awsSes from '@aws-sdk/client-ses';

export interface EmailNotification {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export interface SmsNotification {
  to: string;
  body: string;
}

export type NotificationType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'TRANSFER_COMPLETED'
  | 'TRANSFER_FAILED'
  | 'CARD_TRANSACTION'
  | 'CARD_DECLINED'
  | 'CARD_FROZEN'
  | 'WIRE_INITIATED'
  | 'WIRE_COMPLETED'
  | 'ACH_COMPLETED'
  | 'LOAN_APPROVED'
  | 'LOAN_DECLINED'
  | 'LOAN_PAYMENT_DUE'
  | 'LOAN_PAYMENT_MISSED'
  | 'OTP_CODE'
  | 'ACCOUNT_FROZEN'
  | 'LOW_BALANCE_ALERT';

type EmailProvider = 'sendgrid' | 'ses' | 'postmark' | 'smtp' | 'stub';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly twilioClient: Twilio.Twilio | null;
  private readonly fromNumber: string;

  private readonly emailProvider: EmailProvider;
  private readonly emailFrom: string;
  private nodemailerTransport: nodemailer.Transporter | null = null;
  private postmarkClient: postmark.ServerClient | null = null;

  constructor(private readonly config: ConfigService) {
    // ── SMS (Twilio) ──────────────────────────────────────────────────────────
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken  = this.config.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber  = this.config.get<string>('TWILIO_FROM_NUMBER', '');

    if (accountSid && authToken) {
      this.twilioClient = Twilio(accountSid, authToken);
    } else {
      this.logger.warn('Twilio not configured — SMS notifications disabled');
      this.twilioClient = null;
    }

    // ── Email provider ────────────────────────────────────────────────────────
    this.emailFrom = this.config.get<string>('EMAIL_FROM', 'noreply@tptbanking.com');

    // Explicit provider selection; falls back to auto-detection.
    const requested = this.config.get<string>('EMAIL_PROVIDER', '').toLowerCase();
    this.emailProvider = this.initEmailProvider(requested as EmailProvider);

    this.logger.log(`Email provider: ${this.emailProvider}`);
  }

  private initEmailProvider(requested: EmailProvider | ''): EmailProvider {
    const cfg = this.config;

    const trySendGrid = (): boolean => {
      const key = cfg.get<string>('SENDGRID_API_KEY');
      if (!key) return false;
      sgMail.setApiKey(key);
      // EMAIL_FROM / SENDGRID_FROM_EMAIL — both accepted
      const from = cfg.get<string>('SENDGRID_FROM_EMAIL');
      if (from) (this as { emailFrom: string }).emailFrom = from;
      return true;
    };

    const tryPostmark = (): boolean => {
      const token = cfg.get<string>('POSTMARK_SERVER_TOKEN');
      if (!token) return false;
      this.postmarkClient = new postmark.ServerClient(token);
      return true;
    };

    const trySes = (): boolean => {
      const region    = cfg.get<string>('AWS_SES_REGION') ?? cfg.get<string>('AWS_REGION');
      const accessKey = cfg.get<string>('AWS_ACCESS_KEY_ID');
      const secret    = cfg.get<string>('AWS_SECRET_ACCESS_KEY');
      if (!region) return false;
      const sesClient = new SESClient({
        region,
        ...(accessKey && secret ? { credentials: { accessKeyId: accessKey, secretAccessKey: secret } } : {}),
      });
      this.nodemailerTransport = nodemailer.createTransport({ SES: { ses: sesClient, aws: awsSes } });
      return true;
    };

    const trySmtp = (): boolean => {
      const host = cfg.get<string>('SMTP_HOST');
      if (!host) return false;
      const port   = cfg.get<number>('SMTP_PORT', 587);
      const secure = cfg.get<boolean>('SMTP_SECURE', port === 465);
      const user   = cfg.get<string>('SMTP_USER');
      const pass   = cfg.get<string>('SMTP_PASS');
      this.nodemailerTransport = nodemailer.createTransport({
        host, port, secure,
        ...(user ? { auth: { user, pass } } : {}),
      });
      return true;
    };

    // Explicit provider requested
    if (requested === 'sendgrid') {
      if (trySendGrid()) return 'sendgrid';
      this.logger.warn('EMAIL_PROVIDER=sendgrid but SENDGRID_API_KEY missing — falling back to stub');
      return 'stub';
    }
    if (requested === 'postmark') {
      if (tryPostmark()) return 'postmark';
      this.logger.warn('EMAIL_PROVIDER=postmark but POSTMARK_SERVER_TOKEN missing — falling back to stub');
      return 'stub';
    }
    if (requested === 'ses') {
      if (trySes()) return 'ses';
      this.logger.warn('EMAIL_PROVIDER=ses but AWS_SES_REGION missing — falling back to stub');
      return 'stub';
    }
    if (requested === 'smtp') {
      if (trySmtp()) return 'smtp';
      this.logger.warn('EMAIL_PROVIDER=smtp but SMTP_HOST missing — falling back to stub');
      return 'stub';
    }

    // Auto-detect: first configured provider wins
    if (trySendGrid()) return 'sendgrid';
    if (tryPostmark()) return 'postmark';
    if (trySes())      return 'ses';
    if (trySmtp())     return 'smtp';

    this.logger.warn('No email provider configured — email notifications will be logged only');
    return 'stub';
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async sendSms(notification: SmsNotification): Promise<void> {
    if (!this.twilioClient || !this.fromNumber) {
      this.logger.debug(`[SMS STUB] To: ${notification.to} | Body: ${notification.body}`);
      return;
    }
    try {
      const message = await this.twilioClient.messages.create({
        body: notification.body,
        from: this.fromNumber,
        to: notification.to,
      });
      this.logger.log(`SMS sent: ${message.sid} to ${notification.to}`);
    } catch (err) {
      this.logger.error(`Failed to send SMS to ${notification.to}: ${err}`);
    }
  }

  async sendEmail(notification: EmailNotification): Promise<void> {
    try {
      switch (this.emailProvider) {
        case 'sendgrid':
          await sgMail.send({
            to: notification.to,
            from: this.emailFrom,
            subject: notification.subject,
            html: notification.htmlBody,
            text: notification.textBody,
          });
          break;

        case 'postmark':
          await this.postmarkClient!.sendEmail({
            From: this.emailFrom,
            To: notification.to,
            Subject: notification.subject,
            HtmlBody: notification.htmlBody,
            TextBody: notification.textBody ?? '',
            MessageStream: 'outbound',
          });
          break;

        case 'ses':
        case 'smtp':
          await this.nodemailerTransport!.sendMail({
            from: this.emailFrom,
            to: notification.to,
            subject: notification.subject,
            html: notification.htmlBody,
            text: notification.textBody,
          });
          break;

        default:
          this.logger.log(`[EMAIL STUB] To: ${notification.to} | Subject: ${notification.subject}`);
          this.logger.debug(`Email body (text): ${notification.textBody ?? 'N/A'}`);
          return;
      }
      this.logger.log(`Email sent via ${this.emailProvider} to ${notification.to} | Subject: ${notification.subject}`);
    } catch (err) {
      this.logger.error(`Email send failed (${this.emailProvider}) for ${notification.to}: ${err}`);
    }
  }

  // ── Notification helpers ────────────────────────────────────────────────────

  async notifyTransactionCompleted(params: {
    to: string;
    phone?: string;
    amount: string;
    currency: string;
    transactionNumber: string;
    destination?: string;
  }): Promise<void> {
    const formattedAmount = `${parseFloat(params.amount).toFixed(2)} ${params.currency}`;

    await Promise.all([
      this.sendEmail({
        to: params.to,
        subject: `Transfer completed — ${formattedAmount}`,
        htmlBody: `
          <p>Your transfer of <strong>${formattedAmount}</strong> has been completed.</p>
          <p>Reference: ${params.transactionNumber}</p>
          ${params.destination ? `<p>To: ${params.destination}</p>` : ''}
        `,
        textBody: `Transfer of ${formattedAmount} completed. Reference: ${params.transactionNumber}`,
      }),
      params.phone
        ? this.sendSms({
            to: params.phone,
            body: `TPT Banking: Transfer of ${formattedAmount} completed. Ref: ${params.transactionNumber}`,
          })
        : Promise.resolve(),
    ]);
  }

  async notifyOtpCode(params: {
    phone: string;
    code: string;
    purpose: string;
  }): Promise<void> {
    await this.sendSms({
      to: params.phone,
      body: `TPT Banking security code: ${params.code}. Valid for 5 minutes. Purpose: ${params.purpose}. Do not share this code.`,
    });
  }

  async notifyLoanDecision(params: {
    to: string;
    loanNumber: string;
    approved: boolean;
    amount?: string;
    reason?: string;
  }): Promise<void> {
    const subject = params.approved
      ? `Loan approved — ${params.loanNumber}`
      : `Loan decision — ${params.loanNumber}`;

    await this.sendEmail({
      to: params.to,
      subject,
      htmlBody: params.approved
        ? `<p>Congratulations! Your loan application <strong>${params.loanNumber}</strong> has been approved for <strong>${params.amount}</strong>.</p>`
        : `<p>Your loan application <strong>${params.loanNumber}</strong> was not approved. Reason: ${params.reason ?? 'Does not meet criteria'}.</p>`,
    });
  }

  async notifyCardEvent(params: {
    to: string;
    phone?: string;
    event: 'TRANSACTION' | 'DECLINED' | 'FROZEN';
    cardLastFour: string;
    amount?: string;
    merchant?: string;
  }): Promise<void> {
    let smsBody = '';
    let emailSubject = '';

    switch (params.event) {
      case 'TRANSACTION':
        smsBody = `TPT Banking: Card ****${params.cardLastFour} charged ${params.amount} at ${params.merchant ?? 'merchant'}.`;
        emailSubject = `Card transaction — ****${params.cardLastFour}`;
        break;
      case 'DECLINED':
        smsBody = `TPT Banking: Card ****${params.cardLastFour} declined at ${params.merchant ?? 'merchant'}. Check available balance.`;
        emailSubject = `Card declined — ****${params.cardLastFour}`;
        break;
      case 'FROZEN':
        smsBody = `TPT Banking: Card ****${params.cardLastFour} has been frozen. Contact us if this was unexpected.`;
        emailSubject = `Card frozen — ****${params.cardLastFour}`;
        break;
    }

    const tasks: Promise<void>[] = [
      this.sendEmail({ to: params.to, subject: emailSubject, htmlBody: `<p>${smsBody}</p>` }),
    ];
    if (params.phone) tasks.push(this.sendSms({ to: params.phone, body: smsBody }));
    await Promise.all(tasks);
  }
}
