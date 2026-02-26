export default {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {},
  globalSetup: './src/tests/globalSetup.cjs',
  testMatch: ['**/src/tests/**/*.test.js'],
  forceExit: true,
  testTimeout: 30000,
};
