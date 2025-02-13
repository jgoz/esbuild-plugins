import globals from 'globals';
import { configs } from '@awesome-code-style/eslint-config';

export default [
  {
    ignores: ['**/fixture/**/*', '**/dist/**/*', '**/lib/**/*'],
  },
  ...configs.default,
  configs.disableTypeChecked,
  {
    files: ['**/bundle.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  {
    files: ['**/*.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
