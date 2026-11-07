/**
 * Two test projects:
 *  - unit: pure TypeScript logic (timer math, calendar weeks, stats, validation).
 *          Runs in the America/Los_Angeles time zone so DST cases are exercised.
 *  - ui:   screens rendered with expo-router/testing-library (navigation, states).
 *  - web:  components rendered through react-native-web into a DOM
 *          (*.web.test.tsx): keyboard activation, ARIA state, links.
 *  - db:   applies the real migrations to a PostgreSQL server and exercises
 *          RLS, RPCs and constraints exactly the way PostgREST would
 *          (role = authenticated + request.jwt.claims). Requires DATABASE_URL
 *          (see README). Run with `npm run test:db`.
 */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      preset: 'jest-expo/node',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      globalSetup: '<rootDir>/tests/unit-global-setup.js',
    },
    {
      displayName: 'ui',
      // Screens rendered with expo-router's in-memory router + React Native Testing Library.
      preset: 'jest-expo/ios',
      testMatch: ['<rootDir>/src/**/*.test.tsx'],
      testPathIgnorePatterns: ['\\.web\\.test\\.tsx$'],
      globalSetup: '<rootDir>/tests/unit-global-setup.js',
      setupFiles: ['<rootDir>/tests/ui-setup.js'],
    },
    {
      displayName: 'web',
      // The same components rendered by react-native-web into jsdom.
      preset: 'jest-expo/web',
      testMatch: ['<rootDir>/src/**/*.web.test.tsx'],
      // react-native-svg's web build imports the asset registry that Metro aliases for web.
      moduleNameMapper: {
        '^@react-native/assets-registry/registry$': 'react-native-web/dist/cjs/modules/AssetRegistry',
      },
      globalSetup: '<rootDir>/tests/unit-global-setup.js',
      setupFiles: ['<rootDir>/tests/ui-setup.js'],
    },
    {
      displayName: 'db',
      preset: 'jest-expo/node',
      testMatch: ['<rootDir>/tests/db/**/*.test.ts'],
      globalSetup: '<rootDir>/tests/db/global-setup.js',
      testTimeout: 30000,
    },
  ],
};
