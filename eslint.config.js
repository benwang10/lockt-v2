// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
  {
    // Node-side tooling (jest config + DB test harness).
    files: ['tests/**/*.js', '*.config.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
]);
