import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

export interface KafkaModuleOptions {
  clientId: string;
  groupId: string;
  brokers?: string[];
}

/**
 * Dynamic NestJS module that registers a Kafka client provider.
 * Import in any NestJS module that needs to publish to Kafka.
 *
 * Usage:
 *   KafkaModule.register({ clientId: 'banking-core', groupId: 'banking-core-group' })
 */
@Module({})
export class KafkaModule {
  static register(options: KafkaModuleOptions): DynamicModule {
    const brokers = options.brokers ?? (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');

    return {
      module: KafkaModule,
      imports: [
        ClientsModule.register([
          {
            name: 'KAFKA_CLIENT',
            transport: Transport.KAFKA,
            options: {
              client: {
                clientId: options.clientId,
                brokers,
              },
              consumer: {
                groupId: options.groupId,
              },
              producer: {
                allowAutoTopicCreation: true,
              },
            },
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
