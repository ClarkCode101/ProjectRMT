# ProjectRMT — Study Plan ("Today's plan")

How the daily study plan works, and why. Built 2026-11-19. Linked from `PROJECT_PLAN.md`.

**The big idea:** the app picks **what** to study (from her scores). She picks **when** (full, light or rest days).
She never has to plan a calendar by hand. A missed day never piles up: after days away the plan gets **smaller**, not bigger.

---

## 1. Where it lives

| Screen | What it shows |
|---|---|
| **Home** (bottom bar, in thumb reach on an iPad) | The next task + **Start**, dots for the tasks, **See plan**. All done: "See what you learned". Rest day: "Rest day. Your streak stays safe." |
| **Plan page** `/plan` (sidebar, and More on phones) | **This week**, today's tasks with *why* each is there, **Swap**, Road to the exam, Past mistakes. All done: **What you learned today** + Tomorrow. |
| **Results** after a plan task | Where she is in the plan ("2 of 3 done"), the topic's score this morning → now, and **Next: …** straight to the next task. |

Code: `src/lib/studyPlan.ts` (the rules), `src/lib/studyDays.ts`, `src/lib/planProgress.ts`, `src/lib/planLinks.ts`,
`src/lib/retryQueue.ts`, and `src/features/plan/` (screens and their words). Logic is pure and unit-tested.

---

## 2. Today's tasks (a full day)

| # | Task | Picked how |
|---|---|---|
| 1 | **Flashcards** that are due (up to 30) | If none are due, task 1 is a **second focus subject** instead, and the two share task 2's questions. |
| 2 | **Focus subject**, on ONE topic | See §3. About **2/3 of her daily goal**, rounded to 5. "Learn" when the subject is close to guessing (§4). |
| 3 | **Past mistakes** that are due again | Oldest first, the rest of her daily goal. None due: a **mixed set** from every subject. In Simulate: a **Mock exam** every 3 days. |

- **Phases** (from her exam date): **Build** more than 60 days out, **Strengthen** 60 to 22 days, **Simulate** the last 21 days. No exam date: no phase.
- **Comeback day** (3 or more days since she last studied): flashcards capped at 10 (the rest spread over the next days), the subject task about 1/3 of the goal, 5 past mistakes. No Mock exam that day.
- **Mock exam day**: the subject task is about 1/3 of the goal. Never on exam day itself.
- The plan is **made once a day** and kept on the device, so it doesn't change while she works through it.
- **Swap** changes the next focus task to another subject (today only; tomorrow starts from her weakest again).

## 3. Picking the focus subject and topic

1. **Below 50% always first** (one subject below 50% fails the whole board). Lowest first; on a tie, the 20% subjects before the 10% ones.
2. Then, by phase:
   - **Build / no exam date:** subjects that are **new** (not tried, or fewer than 10 answers) come before those below 75%, so she sees everything early.
   - **Strengthen / Simulate:** subjects **below 75%** come first, then new ones.
3. Everything passing: the lowest one, to "keep it sharp".

**The topic** inside that subject: the lowest topic below 75% that has at least 3 answers. If there is none, the topic she has seen least (something new). If every topic passes, the lowest.

**Real score = 10 answers.** A subject with fewer than 10 answers has no real score yet. This one rule is used everywhere:
- Home cards show "3/10" and "7 more for a real score".
- The **overall score** only counts subjects with a real score.
- The plan calls such a subject "getting started" ("1/10 answered"), never "0% · below the 50% line" on one wrong answer.

## 4. "Learn": study, then test

For a subject **below 35%** (close to guessing with 4 choices) or with **fewer than 10 answers**:
1. **Study** 10 questions: the answer is shown with the *why* (choices shuffled, so the answer isn't always on top). Nothing is saved.
2. **Test** on the same 10. The task is done after the test.

## 5. Fix until right

In plan quizzes, a missed question comes back **2 questions later**, up to **3 tries** ("Fixed! Now you know this one.").
**Only the first try is saved and scored.** Retries and the Study step don't count, so the scores stay honest.

## 6. Past mistakes ladder

A missed question comes back after **1 day**. Each right answer moves it up: **3, then 7, then 14 days**. Right at the 14-day step means it is **fixed**. Wrong at any step sends it back to 1 day.
- A right answer only counts **on or after its due day** (answering again early doesn't skip the wait).
- Game answers (Board Review, Last Card) don't move a mistake.
- The Plan page shows one box per step (1, 3, 7, 14 days) plus fixed. The boxes add up to the "waiting" number.

## 7. This week: full, light or rest days

Seven tiles, Monday to Sunday, on top of the Plan page:
- **Days that passed:** from her answers. Green check = reached the goal; outline check = some; dashed = no study; moon = a rest day she kept.
- **Today:** the next task.
- **Days ahead:** her choice, and for tomorrow what the plan will likely pick ("Learn MICRO"). Days ahead follow her scores, so they may change.

Tap today or a day ahead, then pick:

| Mode | The plan that day |
|---|---|
| **Full day** | The usual 3 tasks (§2). |
| **Light day** | ONE task of 10 questions: past mistakes if due, else her focus. **No flashcards**: card reviews aren't saved as answers, so they wouldn't keep her streak. The cards wait for the next full day. |
| **Rest** | No tasks, and the **streak stays safe**. "Study today anyway" on the Plan page turns it back into a full day. |

- **"Every Saturday"** makes it a weekly choice. Otherwise it applies to that date only, and a one-off wins over the weekly choice.
- **One rest day a week** (Monday to Sunday), so "rest" can't turn into "stop". A new weekly rest day replaces the old weekly one.
- **Today can't be changed** once she has done something from today's plan.
- **Streak:** a rest day with no answers is skipped. It doesn't add to the streak and doesn't break it.

## 8. Where the data is kept

| What | Where |
|---|---|
| Study days (full / light / rest) | **Her account:** `study_settings.study_days` (jsonb, migration `0047_study_days.sql`). Every device plans the same week. Read with a shape check, so a bad value just means "full day". |
| Exam date, daily goal | Her account (`study_settings`, as before). |
| Today's plan, today's progress (done counts, studied questions, results) | **This device:** localStorage `projectrmt:todays-plan`, `projectrmt:plan-progress`. A new day starts fresh. |
| Answers | `attempts`, as always (first tries only from the plan). |

**Reset progress** (Settings) also clears today's plan, so a new one is made from zero. It keeps her exam date, daily goal and study days.

## 9. Design decisions (and why)

- **No hand-made calendar.** Choosing topics day by day is tiring, and the app knows her scores. A missed day in a manual calendar makes students feel behind and quit.
- **The plan moved off Home** to its own page. The tall card covered the body; Home keeps a slim bar.
- **No "Extra practice" button** once the day is done (or on a rest day). The day has a clear finish line, which brings her back tomorrow. Practice is still in the menu.
- **Plan results lead to the next task**, not out of the plan. No verse, no "Practice again".
- **Recap over checkmarks:** when all is done, "What you learned today" shows what moved (a topic's score "new → 40%", mistakes fixed).
- **Rest is purple** (calm, not a warning). Red stays for "needs work", gold for "next", green for "done".

## 10. Later

- [ ] Weekly recap (this week vs last week, the weakest skill).
