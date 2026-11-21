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
  clearMocks: true,
};
