# Repository Guidelines

## Project Structure & Module Organization

This repository is a pnpm workspace. `apps/web` contains the Next.js 16 App Router application: routes live in `src/app`, app-specific components in `src/components`, translations in `messages`, and images/fonts in `src/assets`. Shared code is split into `packages/*`: `ui` provides reusable shadcn/Tailwind components, `api` contains tRPC routers and business logic, `auth` configures Better Auth, `db` owns Drizzle schemas and migrations, and `env` validates configuration. Import app code through `@/` and shared modules through `@masc-landing/*`; do not reach into unexported package internals.

## Build, Test, and Development Commands

Run commands from the repository root with pnpm 11.9.0.

- `pnpm install` installs and links all workspace dependencies.
- `pnpm dev:web` starts only the Next.js app; `pnpm dev` starts every available development script.
- `pnpm build` builds all workspace packages that define a build script.
- `pnpm check-types` runs available package type checks. For the web app, also run `pnpm --filter web exec tsc --noEmit`.
- `pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:push` manage Drizzle schema changes. Confirm the target database before applying changes.

## Coding Style & Naming Conventions

Use strict TypeScript and match nearby formatting (tabs are common in TS/TSX). Components use PascalCase exports in kebab-case files, such as `AuthForm` in `auth-form.tsx`; functions and variables use camelCase. Keep pages as Server Components unless hooks or browser APIs require `"use client"`. Put reusable primitives in `packages/ui` and page-specific compositions in `apps/web`. User-facing text must be added to both `messages/en.json` and `messages/vi.json`. No formatter or linter is currently configured, so avoid unrelated formatting churn.

## Testing Guidelines

There is no automated test framework or coverage threshold yet. Validate every change with relevant TypeScript checks and `pnpm build` when environment variables are available. For UI changes, manually test desktop and mobile layouts, keyboard interaction, and both locales. If adding tests, colocate them as `*.test.ts` or `*.test.tsx` and add the runner command to the owning package.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commit prefixes such as `feat:`, `fix:`, `style:`, `docs:`, and `chore:`. Use an imperative, focused subject and keep each commit cohesive. Pull requests should explain the change and validation performed, link related issues, call out schema or environment changes, and include before/after screenshots for visible UI work. Never commit `.env` files or secrets.
