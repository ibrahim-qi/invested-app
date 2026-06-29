# InvestEd — Investment Education Simulator

A full-stack web platform that helps postgraduate students learn investment fundamentals through interactive lessons and a risk-free portfolio simulator with Monte Carlo modelling.

Built for 30+ students as part of a university project — bridges theory with hands-on portfolio simulation.

## Features

- **Interactive lessons** — structured investment concepts with progress tracking
- **Portfolio simulator** — risk-free environment to test allocation strategies
- **Monte Carlo modelling** — run simulations across 1,000+ market scenarios
- **Live visualisations** — portfolio risk charts powered by Recharts
- **User progress** — track concept completion and saved simulations per user

## Tech stack

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Server Actions)
- **Charts:** Recharts
- **Tooling:** ESLint, Prettier

## Getting started

### Prerequisites

- Node.js 18+
- npm or yarn
- A Supabase account ([supabase.com](https://supabase.com))

### Setup

```bash
git clone https://github.com/ibrahim-qi/invested-app.git
cd invested-app
npm install
```

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Find your credentials in Supabase → **Project Settings → API**.

### Database setup

Run the schema in the Supabase SQL Editor. Key tables:

- `concepts`
- `user_profiles`
- `user_concept_progress`
- `saved_simulations`
- `scenarios`
- `simulation_events`

Apply any SQL migration files included in the repo before running the app.

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Lint

```bash
npm run lint
```

## Deploy

Deploys cleanly to [Vercel](https://vercel.com). Set the same Supabase environment variables in your Vercel project settings.
