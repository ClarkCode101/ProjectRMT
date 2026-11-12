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
- [x] **Practice quiz**: filter by subject/topic/source; instant feedback + explanation after each answer; results show what she learned (new, cleared, to review), not pass/fail (see §6 "Results")
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
- [x] **Mock exam mode**: timed, 100 items per subject, no feedback until submit, review screen afterwards; results add readiness signals (pace, blanks, flagged-right, trend vs her last mock) (see §6 "Results")
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
- **Share**: the people button in an open book's top bar (next to Upload; filled when shared) → confirm "Share to Community?" / "Stop sharing?". Only her own books, with at least one question.
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

### Results: Practice = learn, Mock exam = measure
The two results screens must say different things, or the two modes feel the same (decided 2026-11-12).

**Practice results** (`QuizResults.tsx`, counts in `lib/practiceReport.ts`):
- Lead with what she learned: **New** (first time seen), **Cleared** (old mistakes now right, the only gold number), **To review** (wrong now, so in Review again). Plus a best-streak badge from 3 in a row.
- The score stays, but small ("5 of 10 correct"). **No PASSED / NOT YET stamp and no big %**: a 10-item session is not a pass/fail event.
- Her history is taken when the session starts, so this session's answers don't count as "seen before". If it can't load, New and Cleared are left out and the quiz still runs.
- Review again sessions show only Cleared and Still to review, and the gold button is "Review the N left".
- Two buttons of the same size: gold Practice again, see-through Back to Home.

**Mock exam results** (`MockResults.tsx`, logic in `lib/mockExam.ts`):
- Keeps the big score and the PASSED / NOT YET stamp: here the score is the point.
- One row of readings under the score: **Pace** (average seconds per item vs the 72s board pace, plus time used), **Blank** (counted as wrong, red when any), **Flagged** (how many flagged items ended up right).
- **Trend**: vs her last finished mock with the same scope (source + subject or book, saved as `scope` on the exam in progress). Green up, red down, grey same or first. Online only; not shown offline or for exams saved before scope existed.
- **Not planned:** time per item in Mock exam. Pace stays an average over the whole run (decided 2026-11-12).

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
  filters       jsonb,                 -- { source, upload_id, verified_only, subject_id, topic_id, from_mistakes, book_id } (the Mock exam trend matches on source + subject_id + book_id)
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
| `/mock` | Mock exam setup → exam → results (score, readings, trend) + review |
| `/flashcards` | Due cards (FSRS) |
| `/games` | Games: pick Board Review or Last Card from a row of cards you can swipe (§16) |
| `/board` | Board Review: snakes and ladders, answer right to move (§14) |
| `/cards` | Card game: match subject or number, answer right to put a card down (§15) |
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
19. [x] Merge books: hold one of her books on the shelf and drop it on another (or Edit book → "Merge into…"); its questions go into the other book under one topic (its name, editable), then it's removed. One database step (`merge_books`, migration 0012). Before merging, a duplicate check compares the incoming questions with EVERY question she has (all subjects incl. built-in, all her books), in the browser, and says where each match lives (lib/mergeDuplicates.ts, same cleanup and 60% line as the upload check): the same questions start ticked, alike ones don't; ticked ones are skipped, and deleted if they lived only in the merged book. Built-in questions are never deleted, and the question already in the other book is never touched (migration 0017)
20. [x] Topic → book (the opposite of merging): in one of her books, pick a topic in Contents → "Move to its own book". Only her own books (incl. Community copies) and her own questions. Each copied question remembers its author (`questions.copied_author`); if every question in the topic is an unedited copy from one classmate, the new book shows "by <name>" again. Editing a question's content clears its author. Merging gives BOTH sides a topic (the target's untopiced questions get the target's name), and splitting renames the old book after its one remaining topic, so a merge can be undone from either side. A book shows "by <name>" only while all its questions are unedited copies from that classmate (migration 0016). Topics in her books can be renamed from the same ⋯ (migration 0018)
21. [x] Merge into a subject: drop one of her books (or a Community copy) on a subject book, or Edit book → Merge into… → a subject. The book is removed; each question joins ITS OWN subject (ones written in the book join the dropped-on subject) under her topic named after the book. Her topic is a label on her questions (`questions.subject_topic`), not a row in the shared `topics` list, so it's private and the seed files are untouched; each question keeps its board topic, so the scores per board topic stay right. Duplicates against every question she has (built-in too) are ticked and skipped. Her topics in a subject get the ⋯ (Rename, Move to its own book); board topics never do, and subject books can't be dragged or merged into each other (migration 0019)
22. [x] Community duplicate check: before "Add to my library", the sheet warns how many of the book's questions look like ones she already has (same 60% check as merge/upload, run in the browser) and lists them to compare. Heads-up only; adding still copies every question. Needs `community_book_stems` (migration 0020). Later: "Skip the ones I have".
23. [x] Skip the ones I have: in that warning, each question has a tick box (Same ones ticked, alike ones not, like Merge). Ticked ones aren't copied (`add_community_book` p_skip, migration 0021); "N questions will be added · M skipped". Add waits for the check; skipping every question can't add an empty book.
24. [x] Board Review, solo (see §14, step 1): `/board`, three layouts, works offline (migration 0022)
25. [x] Board Review, live team games (§14, step 2): lobby, invites, invite link, 90-second turns, watching + reveal (migration 0023, already run on Supabase 2026-11-11). First live test with 2 accounts at once done 2026-11-11 (create → invite/link → join → start → roll, watch, reveal, clock run out, Exit).
26. [x] Board Review, Lifelines (§14, step 2b): three of your own, once each per game (Rule out 2, Second chance, Snake shield), in solo and team games (migration 0032: `attempts.assisted`, `board_use_lifeline`; run it on Supabase before deploying)
27. [x] Board Review, room chat that clears after 5 hours (§14, step 3; migration 0029), and the redesigned team finish screen with the race and "Your answers" (migration 0030). Both migrations already run on Supabase 2026-11-11.
28. [ ] *(maybe)* Push notifications for invites (§14, step 4)
29. [x] Last Card, solo against 3 computer players (§15, step 1): `/cards`, works offline (migration 0041, already run on Supabase 2026-11-12)
30. [x] Games page (§16): one "Games" nav item for Board Review and Last Card, a swipeable card picker at `/games`

