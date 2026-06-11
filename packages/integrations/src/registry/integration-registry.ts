import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderAdapter } from '../adapters/provider-adapter.abstract';

@Injectable()
export class IntegrationRegistry {
  private readonly logger = new Logger(IntegrationRegistry.name);
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.name(), adapter);
    this.logger.log(`Provider adapter registered: ${adapter.name()}`);
  }

  getAdapter(id: string): ProviderAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new NotFoundException(`No adapter registered for provider: ${id}`);
    }
    return adapter;
  }

  listConfigured(cfg: ConfigService): string[] {
    return [...this.adapters.values()]
      .filter((a) => a.isConfigured(cfg))
      .map((a) => a.name());
  }

  listAll(): string[] {
    return [...this.adapters.keys()];
  }
}
