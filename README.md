# masc-landing

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next.js, Self, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **tRPC** - End-to-end type-safe APIs
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

This repository is a pnpm workspace: install dependencies from the repository
root so that `apps/*` and `packages/*` are linked correctly.

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/web/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
pnpm db:push
```

### Administrator access

Administrator access is controlled by the `admin_emails` database table. There
is intentionally no API for changing this allowlist. Add and remove normalized
(lowercase, trimmed) email addresses manually as a developer:

```sql
INSERT INTO admin_emails (email) VALUES ('admin@example.com');
DELETE FROM admin_emails WHERE email = 'admin@example.com';
```

The table starts empty, so add the first administrator after applying the
database migration.

## Cloudflare R2 Setup

Round 1 files are stored in a private R2 bucket. Configure `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` in
`apps/web/.env`. Keep the bucket private and add a CORS policy for each web
application origin that uploads files:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-production-origin.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 300
  }
]
```

Replace the example production origin with the deployed application origin.
Downloads use short-lived server-authorized URLs and do not require a public
bucket domain.

## Bulk PDF exports on Render

The admin page for each competition round can create a ZIP containing the
latest PDF submission from every team. Export requests are stored in the
existing PostgreSQL database. The `pdf-exporter` service claims those requests,
streams the PDFs from R2 into a ZIP, and streams the ZIP back to R2 without
holding the whole archive in memory. Completed archives expire after 24 hours
by default.

Before deploying the exporter, apply the generated database migration to the
same database used by the web app:

```bash
pnpm db:migrate
```

The root `render.yaml` defines a Free web service with a `/health` endpoint.
Create a Render Blueprint from the repository, then provide these secret values
when prompted:

- `DATABASE_URL`: the web app's existing PostgreSQL connection URL
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

The R2 credentials need read, write, and delete access to the same private
bucket used for submissions. No Redis instance, persistent disk, or public R2
bucket is required. Optional worker settings include `EXPORT_TTL_HOURS`,
`POLL_INTERVAL_MS`, `JOB_STALE_AFTER_MINUTES`, and `JOB_MAX_ATTEMPTS`.

Set `PDF_EXPORTER_URL` in the deployed web application's server environment to
the Render service origin, for example
`https://masc-pdf-exporter.onrender.com`. After an administrator queues a job,
the browser requests this service's `/health` endpoint to wake a sleeping Free
instance. The request can take about one minute after an idle spin-down.

For a local worker run, load the same variables into the shell and run:

```bash
pnpm --filter pdf-exporter build
pnpm --filter pdf-exporter start
```

Then, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the fullstack application.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@masc-landing/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Project Structure

```
masc-landing/
├── apps/
│   ├── pdf-exporter/ # PostgreSQL-backed bulk PDF export service
│   └── web/          # Fullstack application (Next.js)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `pnpm dev`: Start all applications in development mode
- `pnpm build`: Build all applications
- `pnpm dev:web`: Start only the web application
- `pnpm check-types`: Check TypeScript types across all apps
- `pnpm db:push`: Push schema changes to database
- `pnpm db:generate`: Generate database client/types
- `pnpm db:migrate`: Run database migrations
- `pnpm db:studio`: Open database studio UI
