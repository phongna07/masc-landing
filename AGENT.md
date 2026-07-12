# MASC Landing — agent guide

This is a pnpm workspace for MASC Supernova '26: a public landing page, Google-authenticated registration dashboard, and an admin-only placeholder. Keep changes small, cohesive, and consistent with the existing visual language.

## Workspace map

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js 16 App Router application, routes, page-specific components/styles, assets, and translations |
| `packages/ui` | Shared shadcn/Base UI primitives and global Tailwind v4 design tokens |
| `packages/api` | tRPC context, routers, Zod input schemas, and business logic |
| `packages/auth` | Better Auth configuration and server auth instance |
| `packages/db` | Drizzle/Neon connection, Postgres schema, and generated migrations |
| `packages/env` | Validated server and web environment modules |

Use pnpm from the repository root (the lockfile targets `pnpm@11.9.0`). Workspace dependencies use `workspace:*`; shared versions belong in the `catalog` in `pnpm-workspace.yaml`.

## Application architecture

- Routes live in `apps/web/src/app`. Pages are Server Components by default; add `"use client"` only for hooks, browser APIs, mutations, or animation.
- The landing page is intentionally client-rendered for GSAP/ScrollTrigger effects. Respect `prefers-reduced-motion`, clean up GSAP contexts, and preserve responsive behavior.
- `apps/web/src/index.css` owns app/page styling. `packages/ui/src/styles/globals.css` owns shared Tailwind tokens and base styling. Put reusable primitives in `packages/ui`; keep page-specific compositions and CSS in `apps/web`.
- Use `@/` for imports within `apps/web`, and public `@masc-landing/*` exports for package boundaries. Do not reach into another package's unexported internals.
- `next.config.ts` enables typed routes and the React Compiler. Prefer `next/link` for internal navigation and preserve route-safe paths.

## Localization and UI

- User-visible copy belongs in both `apps/web/messages/en.json` and `apps/web/messages/vi.json`. Keep key shapes synchronized and use `next-intl` (`useTranslations` / `getTranslations`) rather than hard-coded text.
- Locale is chosen via the `locale` cookie; do not introduce locale-prefixed routes without deliberately redesigning the i18n setup.
- Reuse UI primitives from `@masc-landing/ui/components/*` and the established dark MASC palette/tokens. Preserve accessible labels, semantic headings, keyboard behavior, focus states, and mobile layouts.
- Treat assets in `apps/web/src/assets` as source assets. Use `next/image` for content images; existing SVG logo use via `img` is deliberate.

## Data, API, and authentication

- Browser tRPC calls use `trpc` from `apps/web/src/utils/trpc.ts`; add API behavior in `packages/api/src/routers` and export it from the app router.
- Use `publicProcedure` only for genuinely public endpoints. Use `protectedProcedure` for authenticated data, and enforce admin access in a Server Component/layout using the Better Auth session, as `app/admin/layout.tsx` does.
- Validate every API input with Zod. Normalize and validate data on the server even when the form also validates it client-side. Return intentional tRPC errors for expected failures.
- Define schema changes in `packages/db/src/schema`; use the existing Drizzle config and migration workflow. Generate and review migrations—do not hand-edit generated migration SQL unless the change specifically requires it.
- Authentication is Better Auth with Google. Keep secrets server-only and never expose `DATABASE_URL`, `BETTER_AUTH_SECRET`, or Google credentials to client code/logs.

## Environment and database workflow

- Server commands load `apps/web/.env`. Required values are `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ chars), `BETTER_AUTH_URL`, and `CORS_ORIGIN`; Google sign-in also needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- Environment validation occurs when server modules are imported. Do not weaken it or commit `.env` files.
- For schema work, run `pnpm db:generate`, inspect the generated migration under `packages/db/src/migrations`, then use the appropriate approved database command (`pnpm db:migrate` or `pnpm db:push`). Do not run database-changing commands against an unknown environment.

## Working agreement

1. Inspect the relevant route, translations, styles, and package boundary before editing. Check `git status` first and preserve unrelated developer changes.
2. Make the smallest implementation that fulfils the request. Avoid unrelated refactors, dependency upgrades, and generated-file churn.
3. Keep TypeScript strict: no `any`, unused imports, unchecked casts, or suppressed errors. Match the nearby formatting and component patterns; there is no repository formatter configuration.
4. When behavior or visible copy changes, update both locales and verify desktop plus narrow/mobile styling. When auth/data behavior changes, verify both unauthorized and authorized paths.
5. Report changed files, validation run, and anything not verified or requiring secrets/database access.

## Commands and verification

```bash
pnpm dev:web                         # Run the Next.js app
pnpm dev                             # Run all workspace dev scripts
pnpm --filter web exec tsc --noEmit  # Type-check the web app
pnpm --filter @masc-landing/ui run check-types
pnpm build                           # Production build; requires valid server environment
pnpm db:generate                     # Generate Drizzle migrations after schema edits
pnpm db:migrate                      # Apply migrations
```

There is no configured lint or automated test script. `pnpm check-types` only runs packages that currently expose that script (at present, the UI package), so do not treat it as a full workspace check. For UI work, also inspect the affected page in a browser when practical.
