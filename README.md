# MTLE Reviewer

A private, mobile-first web app for reviewing for the Philippine Medical Technologist
Licensure Examination. See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the full plan.

**Phase 1 (done in code):** email login, question bank, practice quiz with instant
feedback, mistake notebook ("Review Again"), weak-area dashboard (60% line per subject),
and seed questions.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally at http://localhost:5173 |
| `npm run build` | Type-check and build to `dist/` |
| `npm test` | Run unit tests (Vitest) |
| `npm run lint` | Lint (oxlint) |
| `npm run seed:sql` | Rebuild `supabase/seed/02_questions.sql` from `supabase/seed/questions/*.json` |

## First-time Supabase setup

1. Create a free project at https://supabase.com.
2. **SQL Editor** → paste and run these files, in order:
   1. `supabase/migrations/0001_init.sql` (tables, RLS, view)
   2. `supabase/seed/01_subjects_topics.sql` (subjects + topics)
   3. `supabase/seed/02_questions.sql` (built-in questions, all `unverified`)
3. **Authentication → Sign In / Providers**: keep Email enabled and turn **off**
   "Allow new users to sign up" (the app is private).
4. **Authentication → Users → Add user**: create her account (email + password,
   tick "Auto confirm user").
5. **Project Settings → API**: copy the Project URL and the `anon` public key.
6. Copy `.env.example` to `.env.local` and paste those two values in.
7. `npm run dev` and log in.

> Never put the `service_role` key in this app or in `.env.local`. The anon key is
> safe to be public because Row Level Security protects the data.

After the project exists, you can replace the hand-written types with generated ones:
`npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts`

## Adding built-in questions

1. Add or edit JSON files in `supabase/seed/questions/` (format in PROJECT_PLAN.md §4).
2. `npm run seed:sql` checks every question and rewrites `02_questions.sql`.
3. Run `02_questions.sql` in the SQL Editor. Questions that already exist are skipped.

## Deploy (Vercel, free)

1. Push this repo to GitHub.
2. On Vercel: **Add New → Project** → import the repo (framework: Vite).
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. `vercel.json` makes links like `/practice` work on refresh.
   (For Netlify, `public/_redirects` does the same thing.)
5. In Supabase **Authentication → URL Configuration**, set the Site URL to your
   deployed URL.
