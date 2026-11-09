# ProjectRMT

ProjectRMT is a private, mobile-first web app for reviewing for the Philippine Medical Technologist
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
| `npm run seed:sql` | Rebuild `supabase/seed/02_questions_<subject>.sql` (one per file in `supabase/seed/questions/`) |

## First-time Supabase setup

1. Create a free project at https://supabase.com.
2. **SQL Editor** → paste and run these files, in order:
   1. `supabase/migrations/0001_init.sql` (tables, RLS, view)
   2. `supabase/seed/01_subjects_topics.sql` (subjects + topics)
   3. Every `supabase/seed/02_questions_*.sql` file (built-in questions, one file per subject, any order)
   4. `supabase/migrations/0002_edit_builtin_questions.sql` (lets her verify and fix built-in questions)
   5. `supabase/migrations/0003_upload_file_optional.sql` (uploads are read in the browser; files are not stored)
   6. Every later file in `supabase/migrations/`, in number order (`0009_per_user_builtin_edits.sql`
      makes fixes to built-in questions per account, so one account's edits don't change them for others;
      `0010_community.sql` adds the Community shelf, where accounts share books and add their own copies;
      `0011_live_author_name.sql` makes the author's name there follow their account;
      `0012_merge_books.sql` lets her merge one of her books into another;
      `0013_delete_book_questions.sql` deletes a book's book-only questions with it and cleans up ones left behind;
      `0014_no_builtin_in_books.sql` keeps built-in questions out of her books;
      `0015_copy_author.sql` shows "by <author>" on books added from Community;
      `0016_split_topic.sql` turns a topic in her book back into its own book;
      `0017_merge_skip_duplicates.sql` lets a merge skip the duplicates she ticks;
      `0018_rename_topic.sql` renames a topic in her book, for every question under it;
      `0019_merge_into_subject.sql` merges one of her books into a subject book, under her own topic there)
3. **Authentication → Sign In / Providers**: keep Email enabled and turn **off**
   "Allow new users to sign up" (the app is private).
4. **Authentication → Users → Add user**: create her account (email + password,
   tick "Auto confirm user").
5. **Project Settings → API Keys**: copy the Project URL and the publishable key
   (`sb_publishable_...`).
6. Copy `.env.example` to `.env.local` and paste those two values in.
7. `npm run dev` and log in.

> Never put the secret / `service_role` key in this app or in `.env.local`. The
> publishable key is safe to be public because Row Level Security protects the data.

After the project exists, you can replace the hand-written types with generated ones:
`npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts`

## Adding built-in questions

1. Add or edit JSON files in `supabase/seed/questions/` (format in PROJECT_PLAN.md §4).
2. `npm run seed:sql` checks every question and rewrites the `02_questions_<subject>.sql` files.
3. Run only the subject files you changed in the SQL Editor (e.g. `02_questions_cc.sql`).
   Questions that already exist are skipped, so running a file again is safe.

## Deploy (Cloudflare Pages, free)

1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git** →
   pick `ClarkCode101/ProjectRMT`.
2. Build settings: Framework preset **Vite** (or React (Vite)), build command
   `npm run build`, output directory `dist`.
3. Environment variable: `NODE_VERSION` = `22`. The Supabase URL and publishable
   key come from the committed `.env.production` file (they are public values), so
   they don't need to be set in Cloudflare.
4. Save and Deploy. Every push to `main` redeploys automatically.
   Links like `/practice` work on refresh because Pages serves `index.html` for
   unknown paths when there is no `404.html` (no `_redirects` needed).
   (On Vercel, `vercel.json` does the same thing.)
5. In Supabase **Authentication → URL Configuration**, set the Site URL to your
   `*.pages.dev` URL.

**If pushes stop deploying** (Cloudflare keeps rebuilding an old commit): GitHub →
Settings → Applications → Installed GitHub Apps → Cloudflare Workers and Pages →
Configure, and make sure this repo is in **Repository access**. A public repo can
still be cloned without it, but push notifications only reach Cloudflare for
repos the app has access to.
