# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript source organized by domain (e.g., `bot/`, `services/`, `config/`). Prefer path alias imports via `@/` (see `tsconfig.json`) instead of deep relatives.
- Tests: colocated `*.test.ts` next to source (e.g., `src/bot/.../*.test.ts`).
- `__mocks__/`: shared test doubles and fixtures.
- `docs/`: project documentation.
- Env: copy `env.example` to `.env` and fill required values.

## Build, Test, and Development Commands
- `npm start`: run the app locally with `ts-node` and path aliases.
- `npm run typecheck`: TypeScript strict checking, no emit.
- `npm test`: run Vitest once (CI-friendly).
- `npm run test:watch`: run Vitest in watch mode.
- `npm run eslint` / `npm run eslint:fix`: lint and auto-fix per repo rules.
- `npm run lint`: run typecheck, ESLint, and tests (used by pre-commit).

## Coding Style & Naming Conventions
- Language: TypeScript (Node >= `22.15.x`). Use `@/` alias for internal imports.
- Indentation: 2 spaces; quotes: single; semicolons: required; max line length: 120.
- Imports: sorted and grouped with `eslint-plugin-perfectionist` and `eslint-plugin-import-newlines`.
- File layout: follow existing patterns (e.g., `ServiceName/ServiceName.ts`), tests as `*.test.ts` next to code.
- Run `npm run eslint:fix` before committing.

## Testing Guidelines
- Framework: Vitest. Co-locate unit tests as `*.test.ts`.
- Use `__mocks__/` for cross-cutting fakes; prefer explicit, local test doubles otherwise.
- Keep tests deterministic and fast; avoid network and real DB/Redis — stub via interfaces.
- Quick cycle: `npm run test:watch`; CI-like: `npm test`.

## Commit & Pull Request Guidelines
- Commits: clear, imperative subject (e.g., "feat: add rate limiter"); group related changes; keep scope focused.
- Hooks: Husky runs `npm run lint` on pre-commit; ensure it passes locally.
- PRs: include rationale, summary of changes, testing notes/steps, linked issues (e.g., `#123`), and screenshots/logs when relevant.
- Keep diffs small and reviewable; update docs and `env.example` when config changes.

## Security & Configuration Tips
- Never commit secrets. Use `.env` (from `env.example`) and environment-specific overrides.
- Respect engines (`.nvmrc`, `package.json`) to avoid version drift.
- Prefer `@/` imports over `src/...` to keep module boundaries clear.

