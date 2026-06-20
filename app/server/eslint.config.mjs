import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Flat config for the Node + Express + TS server. This package is CommonJS
// ("type" is unset in package.json), so the config is an .mjs file to keep
// ESM import syntax. Stylistic rules are warnings so lint stays useful on the
// existing codebase without blocking.
export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // `declare global { namespace Express { ... } }` is the canonical way to
      // augment Express Request, so allow declaration namespaces.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
);
