// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// React Compiler rules (eslint-plugin-react-hooks v7) report as warnings: the
// compiler is off, so these flag code it couldn't optimise, not bugs.
const REACT_COMPILER_RULES = [
  'refs',
  'set-state-in-effect',
  'set-state-in-render',
  'purity',
  'immutability',
  'static-components',
  'preserve-manual-memoization',
  'incompatible-library',
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '**/*.old.ts', '**/*.old.tsx', '.cursor-skills-cursor/**'],
  },
  {
    rules: Object.fromEntries(REACT_COMPILER_RULES.map((r) => [`react-hooks/${r}`, 'warn'])),
  },
  {
    // Node-run CommonJS: config plugins and build scripts.
    files: ['plugins/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { __dirname: 'readonly', __filename: 'readonly', require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly' },
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: { describe: 'readonly', it: 'readonly', expect: 'readonly', jest: 'readonly', beforeEach: 'readonly', afterEach: 'readonly' },
    },
  },
]);