---

## 14. Board Review (snakes and ladders game) — planned 2026-11-11

A snakes-and-ladders board where **you only move if you answer right**. Co-op, never a ranking of classmates. Built in small steps; step 1 must be fun on its own before any multiplayer work.

### Step 1 — Solo board (works offline)

**Board**
- 60 squares in a 10 × 6 zigzag grid, start at square 1, finish at 60.
- **Six zones of 10 squares**, one per subject in exam order, each in its subject color: 1–10 CC, 11–20 MICRO, 21–30 HEMA, 31–40 BBIS, 41–50 CM, 51–60 HTMLE. Questions come from the zone she's standing in, so the board is a visible journey through every subject (decided 2026-11-11, chosen over random subjects for the sense of progress).
- One hand-made layout first: 5 ladders and 5 snakes (data file, not random). Rules for the layout: nothing on squares 1 or 60, a ladder never ends on a snake head, ladders and snakes spread across the zones.
- Later idea, **Mixed mode**: instead of zones, each question's subject is drawn from a bag of 10 slips weighted like the exam (CC 2, MICRO 2, HEMA 2, BBIS 2, CM 1, HTMLE 1), refilled when empty. Not in step 1.
- Overshooting 60 just finishes the game (no "exact roll" rule; it only frustrates).

**A turn**
1. **Roll the die** (1–6). The number shows before the question, so she knows what's at stake. (Decided 2026-11-11: a plain die, no Easy/Medium/Hard choice.)
2. Answer one question from the current zone's subject (any difficulty, picked with anti-repeat); the subject shows as a chip (e.g. "Hematology").
3. Correct → the token moves by the roll. Wrong → it stays, and the answer review shows the explanation and the note on every choice (same as Practice).
4. Land on the foot of a **ladder** → **Challenge question** from the same zone: difficulty 3 if there is one, else one she got wrong before, else any. Correct → climb. Wrong → stay at the foot, no penalty.
5. Land on a **snake** head → **Rescue question** from her **weakest topic** (lowest accuracy in `summarizePerformance`, at least a few attempts); no weak topic yet → one of her latest mistakes; none → any question from the zone. The rescue can be from any subject, so the snake mixes subjects (interleaving) right where her weak spots are. Correct → safe. Wrong → slide down.

