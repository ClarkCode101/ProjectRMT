# ProjectRMT — Tech Stack

What ProjectRMT is built with, what each piece does, and the free services it runs on.
ProjectRMT is a private review app for the Philippine Medical Technologist Licensure Exam (MTLE),
used by a small group of about 15 reviewers, mostly on iPad.

> Versions are the ones installed when this file was written (November 2026).
> `package.json` is the source of truth; update this file when a library is added or removed.

---

## At a glance

| Layer | What we use |
|---|---|
| Language | TypeScript |
| Frontend | React 19, built with Vite 8 |
| Styling | Tailwind CSS 4, shadcn/ui (Base UI), lucide icons |
| Routing | React Router 8 (each page loads on demand) |
| Server data | TanStack Query 5 |
| Backend | Supabase: Postgres database, Auth, Realtime |
| Sign-in | Email + password, and Google (Google Cloud OAuth) |
| Offline | Installable PWA (vite-plugin-pwa / Workbox), IndexedDB, localStorage |
| Hosting | Cloudflare Pages (static site, auto-deploy from GitHub) |
| Tests and checks | Vitest, oxlint, TypeScript strict mode |
| Cost | ₱0: every service is on a free plan |

---

## 1. Frontend

| Tool | Version | Used for |
|---|---|---|
| [React](https://react.dev) | 19.3 | The user interface |
| [TypeScript](https://www.typescriptlang.org) | 7.0 | Typed JavaScript, in strict mode |
| [Vite](https://vite.dev) | 8.3 | Dev server (`npm run dev`) and production build (`npm run build`) |
| [React Router](https://reactrouter.com) | 8.5 | Pages and links. Every page is lazy-loaded, so the first download stays small on mobile data |
| [TanStack Query](https://tanstack.com/query) | 5.105 | Loading and caching data from Supabase, retries, and working offline (`networkMode: 'offlineFirst'`) |

## 2. Design and UI

| Tool | Used for |
|---|---|
| [Tailwind CSS](https://tailwindcss.com) 4.3 | All styling. Colors and fonts are design tokens in `src/index.css` |
| [shadcn/ui](https://ui.shadcn.com) (style `base-nova`) | Starting point for the basic components in `src/components/ui` (Button, Input, Label) |
| [Base UI](https://base-ui.com) 1.9 | Accessible building blocks under the shadcn components |
| [class-variance-authority](https://cva.style) and `cn` | Button variants, and joining class names |
| [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css) | Ready-made enter and exit animations |
| [lucide-react](https://lucide.dev) 1.66 | Icons (no emoji anywhere in the app) |
| [Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont/) | Body text, chosen for easy reading |
| [IBM Plex Sans Condensed](https://www.ibm.com/plex/) | Headings, like the headers on a printed lab report |

Fonts come from **Fontsource** and are bundled with the app (no Google Fonts requests), so they also work offline.

**Design language: "Lab report".** Scores read like a printed results sheet (result, reference range 60–100,
an L flag when low, a PASSED stamp). The accent is analyzer-screen blue (`#0B6382`), and gold is kept for wins and
streaks. Custom animations (stamp, tube fill, analyzer spin, printout, book opening, die roll) live in `src/index.css`.
All of them turn off when the device asks for reduced motion.

## 3. Feature libraries

| Library | Version | Powers |
|---|---|---|
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | 5.4 | Flashcards: the FSRS spaced-repetition schedule (`src/lib/fsrs.ts`) |
| [pdfjs-dist](https://mozilla.github.io/pdf.js/) | 6.5 | Reading text out of uploaded PDF reviewers, in the browser |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | 1.13 | Reading text out of uploaded Word (.docx) files, in the browser |
| [three.js](https://threejs.org) | 0.187 | The 3D organs on the Home screen (Body Explorer) |

Uploaded files are read **in the browser** and never stored: only the questions found in them are saved.
The PDF and Word readers (about 2 MB) are left out of the offline cache, because uploading needs internet anyway.

## 4. Backend: Supabase

[Supabase](https://supabase.com) (free plan) provides everything server-side. The app has **no server code of its own**.

| Supabase part | Used for |
|---|---|
| **Postgres** | All data: questions, books, answers, quiz and mock sessions, flashcard schedules, study settings, members, Board Review games |
| **Row Level Security (RLS)** | Every table is locked so each account only reaches its own rows (plus shared content such as built-in questions and published books) |
| **SQL functions (RPC)** | Anything that needs rules the browser can't be trusted with: Board Review turns, dice and answer checks, Community sharing, merging books, accepting members |
| **Auth** | Login sessions. Email + password, and Google sign-in. Email confirmation is on |
| **Realtime** | Live Board Review team games: room updates, invites and room chat |
| **pg_trgm** extension | "Similar question" detection, so the same question isn't added twice |
| **pg_cron** extension | An hourly job that clears Board Review chat older than 5 hours |
| **pgcrypto / uuid-ossp** | IDs and invite codes |

The database is set up by the SQL files in `supabase/migrations/` (run in number order) and `supabase/seed/`
(subjects, topics and the built-in question bank). `npm run seed:sql` rebuilds the seed files from the JSON question files.

**Not used:** Supabase Storage (no files are uploaded to the server) and pg_graphql (turned off).

## 5. Sign-in and access

| Piece | Used for |
|---|---|
| Supabase Auth (email + password) | Accounts the admin created by hand |
| **Google sign-in** via [Google Cloud](https://console.cloud.google.com) OAuth (Google Auth Platform) | "Continue with Google" for new people. Only the email, name and profile picture are requested, so no Google verification is needed |
| Access requests (migration `0033`) | A new account waits on a "Request sent" page until the admin presses **Accept** in Settings |

## 6. Offline and installable app (PWA)

| Piece | Used for |
|---|---|
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app) + Workbox | Makes the app installable ("Add to Home Screen") and caches the app's files, so it opens without internet. New versions install themselves on the next open |
| **IndexedDB** | The offline copy of the question bank and past answers (1–2 MB, too big for localStorage). Deleted when you log out |
| **localStorage** | The "outbox" of answers waiting to be sent, the login session, small settings and progress flags |

Answers given offline wait in the outbox and are sent automatically once the device is back online.

## 7. Hosting and services

| Service | Plan | Used for |
|---|---|---|
| [Cloudflare Pages](https://pages.cloudflare.com) | Free | Hosts the built site at `projectrmt.pages.dev`. Every push to `main` rebuilds and deploys |
| [Supabase](https://supabase.com) | Free | Database, Auth, Realtime |
| [Google Cloud](https://console.cloud.google.com) | Free (no billing) | The OAuth client for "Continue with Google" |
| [GitHub](https://github.com) | Free | Source code, and the trigger for deploys |

`vercel.json` is also in the repo, so the same site can be hosted on Vercel's free plan if needed.

**Settings and keys:** the Supabase URL and the *publishable* key are in `.env.production`. They are public on purpose,
because they end up in the website's JavaScript anyway and Row Level Security is what protects the data.
The secret/service-role key is **never** used in the app. Local-only values go in `.env.local`, which git ignores.

## 8. Development tools

| Tool | Command | Used for |
|---|---|---|
| Vite dev server | `npm run dev` | Run the app locally at `http://localhost:5173` |
| TypeScript + Vite build | `npm run build` | Type-check everything, then build to `dist/` |
| [Vitest](https://vitest.dev) 5 | `npm run test` | Unit tests (scoring, quiz logic, parsers, offline sync, access rules, and more) |
| [oxlint](https://oxc.rs/docs/guide/usage/linter) | `npm run lint` | Fast code checks |
| Node.js 22 | | Runs the tools (Cloudflare builds with `NODE_VERSION=22`) |

## 9. Security measures

- **Row Level Security on every table**, plus a "restrictive" policy so only **approved members** can see any data.
- **A check before every API request** (`check_access`, a PostgREST pre-request function): an account that isn't accepted yet gets "403" for everything except its own status.
- **Server-side rules** for anything that matters (game turns, answer checks, sharing, accepting members), each checking who is asking.
- **No unneeded rights for visitors who aren't logged in:** they can't read any table or call any function except the access check.
- **Security headers** on every page (`public/_headers`): the app can't be framed by other sites (clickjacking), no plugins, and no camera, microphone or location access.
- **Email confirmation** for email sign-ups, and Google sign-in for new members.
- **Log out deletes the offline copy** from the device (useful on shared iPads).
- Reviewed against the OWASP Top 10 (2025), the OWASP API Security Top 10, and STRIDE in November 2026.

## 10. Folder structure

```
src/
  app entry      main.tsx, App.tsx, routes.tsx
  components/    shared UI: layout, dialogs, report-style cards, ui/ (shadcn)
  features/      one folder per area:
    auth/          login, Google sign-in, access requests, privacy policy
    home/          Home screen and 3D Body Explorer
    quiz/          Practice
    mock/          Mock exam
    flashcards/    Flashcards (FSRS)
    board/         Board Review (solo and live team games)
    questions/     Question bank, editor, uploads, books
    community/     Community shelf (shared books)
    reference/     Quick reference: normal values, formulas, memory aids
    settings/      Settings and the admin's member list
    dashboard/, mistakes/   data helpers for scores and the mistake notebook
  lib/           logic and data access (scoring, quiz, books, access, offline/, parsers/), with tests next to each file
supabase/
  migrations/    database setup, in number order
  seed/          subjects, topics and built-in questions
scripts/         build-seed-sql.ts
public/          icons, favicon, _headers
```

## 11. Related documents

- `README.md`: how to set up, run and deploy
- `PROJECT_PLAN.md`: the original plan, features and roadmap. Its tech stack table is from the start of the
  project; this file describes what is actually used today.
