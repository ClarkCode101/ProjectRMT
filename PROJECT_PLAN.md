# ProjectRMT (MTLE Reviewer) — Project Plan

A private, mobile-first PWA (login required; a small group of about 15 classmates, not public) to help MedTech students review for the Philippine **Medical Technologist Licensure Examination (MTLE)**. It combines a built-in question bank with her own reviewer content, plus smart duplicate detection, practice quizzes, mock exams, flashcards with spaced repetition, and a weak-area dashboard.

> **Goal:** zero-cost hosting, works on iPhone and Android, offline-capable, private (login required).

---

## 1. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **React + Vite + TypeScript** | SPA, simple PWA setup |
| Styling | **Tailwind CSS + shadcn/ui** | Mobile-first UI |
| Routing | **React Router** | |
| Data fetching | **TanStack Query** | Caching + offline-friendly |
| Backend / DB | **Supabase** (Postgres + Auth + Storage) | Enable **RLS** on every table |
| Duplicate check | **pg_trgm** (phase 1), **pgvector** (phase 2, optional) | |
| PDF parsing | **pdfjs-dist** (or `unpdf`) | Runs in the browser |
| DOCX parsing | **mammoth.js** | |
| Spaced repetition | **ts-fsrs** | FSRS algorithm |
| Charts | **Recharts** | Dashboard |
| PWA | **vite-plugin-pwa** | Installable + offline cache |
| Hosting | **Vercel** or **Netlify** (free) | Auto-deploy from GitHub |

---

## 2. Exam Context (for content + mock exam weighting)

Six subjects. **She has to get at least 60% in every subject**, so a single weak subject fails the whole exam. That's why the dashboard tracks scores per subject.

| Code | Subject | Typical weight |
|---|---|---|
| CC | Clinical Chemistry | 20% |
| MICRO | Microbiology & Parasitology | 20% |
| HEMA | Hematology | 20% |
| BBIS | Blood Banking & Immunoserology | 20% |
| CM | Clinical Microscopy (AUBF) | 10% |
| HTMLE | Histopathologic Techniques, Cytotechnology, MT Laws & Ethics | 10% |

> ⚠️ Check the weights and topic coverage against the latest official PRC / Board of Medical Technology exam program before you finalize them.

---

## 3. Features

### Phase 1 — MVP (must-have)
- [x] **Auth**: email login (Supabase Auth); app is private
- [x] **Question bank**: multiple choice (4 options), tagged by subject → topic
- [x] **Practice quiz**: filter by subject/topic/source; instant feedback + explanation after each answer
- [x] **Mistake notebook**: wrong answers are collected automatically and quizzed again from "Review again" on Practice (the list page was removed: answer first, then see why)
- [x] **Weak-area dashboard**: score per subject and per topic; anything below 60% is highlighted
- [x] **Built-in seed content import** (JSON → Supabase)

### Phase 2 — Content feeding
- [x] **Manual add question** form
- [x] **Bulk upload**: PDF / DOCX / pasted text → parse into questions → review screen → save
- [x] **Duplicate detection** (see §5) with side-by-side compare: `Skip` / `Save anyway` / `Replace`
- [x] **Verification status**: `verified` by default (built-in set fact-checked, with a reference in each explanation; ones she types are hers; uploads too, since she reviews them before saving). `unverified` = "needs a look": a question she reported from a quiz ("Report a problem"), or an upload saved before 2026-11-09 (uploads used to start as "needs a look")
- [x] **Topic coverage map**: question count per topic (✅ enough / ⚠️ few / ❌ none)

### Phase 3 — Study modes
- [x] **Question Source selector** used by every mode (see §6)
- [x] **Mock exam mode**: timed, 100 items per subject, no feedback until submit, review screen afterwards
- [x] **Flashcards** with FSRS spaced repetition (Again / Hard / Good / Easy)
- [x] **Smart anti-repeat selection** (see §6)
- [x] **Shuffle choices** every time

