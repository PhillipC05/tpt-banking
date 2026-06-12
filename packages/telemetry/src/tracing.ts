import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | undefined;

export function initTelemetry(serviceName: string, serviceVersion = '1.0.0'): void {
  const otelEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318';
  const prometheusPort = parseInt(process.env['PROMETHEUS_PORT'] ?? '9464', 10);
  const metricsEnabled = process.env['OTEL_METRICS_EXPORTER'] !== 'none';
  const tracingEnabled = process.env['OTEL_TRACES_EXPORTER'] !== 'none';

  const metricReaders = [];

  if (metricsEnabled) {
    // Prometheus pull endpoint for Grafana scraping
    metricReaders.push(
      new PrometheusExporter({ port: prometheusPort }),
    );

    // OTLP push for centralized metrics collection
    if (process.env['NODE_ENV'] === 'production') {
      metricReaders.push(
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: `${otelEndpoint}/v1/metrics`,
          }),
          exportIntervalMillis: 30_000,
        }),
      );
    }
  }

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      'deployment.environment': process.env['NODE_ENV'] ?? 'development',
    }),
    traceExporter: tracingEnabled
      ? new OTLPTraceExporter({ url: `${otelEndpoint}/v1/traces` })
      : undefined,
    metricReader: metricReaders.length === 1 ? metricReaders[0] : undefined,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', async () => {
    try {
      await sdk?.shutdown();
    } catch (_) {
      // best-effort shutdown
    }
  });
}
