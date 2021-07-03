/* eslint-env node */
module.exports = {
  extends: '@awesome-code-style',
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: './tsconfig.lint.json',
  },
  overrides: [
    { files: '*.js', env: { browser: true } },
    { files: 'build.mjs', env: { node: true } },
  ],
};
