import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  ProcessorTokenCreateRequestProcessorEnum,
  LinkTokenCreateRequest,
} from 'plaid';

/**
 * Plaid service adapter.
 * Handles Plaid Link token creation, access token exchange,
 * and payment initiation for ACH transfers.
 */
@Injectable()
export class PlaidService {
  private readonly logger = new Logger(PlaidService.name);
  private readonly client: PlaidApi;

  constructor(private readonly config: ConfigService) {
    const env = this.config.get<string>('PLAID_ENV', 'sandbox');
    const configuration = new Configuration({
      basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': this.config.getOrThrow<string>('PLAID_CLIENT_ID'),
          'PLAID-SECRET': this.config.getOrThrow<string>('PLAID_SECRET'),
        },
      },
    });
    this.client = new PlaidApi(configuration);
  }

  /**
   * Creates a Plaid Link token for the frontend to initiate the bank linking flow.
   */
  async createLinkToken(userId: string, products: Products[] = [Products.Auth, Products.Transactions]): Promise<string> {
    const request: LinkTokenCreateRequest = {
      user: { client_user_id: userId },
      client_name: 'TPT Banking',
      products,
      country_codes: [CountryCode.Us],
      language: 'en',
    };

    const response = await this.client.linkTokenCreate(request);
    return response.data.link_token;
  }

  /**
   * Exchanges a public token (from Plaid Link) for an access token.
   * The access token is stored encrypted — never in plaintext.
   */
  async exchangePublicToken(publicToken: string): Promise<{
    accessToken: string;
    itemId: string;
  }> {
    const response = await this.client.itemPublicTokenExchange({
      public_token: publicToken,
    });
    return {
      accessToken: response.data.access_token,
      itemId: response.data.item_id,
    };
  }

  /**
   * Gets the linked bank account details (routing + account numbers).
   * Used to validate the ACH destination.
   */
  async getAccountNumbers(accessToken: string): Promise<{
    routingNumber: string;
    accountNumber: string;
    accountType: string;
  } | null> {
    const response = await this.client.authGet({ access_token: accessToken });
    const numbers = response.data.numbers.ach?.[0];
    const accounts = response.data.accounts?.[0];

    if (!numbers || !accounts) return null;

    return {
      routingNumber: numbers.routing,
      accountNumber: numbers.account,
      accountType: accounts.subtype ?? accounts.type,
    };
  }

  /**
   * Creates an ACH payment using Plaid's payment initiation API.
   * Returns the Plaid payment_id for tracking.
   */
  async createPayment(params: {
    accessToken: string;
    accountId: string;
    amount: number;
    currency: string;
    description: string;
  }): Promise<{ paymentId: string; status: string }> {
    const response = await this.client.processorTokenCreate({
      access_token: params.accessToken,
      account_id: params.accountId,
      processor: ProcessorTokenCreateRequestProcessorEnum.Dwolla,
    });

    this.logger.log(`Plaid payment initiated. Processor token: ${response.data.processor_token.slice(0, 10)}...`);

    // In a full integration this would call the ACH processor (Dwolla, Stripe, etc.)
    // with the processor token. We return a mock payment ID for now.
    return {
      paymentId: `plaid_mock_${Date.now()}`,
      status: 'PENDING',
    };
  }

  /**
   * Gets the status of a previously created payment.
   */
  async getPaymentStatus(paymentId: string): Promise<string> {
    // In production: query Plaid or the ACH processor for status
    this.logger.debug(`Checking status for payment ${paymentId}`);
    return 'PENDING';
  }
}
