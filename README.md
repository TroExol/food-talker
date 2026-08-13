**English** u{00B7} [u{0420}u{0443}u{0441}u{0441}u{043A}u{0438}u{0439}](./README.ru.md)

# Food Talker

**A Telegram bot that answers "what should I eat tonight?" in plain language.**

Ask for *"something spicy and cheap near the centre"* and Food Talker interprets the request with an LLM,
searches restaurant menus semantically, and answers with concrete dishes rather than a list of links.

This repository holds the bot service. The retrieval stack it talks to — PostgreSQL/pgvector, Qdrant,
LightRAG and a GPU reranker — lives in [food-talker-root](https://github.com/TroExol/food-talker-root).

## How it works

1. **Understand** — the user's natural-language message is parsed by an LLM into structured intent
   (cuisine, price range, constraints, mood).
2. **Retrieve** — dishes and menus are retrieved by vector similarity from pgvector, with Redis caching
   hot lookups.
3. **Rerank** — candidates are re-scored by a dedicated reranker service before being shown, so the
   answer reflects the actual request rather than raw embedding distance.
4. **Respond** — results are formatted and returned in the Telegram chat.

Scheduled jobs (`node-cron`) keep menu data fresh in the background.

## Tech stack

| Layer | Technologies |
|-------|--------------|
| **Runtime** | Node.js 22, TypeScript (strict) |
| **Bot** | Telegraf |
| **LLM** | OpenAI SDK |
| **Storage** | PostgreSQL (pgvector), Redis, SQLite |
| **Scheduling** | node-cron |
| **Testing** | Vitest, `memfs` for filesystem fakes |
| **Quality** | ESLint (perfectionist, stylistic), Husky pre-commit, strict typecheck |

## Project structure

```
src/
├── bot/         # Telegram handlers and conversation flow
├── services/    # Retrieval, LLM and data services
├── research/    # Retrieval experiments and evaluation
├── config/      # Configuration and environment handling
├── types/       # Shared TypeScript types
├── utils/       # Helpers
└── index.ts     # Entry point
```

Tests are colocated as `*.test.ts` next to the code they cover. Internal imports use the `@/` path alias.

## Getting started

### Requirements

- Node.js `>=22.15.0 <23`
- npm >= 10
- A running instance of the [food-talker-root](https://github.com/TroExol/food-talker-root) stack
  (PostgreSQL with pgvector and Redis at minimum)

### Setup

```bash
npm install
cp env.example .env    # fill in the Telegram and OpenAI credentials
npm start
```

### Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run locally via `ts-node` with path aliases |
| `npm run typecheck` | Strict TypeScript check, no emit |
| `npm test` | Run Vitest once (CI-friendly) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run eslint:fix` | Lint and auto-fix |
| `npm run lint` | Typecheck + ESLint + tests (runs on pre-commit) |

## Conventions

- 2-space indentation, single quotes, semicolons required, 120-column limit.
- Imports sorted and grouped by `eslint-plugin-perfectionist`.
- Tests stay deterministic — no network, no real database or Redis; stub through interfaces instead.
- Never commit secrets; update `env.example` whenever configuration changes.
