import { configs } from '@awesome-code-style/eslint-config';

export default [
  {
    ignores: ['**/fixture/**/*', '**/dist/**/*', '**/lib/**/*'],
  },
  ...configs.default,
  ...configs.typeChecked,
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.jsx', '**/*.config.ts'],
    ...configs.disableTypeChecked,
  },
];
