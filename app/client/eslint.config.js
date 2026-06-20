import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

// Flat config for the Vite + React + TS client. Stylistic rules that would
// flood the existing codebase are set to "warn" so lint stays useful without
// blocking; correctness rules (rules-of-hooks) stay errors.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', '*.cjs', 'vite.config.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Enable only the two classic hook rules. The v7 plugin's recommended
      // preset also ships React-Compiler-era rules (e.g. set-state-in-effect)
      // that flag idiomatic data-loading effects across this codebase; those
      // are out of scope for this pass.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
);