**Questions**
- Source = All (built-in + hers), same as the Practice default. Anti-repeat with `pickQuestions` / `priorityScore`; never the same question twice in one game.
- Every answer is saved as an attempt, so it counts toward the subject and topic scores and the Mistake notebook. Offline answers go through the same outbox as Practice. A new session mode `board` (small migration: add the enum value) keeps board answers apart from Practice in the stats.

**Saving the game**
- One game in progress, saved on the device (local storage) after every turn: position, turn count, questions used, snakes escaped, ladders climbed. "Continue game" / "New game". Losing it (iOS clearing storage) is acceptable; the answers are already in Supabase.

**Finish screen (Lab report style)**
- Questions answered, accuracy, ladders climbed, snakes escaped vs slid, accuracy per subject, and the topics to review next with a button into Practice for them.

**Layout (iPad first)**
- The board is the star: as big as the screen allows, centered. The Roll button is fixed at the bottom (thumb zone). The question pops up over the board as a bottom sheet (on iPad too) and can't be dismissed before answering; after Continue the popup closes and THEN the token walks, climbs or slides, so she sees it happen. Landing on a ladder or snake: the token arrives first, then its question pops up (changed 2026-11-11, after the first try had the question beside a small board).
- **Three layouts** (A, B, C in `LAYOUTS`, lib/board.ts); a new game picks one at random, never the one she just played, and the saved game remembers it. Mixed lengths (1 to 3 rows) and angles on purpose: the first try with all of them one row straight up looked and played flat. Every layout has one big 3-row ladder and one big 3-row snake for the drama, at least one ladder and no snake head in CC for a gentle start, and no two ladders/snakes crossing or even coming close (all checked in board.test.ts for each layout).
- The board uses the app's "lab report" colors so it fits in (a light-blue glass look was tried first and felt like another app): a white card with gray rules, squares alternating white and light gray, gray-ink numbers; ladders in analyzer blue (the one accent), snakes in red (the board's "L flag"), her token in gold (the color for wins). Snakes are drawn friendly (eyes, tongue), not scary. The start screen follows Mock exam's layout (title, the board in the middle, name plate, Start, a line of rules). The token walks square by square; ladders and snakes drawn as SVG lines; honor reduced motion. No emoji; lucide icons only.

**Files**
- `src/lib/board.ts`: layout data, move, square effects, zone for a square, weakest-topic pick. Pure functions with tests in `board.test.ts`.
- `src/lib/boardSave.ts`: read/write the saved game (try/catch, falls back to "no game").
- `src/features/board/`: `BoardPage.tsx`, `BoardGrid.tsx`, `TurnSheet.tsx` (roll + question), `BoardResults.tsx`.
- Route `/board`.

**Notes**
- Entry (decided 2026-11-11): a nav icon right after Flashcards on the tablet/computer rail; on phones, in the More sheet (the bottom bar is full). Added only once the page exists.
- *(optional)* **Streak bonus**: 3 correct in a row → she may re-roll once. Try the game without it first.
- Few difficulty 3 questions (checked 2026-11-11, built-in): CC 45, HEMA 62, BBIS 7, CM 3, HTMLE 2, MICRO 0; her own and uploaded ones are all 2. That's why the ladder Challenge falls back to past mistakes. Long term: write more difficulty 3 questions for MICRO, HTMLE, CM and BBIS.

