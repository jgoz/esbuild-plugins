module.exports = {
  ...require('@awesome-code-style/prettier-config'),
  overrides: [
    {
      files: ['*.md'],
      options: {
        printWidth: 80,
      },
    },
  ],
};
