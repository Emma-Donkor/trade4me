/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: [
    '<rootDir>/apps/api/src',
    '<rootDir>/apps/api/test',
    '<rootDir>/apps/web/src',
    '<rootDir>/packages',
    '<rootDir>/tests',
  ],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@ts/types$': '<rootDir>/packages/types/src',
    '^@ts/validation$': '<rootDir>/packages/validation/src',
    '^@ts/config$': '<rootDir>/packages/config/src',
    '^@ts/database$': '<rootDir>/packages/database/src',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // One CommonJS transform for every test workspace, including the
        // root `tests/` folder which sits under this ESM package.json.
        tsconfig: '<rootDir>/tsconfig.jest.json',
      },
    ],
  },
  // Every DB-backed suite shares the single disposable `tradesense_test`
  // database, and database.integration.test.ts intentionally runs
  // `prisma migrate reset` (which drops the whole schema) to verify the reset
  // contract. Parallel workers let that reset land while other suites are
  // mid-query, producing "relation ... does not exist" failures. Pin Jest to
  // one worker so *every* invocation (npm test, npx jest, CI, IDE) is safe.
  maxWorkers: 1,
  clearMocks: true,
};