### Phase 4 — Extras & personal touch
- [ ] **Image-based questions** (blood smears, parasite ova, urine crystals, colonies)
- [x] **Quick reference page**: searchable normal values, formulas (MCV, MCH, MCHC…), mnemonics
- [x] **Study planner**: exam-date countdown + daily targets
- [x] **Streak tracker**
- [x] **Encouragement messages** written by me, shown after a mock exam, on streak milestones, etc. 💌
- [ ] **PWA**: installable, offline quiz from cached questions
- [ ] **iOS install guide banner** (shown only on iOS Safari)
- [ ] *(optional)* Semantic duplicate check with pgvector + embeddings
- [ ] *(optional)* Push notification reminders

---

## 4. Content Sources

1. **Built-in seed questions**: original questions generated with AI, organized per subject/topic, imported as JSON. They are **fact-checked against standard references** (cited at the end of each explanation) and start as `verified`, so she doesn't have to check them one by one; anything that looks wrong can be reported from a quiz.
2. **Open-licensed references**: e.g. OpenStax *Microbiology* and LibreTexts, used as the basis for questions.
3. **User-fed content**: her own notes and reviewers (manual, or uploaded as PDF/DOCX/text).

> 🔒 Uploaded reviewers may be copyrighted (review centers, books). Everything stays **private** behind RLS and the app is never made public.
> The one exception is the **Community shelf** (migration 0010): a user can choose to share one of their books, uploads included, with the other logged-in accounts (a group of about 15, decided by the owner, 2026-11-09). If the app ever opens to the public, revisit this before then.

