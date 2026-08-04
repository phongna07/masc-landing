# Repository Guidelines

## Non-negotiable command rules

- Run project commands from the repository root: **/home/phong/masc-landing**.
- This is a pnpm workspace. Use pnpm; do not substitute npm, yarn, bun, or npx. The repository does not require a fixed pnpm version.
- In WSL, use Linux installations of Node.js and pnpm. Do not invoke pnpm.cmd, pnpm.exe, Windows Node.js, PowerShell, or wsl.exe from an already-running WSL shell.
- Do not guess package scripts. Read the root and owning package's package.json, then use one of the commands documented below.
- Do not apply database changes merely to validate code. db:migrate and db:push alter the configured database and require confirmation of the target first.

## WSL runtime preflight

Before installing dependencies or running pnpm in a fresh agent session, run:

~~~bash
pwd
command -v node
command -v pnpm
node --version
pnpm --version
~~~

Expected results:

- pwd is **/home/phong/masc-landing**.
- node and pnpm resolve to Linux paths, normally under /usr, ~/.local, or a WSL-side version manager directory.
- Neither executable resolves under /mnt/c/.
- pnpm --version completes successfully.

If node is missing or pnpm resolves to a Windows npm shim such as /mnt/c/Users/.../AppData/Roaming/npm/pnpm, stop and report the runtime problem. Do not work around it with a different package manager or install global tooling with sudo. The user must activate/install Node.js and pnpm inside WSL using their chosen version manager or Corepack.

## Workspace map

The workspace includes each immediate subdirectory of apps/ and packages/.

- **apps/web** (package name **web**): Next.js 16 App Router application. Routes and route handlers are in src/app, app-only components in src/components, translations in messages, and images/fonts in src/assets.
- **packages/ui** (**@masc-landing/ui**): shared shadcn/Tailwind components, hooks, utilities, and global styles. It exports source files directly; there is no separate UI build output.
- **packages/api** (**@masc-landing/api**): tRPC context, routers, registration/round business rules, email delivery, and R2 file operations.
- **packages/auth** (**@masc-landing/auth**): Better Auth setup backed by the database package.
- **packages/db** (**@masc-landing/db**): Drizzle/Neon database client, schema files in src/schema, and generated migrations in src/migrations.
- **packages/env** (**@masc-landing/env**): validated server and browser environment variables through the ./server and ./web exports.
- **packages/config** (**@masc-landing/config**): shared strict TypeScript configuration.

