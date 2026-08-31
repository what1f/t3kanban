# Contributing to T3 Kanban

Thanks for helping improve T3 Kanban.

## Before you start

- Search existing issues before opening a new one.
- Keep each issue or pull request focused on one problem.
- For a substantial feature or product change, open an issue first so the direction can be discussed before implementation.
- T3 Kanban is a fork of [T3 Code](https://github.com/pingdotgg/t3code). Changes to the underlying agent platform may be a better fit upstream.

## Development

Use the toolchain pinned by the repository:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Development state is stored in the ignored `.t3/` directory. Do not point a development server at an existing T3 Code data directory.

Before submitting a change, run the smallest relevant tests and type checks for the packages you touched. UI changes should include before/after screenshots; interaction or timing changes should include a short recording.

## Pull requests

Explain the problem, the chosen solution, and how you verified it. Preserve the project’s local-first behavior and keep unrelated refactors out of the same pull request.

By contributing, you agree that your contribution is licensed under the repository’s MIT License.
