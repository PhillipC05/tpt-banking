import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';

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

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly twilioClient: Twilio.Twilio | null;
  private readonly fromNumber: string;

  constructor(private readonly config: ConfigService) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.config.get<string>('TWILIO_FROM_NUMBER', '');

    if (accountSid && authToken) {
      this.twilioClient = Twilio(accountSid, authToken);
    } else {
      this.logger.warn('Twilio not configured — SMS notifications disabled');
      this.twilioClient = null;
    }
  }

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
    // In production: use SendGrid, AWS SES, or Postmark SDK
    // For now we log the email (stub)
    this.logger.log(`[EMAIL STUB] To: ${notification.to} | Subject: ${notification.subject}`);
    this.logger.debug(`Email body (text): ${notification.textBody ?? 'N/A'}`);
  }

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
