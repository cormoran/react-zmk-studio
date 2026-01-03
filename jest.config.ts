import { type JestConfigWithTsJest, createDefaultPreset } from "ts-jest";

const config: JestConfigWithTsJest = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  // jest cannot resolve package.json "exports" field correctly yet
  moduleNameMapper: {
    "^@zmkfirmware/zmk-studio-ts-client$":
      "<rootDir>/node_modules/@zmkfirmware/zmk-studio-ts-client/lib/index.js",
    "^@zmkfirmware/zmk-studio-ts-client/(.*)$":
      "<rootDir>/node_modules/@zmkfirmware/zmk-studio-ts-client/lib/$1.js",
  },
  ...createDefaultPreset({
    useESM: true,
    isolateModules: true,
    tsconfig: {
      jsx: "react",
    },
  }),
  //   testMatch: ["**/test/**/*.spec.ts", "**/test/**/*.spec.tsx"],
  //   collectCoverageFrom: ["<rootDir>/src/**/*.ts", "!<rootDir>/src/index.ts"],
  // extensionsToTreatAsEsm: [".ts"],
  //   moduleNameMapper: {
  //     "^(\\.{1,2}/.*)\\.js$": "$1",
  //   },
  //   transform: {
  //     "^.+\\.tsx?$": [
  //       "ts-jest",
  //       {
  //         useESM: true,
  //         diagnostics: false,
  //         isolatedModules: true,
  //         tsconfig: {
  //           jsx: "react",
  //         },
  //       },
  //     ],
  //   },
};

export default config;
