export default {
  displayName: 'compliance',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
    }],
  },
  moduleNameMapper: {
    '^@tpt/shared(.*)$': '<rootDir>/../../packages/shared/src$1',
    '^@tpt/database(.*)$': '<rootDir>/../../packages/database/src$1',
    '^@tpt/common(.*)$': '<rootDir>/../../packages/common/src$1',
    '^@tpt/auth(.*)$': '<rootDir>/../../packages/auth/src$1',
    '^@tpt/kafka(.*)$': '<rootDir>/../../packages/kafka/src$1',
  },
  testMatch: ['**/__tests__/**/*.spec.ts', '**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageDirectory: '../../coverage/apps/compliance',
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts'],
};
