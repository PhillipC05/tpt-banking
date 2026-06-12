export default {
  displayName: '@tpt/shared',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', {
      tsconfig: {
        extends: '../../tsconfig.base.json',
        include: ['src/**/*.ts'],
      },
    }],
  },
  testMatch: ['**/__tests__/**/*.spec.ts', '**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageDirectory: '../../coverage/packages/shared',
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
};
