/* eslint-env node */
module.exports = {
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: './tsconfig.lint.json',
  },
  rules: {
    '@typescript-eslint/no-var-requires': 'off',
  },
};
