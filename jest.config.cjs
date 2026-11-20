/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/api/src', '<rootDir>/apps/web/src', '<rootDir>/packages'],
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
        tsconfig: '<rootDir>/tsconfig.jest.json',
      },
    ],
  },
  clearMocks: true,
};
