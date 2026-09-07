## Linting and formatting

- After making code changes, run `pnpm lint:fix`, then run `pnpm fmt`.
- Before finishing, run `pnpm lint --deny-warnings --format=agent`.

## Testing

- Run `pnpm build` and then `pnpm test`
- Use `pnpm --filter=<pkg> test` to run tests in a specific package