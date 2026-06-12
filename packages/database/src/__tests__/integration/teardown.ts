/**
 * Jest globalTeardown — runs once after all integration test suites.
 * No-op for now; individual test suites manage their own DataSource lifecycle.
 */
export default async function teardown(): Promise<void> {
  // Nothing to do globally — each spec file opens and closes its own DataSource.
  console.log('[integration] Teardown complete.');
}
