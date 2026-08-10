# KurvzOS

The operating system for modern teams. Manage projects, tasks, and workflows in one unified workspace.

## Tech Stack

- **Framework:** [Next.js 15](https://nextjs.org/) (App Router, Turbopack)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **UI Components:** [shadcn/ui](https://ui.shadcn.com/)
- **Authentication:** [Supabase Auth](https://supabase.com/docs/guides/auth)
- **Database:** [PostgreSQL](https://www.postgresql.org/) via [Supabase](https://supabase.com/)
- **ORM:** [Prisma](https://www.prisma.io/)
- **Deployment:** [Vercel](https://vercel.com/)

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- A [Supabase](https://supabase.com/) project
- PostgreSQL database (included with Supabase)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd kurvzos
npm install
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase pooled Postgres connection string used by the app |
| `DIRECT_URL` | Supabase direct/session Postgres connection string used by Prisma migrations |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key used by Auth |
| `NEXT_PUBLIC_APP_URL` | App URL (`http://localhost:3000` for dev) |
| `GOOGLE_CLIENT_ID` | Google OAuth client id for Calendar and YouTube |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (server only) |
| `YOUTUBE_TOKEN_ENCRYPTION_KEY` | 32-byte base64 key used to encrypt stored Google refresh tokens |
| `AI_PROVIDER` | Executive AI provider (`openai` or `anthropic`) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Server-only key for the configured AI provider |

KurvzOS does not use a Supabase service-role key. Do not add one to the
application environment.

### 3. Set up the database

For local development, apply existing migrations and generate the client:

```bash
npm run db:migrate
npm run db:generate
```

For a shared, staging, or production database, deploy committed migrations:

```bash
npm run db:deploy
```

The committed migrations include the database access lockdown that enables
Row Level Security on every KurvzOS table and removes direct table privileges
from Supabase client roles. Do not use `prisma db push` for a release database;
it does not deploy this security migration.

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Auth pages (login, signup)
│   ├── (dashboard)/      # Protected dashboard routes
│   ├── api/              # API route handlers
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Landing page
├── components/
│   ├── auth/             # Authentication forms
│   ├── dashboard/        # Dashboard components
│   ├── layout/           # Site header/footer
│   ├── marketing/        # Landing page sections
│   └── ui/               # shadcn/ui components
├── config/               # Site configuration
├── hooks/                # Custom React hooks
├── lib/                  # Utilities, Supabase, Prisma clients
├── generated/prisma/     # Generated Prisma client
└── types/                # Shared TypeScript types
prisma/
└── schema.prisma         # Database schema
```

## Features (MVP)

- **Landing page** — Marketing site with features, pricing, and CTA
- **Authentication** — Email/password sign up and sign in via Supabase
- **Dashboard** — Overview with project and task statistics
- **Projects** — Create and manage projects within a workspace
- **Tasks** — Create tasks with priority and status tracking
- **Settings** — User profile view

## Deployment (Vercel)

1. Push your repository to GitHub
2. Import the project in [Vercel](https://vercel.com/new)
3. Add environment variables from `.env.example`
4. Run `npm run db:deploy` against the release database before the first deploy
5. Deploy — `postinstall` generates the Prisma client during installation

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:deploy` | Deploy committed migrations to a shared/release database |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Prisma Studio |

## License

Private — All rights reserved.
