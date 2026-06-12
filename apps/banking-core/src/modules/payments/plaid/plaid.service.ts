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
import { CircuitBreaker } from '@tpt/integrations';

@Injectable()
export class PlaidService {
  private readonly logger = new Logger(PlaidService.name);
  private readonly client: PlaidApi;
  private readonly circuitBreaker = new CircuitBreaker('plaid');

  constructor(private readonly config: ConfigService) {
    const env = this.config.get<string>('PLAID_ENV', 'sandbox');
    const configuration = new Configuration({
      basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': this.config.getOrThrow<string>('PLAID_CLIENT_ID'),
          'PLAID-SECRET':    this.config.getOrThrow<string>('PLAID_SECRET'),
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
      client_name:   'TPT Banking',
      products,
      country_codes: [CountryCode.Us],
      language:      'en',
    };
    const response = await this.circuitBreaker.execute(() => this.client.linkTokenCreate(request));
    return response.data.link_token;
  }

  async exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
    const response = await this.circuitBreaker.execute(() =>
      this.client.itemPublicTokenExchange({ public_token: publicToken }),
    );
    return {
      accessToken: response.data.access_token,
      itemId:      response.data.item_id,
    };
  }

  async getAccountNumbers(accessToken: string): Promise<{
    routingNumber: string;
    accountNumber: string;
    accountType: string;
  } | null> {
    const response = await this.circuitBreaker.execute(() =>
      this.client.authGet({ access_token: accessToken }),
    );
    const numbers  = response.data.numbers.ach?.[0];
    const accounts = response.data.accounts?.[0];
    if (!numbers || !accounts) return null;

    return {
      routingNumber: numbers.routing,
      accountNumber: numbers.account,
      accountType:   accounts.subtype ?? accounts.type,
    };
  }

  async createPayment(params: {
    accessToken: string;
    accountId: string;
    amount: number;
    currency: string;
    description: string;
  }): Promise<{ paymentId: string; status: string }> {
    const response = await this.circuitBreaker.execute(() =>
      this.client.processorTokenCreate({
        access_token: params.accessToken,
        account_id:   params.accountId,
        processor:    ProcessorTokenCreateRequestProcessorEnum.Dwolla,
      }),
    );
    this.logger.log(`Plaid payment initiated. Processor token: ${response.data.processor_token.slice(0, 10)}...`);
    return { paymentId: `plaid_mock_${Date.now()}`, status: 'PENDING' };
  }

  async getPaymentStatus(paymentId: string): Promise<string> {
    this.logger.debug(`Checking status for payment ${paymentId}`);
    return 'PENDING';
  }
}