### Step 2 — Team games with classmates (live, online) — decided 2026-11-11
Changed from the first idea (one shared token, async over a week): the owner wants it **live, in one sitting**.
- **2–4 players, each with their own token, racing to 60.** First to 60 wins. The finish screen lists everyone.
- **Lobby first:** the host creates a game, invites classmates, and taps Start (needs at least 2). At the start **everyone rolls once for the turn order** (highest goes first; ties broken at random), shown to all.
- **Turns in that order.** Each turn has a **90-second clock** (roll + answer; a new clock for a ladder or snake question). Time runs out → the turn passes. **2 missed turns in a row → removed**, same as Exit. Whoever **exits is out of the turns**; the game goes on with the rest.
- **Everyone watches each question live**, and sees the answer reveal, so waiting is review time too. The reveal **continues by itself after 8 seconds** (a bar empties inside the Continue button; tapping earlier is fine), so every screen moves the token together and the next player's clock isn't eaten (the database adds 10 seconds before it really starts). Decided 2026-11-11. Solo board keeps the manual Continue.
- **Built-in questions only** in team games (everyone's own questions differ). The **database rolls the die, picks the question and checks the answer** (`security definer` functions), so nobody can move without answering. Each answer is saved as the answering player's attempt (counts in their scores, session mode `board`).
- **Invites, three ways:** (1) **game code**: every lobby has a 6-character code (no look-alikes 0/O, 1/I); classmates type it in Board Review → "Play with classmates" → "Join with a code" (auto-capitals; a pasted invite link gives its code; never joins by itself: Join turns solid at 6 characters and she taps it, per WCAG 3.2.2 On Input); (2) **Copy link**: copies the invite link to paste in the group chat; the link opens straight into the lobby (changed 2026-11-11 from the iPad share sheet: copying behaves the same on every device); (3) **pick from the list**: tap an open seat (accounts with a first name in Settings). At most 3 pending invites per person, one per classmate, invites expire after 24 hours. One active team game per person at a time.
- **Lobby layout (2026-11-11):** seats on top (2 × 2 wide cards on phones and iPad portrait; one row of 4 small upright cards, avatar over name, from 1024px so the lobby with its chat fits without scrolling) (open seats are tappable → classmate list; only the first says "Invite a classmate"), one "Invite with code" area (code tap-to-copy + "Copy link"), then a bottom bar with Cancel/Leave on the left and Start on the right. Focus follows the moment: with 1 player the invite area stands out and Start is disabled ("Need 1 more player"); from 2 players the invite area quiets down and Start leads; at 4 the invite area is hidden. Each piece of info shows once.
- **Play again (rematch), decided 2026-11-11:** the finish screen stays (the win is the reward) and gets a **Play again** button. **Tapping it is the vote:** the first to tap makes the next lobby and becomes its host; the others tap the same button to join it (one tap, no code). Who tapped shows live: **"Ana and Ben want to play again"** under the button, and a **"Playing again"** badge next to their name in the standings. No separate vote stage (it would need a pass rule and could stall on someone who walked away). **"Back to Board Review" is the "no"** (migration 0025, `rematch_done`): it's saved, so a later Play again doesn't invite that player (no unwanted invite or red dot), and the others see a grey **"Done"** badge. Someone who only closed the tab hasn't said no, so they're still invited; tapping Play again later clears "done". **Play again always gets a different board** from the game just played (one of the other two layouts; migration 0028), like the solo game. Saying "done" also takes back an invite to the next game that was already sent (someone tapped Play again before she left), so no invite or red dot waits for her (0028). Two taps at once never split the group (the finished room is locked; the second one joins). The others also get an invite, in case they left the screen. "Back to Board Review" stays for whoever is done. Migration 0024 (`rematch_room_id`, `board_rematch`).
- **Finish screen (redesigned 2026-11-11):** the hero has the winner, her line ("You: 5 of 8 correct (62%)", or "You didn't get a turn to answer this time. Next game!" for 0 answers, never "0 of 0"), **The race** (one bar per player filled to their square of 60, in finish order, with correct/answered and the Playing again / Done / Left / Timed out badge), then Play again. Below: **Your answers** by subject with the 60% tick, and **Review next** → Practice for subjects under 60%, like the solo finish screen (migration 0030, `board_my_game_answers`, read from her own session for that game). The separate Standings table is gone (the race replaces it).
- **Who hosts after Play again (decided 2026-11-11):** still the first to tap (the group never waits on one person), but said plainly: the finish screen reads "You'll host the next game" before anyone taps, and the host's lobby says "You're the host. Tap Start when everyone's in."; others see "Waiting for <name> to start…". **The host leaving a lobby with others in passes the host to the next player who joined** instead of cancelling it for everyone (migration 0031); alone, the host's button is still "Cancel game".
- **Red dot on the Board Review nav icon** when an invite or your turn is waiting. No push notifications yet.
- Online only. Live updates with Supabase Realtime (plus a slow refresh as a fallback).
- Tables (RLS: members only, no direct writes): `board_rooms`, `board_room_players`, `board_invites`, `board_layout_jumps` (the three layouts, kept in step with `LAYOUTS` by a test). Migration 0023.
- **Step 2b: Lifelines** (decided 2026-11-11, replaces "a teammate answers your rescue question"). Everyone at the board is racing against each other, so **no lifeline involves another player** (they could steer you wrong on purpose, and a 2-player game would be unfair). "Ask a classmate" and "Poll the room" were considered and rejected for that reason; "New question" was swapped for Snake shield.
  - **Three lifelines, the same for everyone, each usable once per game:**
    1. **Rule out 2**: two wrong choices disappear.
    2. **Second chance**: if your answer is wrong, you pick once more (the first pick stays crossed out).
    3. **Snake shield**: only on a snake Rescue question; if you get it wrong, you don't slide.
  - **Chosen before you answer**, in one row under the choices. Rule out 2 acts at once; Second chance and Snake shield are switched on and are used up even if you then answer right (a gamble, so picking when to use them is the strategy; offering them after a wrong answer would make them automatic and slow down the watchers).
  - Usable on any question in your turn (normal, ladder Challenge, snake Rescue); Snake shield only shows on Rescue. Used ones stay in the row, greyed and crossed out.
  - **Team games:** the database does all three (it removes the two wrong choices, checks a Second chance pick without revealing the right one, and applies the shield), so nobody can cheat. Watchers see "Ana used Second chance" on the question. The 90-second clock keeps running.
  - **Solo board:** the same three, saved with the game on the device.
  - **Scores:** answers helped by Rule out 2 or Second chance are still saved, but not counted in subject/topic accuracy (they'd make her look more ready than she is); wrong ones still go to the Mistake notebook. Snake shield doesn't change the answer, so it counts normally. One attempt per question: with Second chance, only her final pick is saved (the crossed-out first pick isn't). `attempts.assisted` marks them; `topic_performance` and the snake's "weakest topic" skip them. The 7-day activity chart on Home still counts them (it shows how much she practiced).
  - Once Second chance has crossed out her first pick, the other lifelines are locked for that question (Rule out 2 then would nearly give the answer away). Rule out 2 takes 1 choice on a 3-choice question, and can't be used with only 2.
  - The outbox only sends `assisted` when an answer in the batch was helped, and resends without it if the database refuses (migration not run yet), so no answer is ever lost.
  - Finish screens show the lifelines each player used.

### Step 3 — Room chat that clears after 5 hours
- Chat lives inside a game room only (no separate messenger; the class already has a Messenger group). One chat per room: in the lobby and the game. **Not on the finish screen** (changed 2026-11-11: Play again already shows who wants another game, and the screen is for the result and what to review). Play again makes a new room, so a new chat.
- Quick replies first (chips that fit the moment: lobby, game, watching a question) plus free text, max 200 characters, text only. At most 5 messages per 10 seconds per person.
- Messages show only while under 5 hours old, and an hourly `pg_cron` job deletes them; a cancelled lobby's chat is deleted at once. Sender can delete their own message: tap your own bubble and a Delete button shows under it (no trash icon on every message; others' messages can't be tapped). The UI says "Messages clear after 5 hours", never "private".
- **Layout (decided 2026-11-11):** in the game, a chat button with an unread count sits left of Roll (thumb zone, replacing the plain dice box) and opens the chat as a bottom sheet. A classmate's new message shows for a few seconds as a small bubble above the bottom bar. The question popup is a native dialog (nothing can sit on top of it), so while it's up the latest message shows inside it, and **watchers get one row of quick replies** at its bottom (no typing, the question stays the focus). The chat sheet closes by itself when the die or a question comes up. Lobby: on tablets and computers the lobby is one screen with no page scroll (like Mock exam's start screen): the chat card takes the space left and only its message list scrolls, newest at the bottom, with Cancel/Start always at the bottom. On phones (the page scrolls there) the card shows only the latest 3 messages and "See all N messages" (opens the same sheet), so the page doesn't grow with the chat. Messages from one person less than 5 minutes apart share one "Name · time" line, like Messenger.
- Supabase Realtime for live updates (plus a slow refresh as a fallback). Migration 0029.

### Step 4 — *(maybe)* Push notifications
- Web Push (installed PWA on iPad, iOS 16.4+) through a Supabase Edge Function. Only if invites get missed without it.

---

## 15. Card game (shedding game, our own version) — planned 2026-11-12

A match-and-shed card game (the old Crazy Eights family): match the top card by **subject or number**, first to empty their hand wins. **You only get to put a card down if you answer a question from its subject.** Our own name, cards and look: never the name, logo, card design or "UNO" call of the trademarked game. Name: **"Last Card"** (decided 2026-11-12).

### Step 1 — Solo against 3 computer players (works offline)

**Deck (78 cards)**
- **Six suits = the six built-in subjects**, in exam order: CC, MICRO, HEMA, BBIS, CM, HTMLE (decided 2026-11-12: as many colors as built-in subjects).
- Each subject: numbers 1–9, Skip, Reverse, Draw 2 (12 cards × 6 = 72), plus **6 Wild**. No "Wild Draw 4" in step 1.
- 7 cards each, 4 players. The rest is the draw pile; one number card starts the discard pile. Draw pile empty → shuffle the discard pile (except the top card) back in.

**A turn (hers)**
1. Playable cards (same subject, same number/action, or Wild) are raised in her hand; the rest are dimmed but still readable.
2. She taps a card → a question from **that card's subject** pops up (the same bottom sheet as Board Review).
3. Correct → the card goes down and its action happens. Wrong → the card stays in her hand, she **draws 1**, and her turn ends. The review shows the explanation and the note on every choice (same as Practice).
4. No playable card → she draws 1; if it's playable she may play it (with a question), else the turn passes.
5. **Wild**: question from her **weakest topic** (same pick as the Board Review snake), then she chooses the next subject. A way to aim the game at a subject she wants to practice.

**Action cards**
- **Skip**: the next player loses their turn. **Reverse**: the direction flips (arrow in the middle of the table).
- **Draw 2 played on her**: she answers 2 questions from that card's subject; each wrong answer = draw 1 (so 0 to 2 cards), then her turn is skipped (as usual for a Draw 2). A bot hit by Draw 2 "answers" both at once the same way. No stacking.
- **Drawing is only for when nothing fits**: while a card in her hand fits she has to try it (a wrong answer costs the same 1 card, and she learns something).

**"Last card" banner (decided 2026-11-12)**
- No button to tap and no penalty: when anyone (her or a bot) is down to 1 card, the app shows a gold **Last card** banner on that player by itself. The game is about answering questions, not remembering to tap in time. (A tap-it-or-draw-2 call was considered and dropped for step 1; maybe later if the group wants more pressure.)

**Winning**
- **The first player with no cards left wins, and the game stops there** (decided 2026-11-12: no playing on for 2nd/3rd place; keeps a game around 10–15 minutes). The last card still needs a right answer: wrong → it stays, she draws 1, and the game goes on.
- If the last card is an action card (Skip, Draw 2, Wild), the game **ends at once**; its action doesn't happen.
- Draw pile AND discard pile both empty (rare) → the game ends; fewest cards wins, a tie if equal.
- A bot winning ends the game too; she still gets her finish screen.

**Computer players**
- 3 bots with made-up names. Simple strategy: play a matching action card first, else a matching number, Wild last; Wild picks the subject they hold most of.
- A bot "answers" right with a fixed chance (about 70%); wrong → it draws 1, like her. Their questions are not shown (keeps the game fast); each bot turn takes about 1 second with the card sliding to the pile. Honor reduced motion.

**Questions**
- Source = All (built-in + hers), anti-repeat with `pickQuestions` / `priorityScore`, never the same question twice in one game.
- Every answer is saved as an attempt (counts in subject/topic scores and the Mistake notebook; offline through the same outbox). New session mode `cards` (migration 0041: add the enum value).
- Board Review lifelines: not in step 1.

**Saving the game**
- One game in progress on the device (local storage) after every turn: all hands, both piles, direction, whose turn, questions used. "Continue game" / "New game". Losing it is acceptable; the answers are already in Supabase.

**Finish screen (Lab report style, like Board Review)**
- Who won, everyone ranked by cards left, "You: 12 of 16 correct (75%)", cards drawn because of wrong answers, accuracy per subject with the 60% tick, and **Review next** → Practice for subjects under 60%.

**Layout (iPad first)**
- Table in the middle: the 3 bots around the top (name, card-back count, a "turn" ring), the draw pile and discard pile in the center with the current subject chip and the direction arrow.
- **Her hand at the bottom (thumb zone)**, fanned, scrolls sideways if it grows past what fits. Tap a card to play; no drag needed.
- Lab-report colors; no emoji, lucide icons only. **Color is never the only signal** (WCAG 1.4.1): every card shows its subject code big plus the number/action.
- **Card colors (decided 2026-11-12):** today's `SUBJECT_COLOR` has two near-twin pairs (CC `#8A6410` vs CM `#7E5410`, HEMA `#9C3A68` vs HTMLE `#A2406F`), and in a game where matching by color IS the play they must be told apart at a glance. So **CM becomes green `#3A6B23` and HTMLE blue `#2B5C8F`, app-wide** (one subject = one color everywhere: books, Board Review zones, cards); CC, MICRO, HEMA, BBIS stay. Check any other place that hard-codes the old two colors.
- **Table layout (mockup v2, approved 2026-11-12):** players around a white oval table (left, top-right, right), draw pile top-left of center, the pile in the middle with direction arrows, her hand fanned at the bottom, "You" + Draw a card bottom-left, the big analyzer-blue **Answer to play** button bottom-right (tap a card to pick it, then the button; a mis-tap never traps her in a question). Card faces: subject color, white rounded window with the number/action, subject code in the corners. Card backs: analyzer-blue stripes with an "RMT" mark. Players shown with initials. Top-right round buttons: Settings, How to play, Exit. No glass look.

**Files**
- `src/lib/cards.ts`: deck, shuffle, `canPlay`, apply a card, next player, bot move. Pure functions with tests in `cards.test.ts`.
- `src/lib/cardsSave.ts`: read/write the saved game (try/catch, falls back to "no game").
- `src/features/cards/`: `CardsPage.tsx` (loads questions, saves answers, runs the computer turns), `CardsGameView.tsx` (the game screen's look, no data), `CardTable.tsx`, `Hand.tsx`, `PlayingCard.tsx` (card faces and backs), `CardQuestionSheet.tsx` (its own question popup: the Board Review one is about dice and squares), `CardsIntro.tsx`, `CardResults.tsx`, `handState.ts` (what she can tap, how far apart her cards sit; tested), `api.ts` (the `cards` session).
- Route `/cards`; opened from the Games page (§16). (It first had its own Spade nav icon; replaced by "Games" the same day.)
- **The line at the top says the whole last move** (added 2026-11-12, the owner found Skip confusing): one move's events joined with " · ", so it's always clear who lost a turn and who goes next, e.g. "Kat S. played HEMA Skip · Your turn is skipped", "You played CC Reverse · Direction flipped · Kat S. goes next", "You played HEMA Draw 2 · Rafa M. drew 2 and is skipped" (`describeMove`; events carry a move number).
- **Screen sizes (checked with screenshots 2026-11-12):** from 1024px (iPad landscape) her side is three columns like the mockup (You + Draw | hand | Answer to play). Narrower (iPad portrait 744–834px, phones) her hand takes the whole width and Draw + Answer to play sit side by side under it (in three columns her hand only got ~320px on an iPad in portrait). The computer players sit around the oval from 700px (every iPad), in one row above it on phones. Her cards overlap just enough to fit; past the tightest overlap the row scrolls.

### Step 2 — *(later)* Live with classmates
- Reuse Board Review's rooms, invites, code/link, chat and Play again; the database deals, checks answers and keeps each hand private. Only after step 1 is fun on its own.

---

## 16. Games page — decided 2026-11-12

The rail had two game icons (Board Review, Last Card) next to each other. They're grouped into **one nav item, "Games"** (Gamepad2 icon), so the menu stays short and new games have one home.

- **`/games`: a row of game cards to swipe** (a game picker, like a console's), chosen over putting both full start screens in a carousel: one look shows every game's status, the Board Review start screen is too heavy to swipe, and a third game just adds a card.
- **Like a game's select screen: no boxes, just the game itself** (changed twice on 2026-11-12, by the owner: first the cards had Continue / New game / Play with classmates on them, easy to hit by accident while swiping; then a boxed card with a picture, which felt like a list, not a game). Each game is the **object** (the board with her token / a fanned hand in front of the draw pile) **standing over a soft shadow**, then its name, a red **"Team game waiting"** on Board Review when an invite or her turn is waiting, one quiet line (**"Paused · where she left off"** or **"New game · what the game is"**), and "Tap to play ›".
- **The game in the middle is "picked"**: it pops when it arrives, then **floats up and down with a gentle sway** while its shadow shrinks as it rises (`game-pick`, `game-float`, `game-shadow` in index.css; off with Reduce Motion). The others wait at the sides, smaller and faded.
- **The whole game is one big button**: tapping the picked one opens its start screen (Continue, New game and the team games are there); tapping one at the side first brings it to the middle. A swipe never counts as a tap.
- **Swipe** on iPad and phones; **press and drag with a mouse** on a computer (added 2026-11-12: the row follows the mouse with a grab cursor; a drag of 60px or more goes one game over, a shorter one settles on the nearest; a drag never opens a game; touch keeps the browser's own swipe; checked with real mouse events in Chrome); **arrows and dots** do the same for any device and the keyboard (WCAG 2.5.1, never swipe-only). The next card **peeks in** at the side so it's clear there's more. The **last game she looked at** shows first next time (local storage).
- The start screens have a **"‹ Games"** link on top; finish screens say **"Back to Games"**.
- `/board`, `/cards`, and the invite links (`/board/join/…`, `/board/team/…`) keep working. The Games icon lights up inside either game and carries Board Review's red dot (on phones: "Games" in the More sheet, with "Waiting").
- One screen tall on tablets and computers; on phones the page scrolls (a game card is taller than the space left).
- Files: `src/features/games/`: `GamesPage.tsx`, `GamePicker.tsx` (the carousel, no data), `games.ts` (status lines, last game; tested), `BackToGames.tsx`.

---

## 13. Notes for Claude Code

- Use TypeScript strictly; generate DB types with `supabase gen types typescript`
- Store `selected_index` against the **original** choice order (shuffle is display-only, so keep a mapping)
- Every query must respect RLS; never use the service role key in the frontend
- Keep components mobile-first (design for ~375px width first)
- Built-in seed questions are AI-generated → fact-check them and add a reference before adding them; they are seeded as `verified`
