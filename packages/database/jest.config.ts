export default {
  displayName: '@tpt/database integration',
  testEnvironment: 'node',
  // Integration tests are slow — allow up to 60 s per suite
  testTimeout: 60_000,
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', {
      tsconfig: {
        extends: '../../tsconfig.base.json',
        include: ['src/**/*.ts'],
      },
    }],
  },
  moduleNameMapper: {
    '^@tpt/shared(.*)$': '<rootDir>/../shared/src$1',
    '^@tpt/vault(.*)$': '<rootDir>/../vault/src$1',
  },
  // Only run files in __tests__/integration/ to avoid running them during unit test runs
  testMatch: ['**/__tests__/integration/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageDirectory: '../../coverage/packages/database',
  globalSetup: '<rootDir>/src/__tests__/integration/setup.ts',
  globalTeardown: '<rootDir>/src/__tests__/integration/teardown.ts',
};
