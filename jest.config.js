/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.jest.json",
      },
    ],
  },
  collectCoverageFrom: [
    "**/*.ts",
    "!**/node_modules/**",
    "!**/dist/**",
    "!**/data/**",
    "!**/*.module.ts",
    "!**/main.ts",
  ],
  coverageDirectory: "./coverage",
  testEnvironment: "node",
  roots: [
    "<rootDir>/packages/",
    "<rootDir>/core/",
    "<rootDir>/agent/",
    "<rootDir>/test/",
  ],
  moduleNameMapper: {
    "^@nl2sql/auth$": "<rootDir>/packages/auth/src/index.ts",
    "^@nl2sql/logger$": "<rootDir>/packages/logger/src/index.ts",
    "^\\.prisma/auth-client$":
      "<rootDir>/core/src/__mocks__/prisma-auth-client.ts",
  },
  testTimeout: 15000,
};
