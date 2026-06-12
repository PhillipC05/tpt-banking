import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VaultEncryptionService } from './vault-encryption.service';

/**
 * Global module that provides VaultEncryptionService for PII column encryption.
 *
 * Import once in each app's AppModule:
 *   imports: [VaultModule, ...]
 *
 * Then inject VaultEncryptionService wherever SSN, tax IDs, or account numbers
 * must be encrypted before persistence.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [VaultEncryptionService],
  exports: [VaultEncryptionService],
})
export class VaultModule {}