### Community shelf (migration 0010)
- **Share**: Edit book → "Share to Community" switch (saves right away). Only books with at least one question.
- **Browse**: `/community` (its own icon in the main nav; it took Quick reference's spot, which is off the menus for now but `/reference` still works): search by book or classmate, subject chips, Newest / Most added, a peek at the first 5 questions.
- **Add to library**: makes the user's **own copy** (book + questions + chapters) in a library they pick (12-slot limit applies). Built-in questions are skipped (they can't be in anyone's books since migration 0014; they live in the subject books). Copied questions are book-only (`in_subject = false`) and start ready to use (`verified`, not "Needs a look"). The copy is kept even if the author edits, stops sharing or deletes the original.
- RLS is unchanged; four `security definer` functions do the sharing (`publish_book`, `community_books`, `community_book_preview`, `add_community_book`). `published_at` and `copied_from` can only be set by them.
- **Author name** is read live from the author's account (first name in Settings) every time, so a new name shows on all their shared books right away; no first name = "A classmate" (migration 0011).

### Seed JSON format
```json
[
  {
    "subject": "HEMA",
    "topic": "Coagulation",
    "stem": "Which coagulation factor is known as the stable factor?",
    "choices": ["Factor V", "Factor VII", "Factor VIII", "Factor X"],
    "correct_index": 1,
    "explanation": "Factor VII is called the stable factor because it is not consumed during clotting and is stable in stored plasma.",
    "difficulty": 2
  }
]
```

---

## 5. Duplicate Detection

Runs on every new question (manual add or bulk upload).

```
new question
  → normalize text (lowercase, strip punctuation, collapse spaces)
  → Level 1: exact match via normalized hash        → duplicate
  → Level 2: pg_trgm similarity > 0.6               → "possible duplicate"
  → Level 3 (optional): pgvector cosine sim > 0.9   → "possible duplicate"
  → show matches side by side → user decides
```

**Never auto-delete.** Two questions can look alike but ask different things (e.g. male vs female reference value).

---

## 6. Question Source & Selection Logic

### Source selector (every mode)
```
○ All (built-in + mine)    ← default
○ Built-in only
○ My questions only
○ Specific upload: [ dropdown of uploads ]
```
Optional extra filters: subject, topic, `verified only`.

### Smart selection (anti-repeat)
Give every candidate question a priority score:
1. **Never seen** → highest priority
2. **Previously wrong** → high priority (weighted by how recent and how often)
3. **Always correct** → low priority
4. Never repeat within the same session
5. Shuffle the choices on every display
6. If fewer unseen questions remain than the items asked for → show "Only N new questions left here. Add more?" (UI is English only)

**Flashcards** use the FSRS `due` date from `review_states` instead.

**Mock exam**: follow the exam structure (100 items per subject), spread across topics so a single upload can't dominate.

---

## 7. Database Schema (Supabase / Postgres)

```sql
-- Extensions
create extension if not exists pg_trgm;
-- create extension if not exists vector;  -- phase 4 (optional)

-- ---------- Reference data ----------
create table subjects (
  id          serial primary key,
  code        text unique not null,      -- 'CC','MICRO','HEMA','BBIS','CM','HTMLE'
  name        text not null,
  weight      numeric not null,          -- 0.20, 0.10
  sort_order  int default 0
);

create table topics (
  id          serial primary key,
  subject_id  int not null references subjects(id) on delete cascade,
  name        text not null,
  unique (subject_id, name)
);

-- ---------- Uploads ----------
create table uploads (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  file_name     text not null,
  storage_path  text not null,
  status        text not null default 'processing', -- processing | review | done | failed
  question_count int default 0,
  created_at    timestamptz default now()
);

-- ---------- Questions ----------
create type question_source as enum ('builtin', 'user', 'upload');
create type verify_status   as enum ('unverified', 'verified');

create table questions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references auth.users(id) on delete cascade, -- null = builtin
  topic_id        int not null references topics(id),
  source          question_source not null,
  upload_id       uuid references uploads(id) on delete set null,
  stem            text not null,
  choices         jsonb not null,        -- ["A","B","C","D"]
  correct_index   int not null check (correct_index between 0 and 3),
  explanation     text,
  image_path      text,                  -- Supabase Storage path
  difficulty      int default 2 check (difficulty between 1 and 3),
  status          verify_status not null default 'unverified',
  normalized_stem text generated always as (
                    trim(regexp_replace(
                      regexp_replace(lower(stem), '[^a-z0-9 ]', ' ', 'g'),
                    '\s+', ' ', 'g'))
                  ) stored,
  stem_hash       text generated always as (md5(
                    trim(regexp_replace(
                      regexp_replace(lower(stem), '[^a-z0-9 ]', ' ', 'g'),
                    '\s+', ' ', 'g')))
                  ) stored,
  created_at      timestamptz default now()
);

create index questions_topic_idx on questions(topic_id);
create index questions_hash_idx  on questions(stem_hash);
create index questions_trgm_idx  on questions using gin (normalized_stem gin_trgm_ops);

-- ---------- Sessions & attempts ----------
create type session_mode as enum ('practice', 'mock', 'flashcard');

create table quiz_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  mode          session_mode not null,
  filters       jsonb,                 -- { source, subject_ids, topic_ids, upload_id, verified_only }
  total_items   int,
  score         int,
  duration_sec  int,
  started_at    timestamptz default now(),
  finished_at   timestamptz
);

create table attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  session_id      uuid references quiz_sessions(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  selected_index  int,                  -- index in ORIGINAL choices order
  is_correct      boolean not null,
  time_ms         int,
  created_at      timestamptz default now()
);
create index attempts_user_q_idx on attempts(user_id, question_id);

-- ---------- Flashcards (FSRS state) ----------
create table review_states (
  user_id        uuid not null references auth.users(id) on delete cascade,
  question_id    uuid not null references questions(id) on delete cascade,
  due            timestamptz not null default now(),
  stability      double precision,
  difficulty     double precision,
  elapsed_days   int,
  scheduled_days int,
  reps           int default 0,
  lapses         int default 0,
  state          int default 0,         -- ts-fsrs State enum
  last_review    timestamptz,
  primary key (user_id, question_id)
);

-- ---------- Extras ----------
create table study_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  exam_date     date,
  daily_target  int default 50
);

create table encouragements (
  id         serial primary key,
  trigger    text not null,             -- 'mock_done' | 'streak_7' | 'streak_30' | 'random'
  message    text not null
);

create table reference_items (           -- quick reference page
  id         serial primary key,
  subject_id int references subjects(id),
  title      text not null,              -- e.g. 'Hemoglobin (male)'
  value      text not null,              -- e.g. '13.5–17.5 g/dL'
  notes      text
);

-- ---------- Duplicate check function ----------
create or replace function find_similar_questions(p_stem text, p_threshold real default 0.6)
returns table (id uuid, stem text, score real, exact boolean)
language sql stable as $$
  with n as (
    select trim(regexp_replace(
             regexp_replace(lower(p_stem), '[^a-z0-9 ]', ' ', 'g'),
           '\s+', ' ', 'g')) as s
  )
  select q.id, q.stem,
         similarity(q.normalized_stem, n.s) as score,
         q.stem_hash = md5(n.s) as exact
  from questions q, n
  where (q.owner_id = auth.uid() or q.owner_id is null)
    and (q.stem_hash = md5(n.s) or similarity(q.normalized_stem, n.s) > p_threshold)
  order by exact desc, score desc
  limit 5;
$$;

-- ---------- Weak-area view ----------
create or replace view topic_performance as
select a.user_id, t.subject_id, q.topic_id,
       count(*)                                   as attempts,
       avg(case when a.is_correct then 1 else 0 end) as accuracy
from attempts a
join questions q on q.id = a.question_id
join topics t    on t.id = q.topic_id
group by a.user_id, t.subject_id, q.topic_id;
```

### Row Level Security
```sql
alter table questions       enable row level security;
alter table uploads         enable row level security;
alter table quiz_sessions   enable row level security;
alter table attempts        enable row level security;
alter table review_states   enable row level security;
alter table study_settings  enable row level security;

-- Questions: read built-in + own; write own only
create policy q_read  on questions for select to authenticated
  using (owner_id is null or owner_id = auth.uid());
create policy q_write on questions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Owner-only tables
create policy own_uploads  on uploads        for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_sessions on quiz_sessions  for all to authenticated using (user_id  = auth.uid()) with check (user_id  = auth.uid());
create policy own_attempts on attempts       for all to authenticated using (user_id  = auth.uid()) with check (user_id  = auth.uid());
create policy own_reviews  on review_states  for all to authenticated using (user_id  = auth.uid()) with check (user_id  = auth.uid());
create policy own_settings on study_settings for all to authenticated using (user_id  = auth.uid()) with check (user_id  = auth.uid());

-- Reference tables: read-only for authenticated users
alter table subjects        enable row level security;
alter table topics          enable row level security;
alter table encouragements  enable row level security;
alter table reference_items enable row level security;
create policy read_subjects   on subjects        for select to authenticated using (true);
create policy read_topics     on topics          for select to authenticated using (true);
create policy read_encourage  on encouragements  for select to authenticated using (true);
create policy read_reference  on reference_items for select to authenticated using (true);
```

> Make the `topic_performance` view `security_invoker = true` (Postgres 15+) so it follows the RLS on `attempts`:
> `alter view topic_performance set (security_invoker = true);`

> Storage: create a **private** bucket `uploads` and a bucket `question-images`, with policies limited to the owner's folder (`{user_id}/...`).

---

## 8. Upload & Parse Flow

```
1. User picks PDF/DOCX or pastes text
2. ~~File → Supabase Storage (uploads/{user_id}/{file})~~ Decided not to store files: they are read in the browser
   and only the chosen questions are saved (keeps copyrighted reviewers out of the cloud; migration 0003)
3. Extract text in browser (pdfjs-dist / mammoth)
4. Parse into questions:
     - Regex for structured format: "1. stem  A. ... B. ... C. ... D. ...  Answer: B"
     - Unparseable chunks → shown for manual editing
5. For each parsed question → find_similar_questions()
6. Review screen: table of parsed questions + duplicate badges
     [Skip] [Save anyway] [Replace]  + choose topic
7. Save → questions (source='upload', upload_id=...)
```

---

## 9. Folder Structure

```
mtle-reviewer/
├─ public/
│  └─ icons/                  # PWA icons (192, 512, apple-touch-icon 180)
├─ supabase/
│  ├─ migrations/             # SQL from §7
│  └─ seed/                   # subjects.sql, topics.sql, questions/*.json
├─ src/
│  ├─ lib/
│  │  ├─ supabase.ts
│  │  ├─ normalize.ts
│  │  ├─ selection.ts         # anti-repeat priority logic
│  │  ├─ fsrs.ts              # ts-fsrs wrapper
│  │  └─ parsers/
│  │     ├─ pdf.ts
│  │     ├─ docx.ts
│  │     └─ questionParser.ts
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ quiz/                # practice mode
│  │  ├─ mock-exam/
│  │  ├─ flashcards/
│  │  ├─ mistakes/
│  │  ├─ dashboard/
│  │  ├─ upload/
│  │  ├─ questions/           # add/edit/verify, coverage map
│  │  ├─ reference/
│  │  └─ planner/
│  ├─ components/             # shared UI (shadcn)
│  ├─ routes.tsx
│  └─ main.tsx
├─ .env.local                 # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├─ vite.config.ts
└─ PROJECT_PLAN.md
```

---

## 10. Pages / Routes

| Route | Page |
|---|---|
| `/login` | Login |
| `/` | Home: countdown, streak, today's target, quick start buttons |
| `/practice` | Source selector → practice quiz; also the per-subject / per-topic scores (the old `/dashboard` redirects here) |
| `/mock` | Mock exam setup → exam → results review |
| `/flashcards` | Due cards (FSRS) |
| `/mistakes` | Redirects to `/practice?from=mistakes` (Review again is a quiz on Practice, not a list page) |
| `/questions` | Browse, add, edit, verify; coverage map |
| `/upload` | Upload → parse → duplicate review |
| `/reference` | Normal values, formulas, mnemonics |
| `/settings` | Exam date, daily target |

---

## 11. PWA & iOS Notes

- Use `vite-plugin-pwa` with `registerType: 'autoUpdate'`
- Cache app shell + recently fetched questions for offline quizzes; queue attempts offline and sync when back online
- iOS has **no auto install prompt**, so detect iOS Safari and show a banner: *"I-tap ang Share → Add to Home Screen"*
- Add `apple-touch-icon` (180×180) and `<meta name="apple-mobile-web-app-capable" content="yes">`
- Handle the notch with `env(safe-area-inset-*)`
- Input font size **≥ 16px** so iOS doesn't zoom in on focus
- iOS may clear local storage, so **Supabase is the source of truth** and local storage is just cache
- Test on the actual iPhone often

---

## 12. Build Order (checklist)

1. [x] `npm create vite@latest mtle-reviewer -- --template react-ts`
2. [x] Tailwind + shadcn/ui + React Router + TanStack Query
3. [x] Supabase project → run migrations (§7) → seed subjects & topics
4. [x] Auth (login page, protected routes)
5. [x] Import seed questions JSON
6. [x] Practice quiz + explanations + attempts logging
7. [x] Mistake notebook
8. [x] Dashboard (Recharts) — built with simple bars instead of Recharts
9. [x] Manual add/edit/verify questions + coverage map
10. [x] Upload + parse + duplicate review
11. [x] Source selector + smart selection
12. [x] Mock exam
13. [x] Flashcards (ts-fsrs)
14. [x] Reference page, planner, streak, encouragements (notes live in src/data/encouragements.ts, not the encouragements table)
15. [ ] Image-based questions (blood smears, parasite ova, urine crystals, colonies) — moved up from Phase 4
16. [ ] PWA + iOS polish — installable (manifest, icons, service worker caching the app shell), install tip + Settings "Install app" done; offline Practice, Mock exam and Flashcards done (lib/offline: saved question bank in IndexedDB + outbox for answers and card ratings); still online-only: books as a source, editing/uploading questions, Report a problem
17. [x] Deploy to Vercel/Netlify — deployed on Cloudflare Pages instead
18. [x] Community shelf: share a book, browse, add your own copy (migration 0010; online only)
19. [x] Merge books: hold one of her books on the shelf and drop it on another (or Edit book → "Merge into…"); its questions go into the other book under one topic (its name, editable), then it's removed. One database step (`merge_books`, migration 0012)

---

## 13. Notes for Claude Code

- Use TypeScript strictly; generate DB types with `supabase gen types typescript`
- Store `selected_index` against the **original** choice order (shuffle is display-only, so keep a mapping)
- Every query must respect RLS; never use the service role key in the frontend
- Keep components mobile-first (design for ~375px width first)
- Built-in seed questions are AI-generated → fact-check them and add a reference before adding them; they are seeded as `verified`