Import app code through **@/** and shared code through public workspace exports such as **@masc-landing/ui**. Do not reach into another package through relative paths or unexported internals.

## Install and development commands

Run all commands below from the repository root.

~~~bash
pnpm install
pnpm dev:web
pnpm dev
~~~

- pnpm install installs and links the entire workspace. Keep pnpm-lock.yaml in sync when dependencies change. Use pnpm install --frozen-lockfile for a clean verification that must not update the lockfile.
- pnpm dev:web starts only the web package and is the normal local-development command.
- pnpm dev recursively starts every package script named dev; it is a long-running convenience command, not a validation command.
- Use pnpm --filter PACKAGE_NAME, not a directory-name guess, for package-scoped work. Relevant names are web, @masc-landing/ui, @masc-landing/api, @masc-landing/auth, @masc-landing/db, and @masc-landing/env.

## TypeScript checks

The root pnpm check-types runs only package scripts that actually exist. At present, only @masc-landing/ui defines check-types, so this command does **not** check the web app or every shared package.

Use these commands deliberately:

~~~bash
# Existing recursive package-script check (currently UI only)
pnpm check-types

# Required check for the Next.js app
pnpm --filter web exec tsc --noEmit

# Check a touched shared package that has no check-types script
pnpm --filter @masc-landing/api exec tsc --noEmit
pnpm --filter @masc-landing/auth exec tsc --noEmit
pnpm --filter @masc-landing/db exec tsc --noEmit
pnpm --filter @masc-landing/env exec tsc --noEmit
~~~

Do not use pnpm exec tsc --noEmit at the workspace root as a substitute for the web check: it reads the root tsconfig.json, not apps/web/tsconfig.json. For a small change, run the web check plus checks for the packages touched. For cross-package changes, run every applicable command above.

## Next.js production build

The authoritative production-build validation is:

~~~bash
CI=1 NEXT_TELEMETRY_DISABLED=1 pnpm --filter web exec next build --webpack
~~~

Always preserve CI=1, NEXT_TELEMETRY_DISABLED=1, and --webpack unless the user explicitly requests different build settings. Run it from the repository root. Do not replace it with next build, pnpm --filter web build, or a Turbopack build when reporting final validation.

pnpm build is only the root recursive convenience script; currently it reaches the web package's plain next build script and does not enforce the required environment flags or --webpack. It is therefore not a substitute for the authoritative command above.

The web build validates environment variables imported through @masc-landing/env. Local values belong in the gitignored apps/web/.env. If required values are missing, report that clearly; do not create fake secrets, commit an .env file, or bypass validation with SKIP_ENV_VALIDATION unless the user explicitly asks.

## Drizzle database workflow

Use the root scripts. They select @masc-landing/db and execute with packages/db as the package working directory, which is important because drizzle.config.ts loads ../../apps/web/.env and writes migrations under packages/db/src/migrations.

~~~bash
pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:studio
~~~

- pnpm db:generate: generate SQL migration files and Drizzle metadata from schema changes. Use this after editing packages/db/src/schema/*; inspect all generated files before keeping them.
- pnpm db:migrate: apply pending migration files to the database selected by DATABASE_URL. This changes external state; confirm the target database first.
- pnpm db:push: directly reconcile the schema with the selected database without the normal generated-migration workflow. Treat this as potentially destructive and run it only when the user explicitly wants a push and the target database is confirmed.
- pnpm db:studio: start Drizzle Studio against the selected database. It is interactive and is not part of routine validation.

Do not run raw drizzle-kit from the repository root, do not manually edit generated migration metadata, and do not assume an .env points at a disposable database. Commit schema changes and their generated migration/metadata files together. For schema-only validation, pnpm db:generate is the normal non-application step; do not follow it with migrate/push automatically.

## Coding and ownership conventions

Use strict TypeScript and match nearby formatting; tabs are common in TS/TSX. Components use PascalCase exports in kebab-case files, such as AuthForm in auth-form.tsx; functions and variables use camelCase.

Keep pages and layouts as Server Components unless hooks, browser APIs, or client-side state require "use client". Put reusable primitives in packages/ui and page-specific compositions in apps/web. Business rules and tRPC procedures belong in packages/api, authentication wiring in packages/auth, schema/query primitives in packages/db, and environment declarations in packages/env.

User-facing text must be added to both apps/web/messages/en.json and apps/web/messages/vi.json. No formatter or linter is configured, so avoid unrelated formatting churn and do not invent lint/format commands.

## Validation and testing

There is no automated test runner or coverage threshold currently configured. Do not claim tests passed when only type checks or a build ran. Validate in proportion to the change:

- Shared TypeScript or UI change: owning-package tsc check plus the web tsc check.
- Next.js route/component/config change: web tsc, then the authoritative webpack production build when environment variables are available.
- Cross-package change: all touched package checks, web tsc, and the authoritative production build.
- Database schema change: owning-package tsc, pnpm db:generate, and inspection of generated SQL/metadata; migrate/push only with target confirmation.
- Visible UI change: manually check desktop/mobile layouts, keyboard interaction, and both English and Vietnamese locales when a browser session is available.

If a required command cannot run because Node/pnpm, dependencies, environment variables, network access, or database access are unavailable, report the exact blocker and the validations that did run.

## Git and pull requests

Preserve unrelated working-tree changes. Never commit .env files, secrets, build artifacts, or ad hoc generated files. Recent history uses Conventional Commit prefixes such as feat:, fix:, style:, docs:, and chore:; use an imperative, focused subject and keep each commit cohesive.

Pull requests should explain the change and validation performed, link related issues, call out schema/environment changes, and include before/after screenshots for visible UI work.
