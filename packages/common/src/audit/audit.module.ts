import { Module } from '@nestjs/common';
import { KafkaModule } from '@tpt/kafka';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';

/**
 * Import AuditModule in any app module that needs audit logging.
 *
 * It registers KafkaModule internally with a dedicated client ID so it does
 * not collide with other Kafka clients registered by the host app.
 *
 * Usage in AppModule:
 *   imports: [AuditModule, ...]
 *
 * Then inject AuditService wherever explicit audit calls are needed, or
 * register AuditInterceptor globally in main.ts:
 *   app.useGlobalInterceptors(app.get(AuditInterceptor));
 */
@Module({
  imports: [
    KafkaModule.register({
      clientId: 'tpt-audit',
      groupId: 'tpt-audit-group',
    }),
  ],
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
