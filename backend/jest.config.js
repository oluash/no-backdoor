/**
 * No-Backdoor System Architecture — Jest Configuration
 *
 * Configures Jest for integration testing with TypeScript support,
 * path alias resolution, coverage collection, and test timeouts.
 */

/** @type {import('jest').Config} */
module.exports = {
  // Use ts-jest for TypeScript transpilation
  preset: 'ts-jest',

  // Node environment (no DOM needed for API tests)
  testEnvironment: 'node',

  // Run setup file after Jest is initialized
  setupFilesAfterEnv: ['./tests/setup.ts'],

  // Module path aliases (must match tsconfig.json paths)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
  ],

  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/server.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/dist/',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],

  // Coverage thresholds (enforced in CI)
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },

  // 30-second timeout for integration tests (DB ops, file I/O)
  testTimeout: 30000,

  // Verbose output in CI, minimal locally
  verbose: process.env.CI === 'true',

  // Clear mock calls between tests
  clearMocks: true,

  // Restore mock state between tests
  restoreMocks: true,

  // Detect open handles (useful for catching unclosed DB connections)
  detectOpenHandles: true,

  // Force exit after all tests complete (prevents hanging from open handles)
  forceExit: true,
};
