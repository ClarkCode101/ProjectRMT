import { Check, ChevronDown, ChevronRight, Flag, House, Minus, RotateCcw, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { NoteCard } from '@/components/NoteCard'
import { HeroPanel, heroButtonClass, LowFlag, RangeBar } from '@/components/report'
import type { QuizQuestion } from '@/features/quiz/api'
import { formatClock, type MockScore } from '@/lib/mockExam'
import { formatPercent, PASSING_RATE } from '@/lib/quiz'
import { useSubjectOfTopic, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'

type Filter = 'missed' | 'all' | 'flagged'

type Props = {
  label: string
  questions: QuizQuestion[]
  answers: (number | null)[]
  flags: boolean[]
  score: MockScore
  durationSec: number
  timedOut: boolean
  /** null = saved fine; otherwise a retry button is shown */
  onRetrySave: (() => void) | null
  saving: boolean
  onNewExam: () => void
  /** a personal note from src/data/encouragements.ts, if there is one */
  note: string | null
}

function resultMessage(rate: number) {
  if (rate >= 0.9) return 'Board-ready. Keep it up!'
  if (rate >= PASSING_RATE) return 'You passed! Review what you missed to make it stick.'
  if (rate >= 0.4) return 'Close to passing. Review your misses, then try again.'
  return 'A tough one, and that’s what mocks are for. Every miss is a lesson.'
}

/** One item in the review list: closed shows the status and the question; open shows the answers and explanation. */
function ReviewItem({ number, question, answer, flagged }: { number: number; question: QuizQuestion; answer: number | null; flagged: boolean }) {
  const subjectOf = useSubjectOfTopic()
  const subject = subjectOf(question.topic_id)
  const status = answer === null ? 'blank' : answer === question.correct_index ? 'right' : 'wrong'
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 outline-none hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset sm:px-5 [&::-webkit-details-marker]:hidden">
          <span
            className={cn(
              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-white',
              status === 'right' ? 'bg-correct' : status === 'wrong' ? 'bg-wrong' : 'bg-muted-foreground/50',
            )}
          >
            {status === 'right' ? <Check className="size-4" aria-label="Correct" /> : status === 'wrong' ? <X className="size-4" aria-label="Wrong" /> : <Minus className="size-4" aria-label="Blank" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-heading font-bold text-foreground tabular-nums">#{number}</span>
              <span className="font-heading font-bold text-foreground">{subject.code ?? '—'}</span>
              {subject.topicName}
              {flagged && <Flag className="size-3.5 fill-highlight text-[#9A5B00]" aria-label="Flagged" />}
            </span>
            <span className="mt-0.5 block leading-snug font-semibold group-open:font-bold">{question.stem}</span>
          </span>
          <ChevronDown className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pl-15">
          <dl className="grid gap-1.5 text-sm">
            {status !== 'right' && (
              <div className={cn('flex flex-wrap gap-x-2 rounded-md px-3 py-2', status === 'wrong' ? 'bg-wrong-soft' : 'bg-secondary')}>
                <dt className={cn('w-24 shrink-0 font-semibold', status === 'wrong' ? 'text-wrong' : 'text-muted-foreground')}>Your answer</dt>
                <dd className={cn('min-w-0', status === 'wrong' ? 'text-wrong line-through decoration-1' : 'text-muted-foreground italic')}>
                  {answer === null ? 'No answer' : question.choices[answer]}
                </dd>
              </div>
            )}
            <div className="flex flex-wrap gap-x-2 rounded-md bg-correct-soft px-3 py-2">
              <dt className="w-24 shrink-0 font-semibold text-correct">{status === 'right' ? 'Your answer' : 'Correct'}</dt>
              <dd className="min-w-0 font-bold text-correct">{question.choices[question.correct_index]}</dd>
            </div>
          </dl>
          {question.explanation && <p className="leading-relaxed text-foreground/90">{question.explanation}</p>}
        </div>
      </details>
    </li>
  )
}

// Results, drawn as the analyzer's printout (the end of rack → analyzer → printout):
// - the analyzer's head on top: "Run complete", and what to do next (the one dark area here)
// - a paper slip that feeds out of its slot, with only what she needs to decide what's next:
//   the score + stamp, up to 3 topics to focus on (L flag = below 60%), and a button to review her misses
// - "See all topics" and the review list stay closed until she asks (so the screen isn't overwhelming)

/** A dashed rule across the paper, between sections (like a thermal printout). */
function PaperRule() {
  return <hr aria-hidden className="border-t border-dashed border-foreground/20" />
}

/** One result row: the test (with a 60% bar under it), the score, and the L flag when it's low. */
function ResultRow({ name, code, correct, total }: { name: string; code?: string; correct: number; total: number }) {
  const rate = correct / total
  const low = rate < PASSING_RATE
  return (
    <tr className="align-top">
      <th scope="row" className="py-2.5 pr-3 text-left font-normal">
        <span className="block truncate font-semibold" title={name}>
          {code && <span className="mr-1.5 font-heading font-bold text-primary">{code}</span>}
          {name}
        </span>
        <span className="mt-1.5 block">
          <RangeBar rate={rate} label={`${name}: ${correct} of ${total} correct`} />
        </span>
      </th>
      <td className={cn('py-2.5 pr-2 text-right font-mono font-bold whitespace-nowrap tabular-nums', low && 'text-wrong')}>
        {formatPercent(rate)}
        <span className="block text-xs font-normal text-muted-foreground">
          {correct}/{total}
        </span>
      </td>
      <td className="w-7 py-2.5 text-right">{low && <LowFlag />}</td>
    </tr>
  )
}

/** A results table on the printout. */
function ResultTable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <table className="w-full table-fixed text-sm">
      <caption className="pb-1 text-left text-xs font-bold tracking-widest text-muted-foreground uppercase">{title}</caption>
      <colgroup>
        <col />
        <col className="w-16" />
        <col className="w-7" />
      </colgroup>
      <thead className="sr-only">
        <tr>
          <th scope="col">Test</th>
          <th scope="col">Result</th>
          <th scope="col">Flag</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-dashed divide-foreground/10">{children}</tbody>
    </table>
  )
}

/** "Focus on" lists at most this many topics below 60% (the rest are under "See all topics"). */
const FOCUS_TOPICS_SHOWN = 3

export function MockResults({ label, questions, answers, flags, score, durationSec, timedOut, onRetrySave, saving, onNewExam, note }: Props) {
  const topics = useTopics()
  const subjectOf = useSubjectOfTopic()
  const topicName = new Map((topics.data ?? []).map((t) => [t.id, t.name]))
  const topicLabel = (topicId: number) => topicName.get(topicId) ?? `Topic #${topicId}`
  const [filter, setFilter] = useState<Filter>('missed')
  const [reviewOpen, setReviewOpen] = useState(false)

  // Add the topics up per subject. More than one subject = a mixed exam.
  const bySubject = new Map<string, { code: string; name: string; correct: number; total: number }>()
  for (const t of score.byTopic) {
    const s = subjectOf(t.topicId)
    const code = s.code ?? '—'
    const entry = bySubject.get(code) ?? { code, name: s.subjectName ?? code, correct: 0, total: 0 }
    entry.correct += t.correct
    entry.total += t.total
    bySubject.set(code, entry)
  }
  const mixed = bySubject.size > 1
  // byTopic is weakest first, so the first few below 60% are the ones to focus on.
  const focusTopics = score.byTopic.filter((t) => t.correct / t.total < PASSING_RATE).slice(0, FOCUS_TOPICS_SHOWN)

  // "Missed" = wrong or left blank (both count as wrong).
  const isMissed = (i: number) => answers[i] !== questions[i].correct_index
  const counts = {
    missed: questions.filter((_, i) => isMissed(i)).length,
    all: questions.length,
    flagged: flags.filter(Boolean).length,
  }
  const shown = questions
    .map((question, i) => ({ question, i }))
    .filter(({ i }) => filter === 'all' || (filter === 'flagged' ? flags[i] : isMissed(i)))

  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'missed', label: 'Missed' },
    { value: 'all', label: 'All' },
    { value: 'flagged', label: 'Flagged' },
  ]

  /** Opens the review list (missed items first, or all if nothing was missed) and scrolls to it. */
  function openReview() {
    setFilter(counts.missed > 0 ? 'missed' : 'all')
    setReviewOpen(true)
    requestAnimationFrame(() => document.getElementById('review-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        {/* ---------- The analyzer's head: run complete + what to do next (the one dark area on this screen) ---------- */}
        <HeroPanel labelledBy="mock-result-heading" className="relative z-10 space-y-4 rounded-2xl pb-7 sm:pb-8">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <h1 id="mock-result-heading" className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase">
              <span className="size-2.5 rounded-full bg-[#5EE39A] shadow-[0_0_10px_2px_rgb(255_255_255/0.25)] ring-2 ring-white/20" aria-hidden />
              Run complete
              <span className="font-semibold text-white/70">· {label}</span>
            </h1>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
              <button type="button" className={heroButtonClass} onClick={onNewExam}>
                <RotateCcw className="size-5" aria-hidden />
                New mock exam
              </button>
              {/* Secondary: same height and shape as the gold button so the pair looks balanced,
                  but a see-through fill so it never competes with it. */}
              <Link
                to="/"
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-white/10 px-5 font-heading text-base font-bold text-white outline-none hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-white/60 active:translate-y-px"
              >
                <House className="size-5" aria-hidden />
                Back to Home
              </Link>
            </div>
          </div>
          {/* the slot the paper comes out of */}
          <div aria-hidden className="absolute inset-x-5 bottom-3 h-2 rounded-full bg-black/40 shadow-[inset_0_2px_3px_rgb(0_0_0/0.5)] sm:inset-x-7" />
        </HeroPanel>

        {/* ---------- The printout: feeds down out of the slot (the clip hides it until it's out) ---------- */}
        <div className="-mt-3 overflow-hidden px-6 pb-6 sm:px-9">
          <article
            aria-label="Printout"
            className="printout-feed drop-shadow-[0_14px_18px_rgb(7_71_94/0.18)]"
          >
            <div className="space-y-4 bg-card px-4 pt-6 pb-5 sm:px-6">
              {/* Only what helps her decide what to do next: the score, what to focus on, and the way to review.
                  Everything else is one tap away ("See all topics", the review list). */}
              <p className="text-center font-mono text-xs tracking-widest text-muted-foreground uppercase">Mock exam report</p>

              {/* the result, with the stamp like a released lab result */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Score</p>
                  <p className={cn('font-heading text-6xl leading-none font-bold tabular-nums sm:text-7xl', !score.passed && 'text-wrong')}>{formatPercent(score.rate)}</p>
                  <p className="mt-1 font-mono text-sm text-muted-foreground tabular-nums">
                    {score.correct} of {score.total} correct · {formatClock(durationSec)} used{timedOut && ' (time ran out)'}
                  </p>
                  <p className="mt-2 text-sm">{resultMessage(score.rate)}</p>
                </div>
                <p
                  className={cn(
                    'stamp shrink-0 rounded-md border-[3px] px-3 py-1.5 text-center font-heading text-lg leading-none font-bold sm:text-xl',
                    score.passed ? 'border-correct text-correct' : 'border-wrong text-wrong',
                  )}
                >
                  {score.passed ? 'PASSED' : 'NOT YET'}
                </p>
              </div>
              <PaperRule />

              {/* ---------- Focus on: at most a few topics below 60%, weakest first ---------- */}
              {focusTopics.length > 0 ? (
                <ResultTable title="Focus on">
                  {focusTopics.map((t) => (
                    <ResultRow key={t.topicId} code={mixed ? subjectOf(t.topicId).code : undefined} name={topicLabel(t.topicId)} correct={t.correct} total={t.total} />
                  ))}
                </ResultTable>
              ) : (
                <p className="flex items-center gap-2 rounded-lg bg-correct-soft px-3 py-2.5 text-sm font-semibold text-correct">
                  <Check className="size-4.5 shrink-0" aria-hidden />
                  Every topic is at 60% or higher.
                </p>
              )}

              {/* ---------- Everything else, one tap away: by subject (mixed exam) and every topic ---------- */}
              <details className="group">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
                  <span className="group-open:hidden">See all topics</span>
                  <span className="hidden group-open:inline">Hide all topics</span>
                </summary>
                <div className="mt-3 space-y-4">
                  {mixed && (
                    <ResultTable title="By subject">
                      {[...bySubject.values()].map((s) => (
                        <ResultRow key={s.code} code={s.code} name={s.name} correct={s.correct} total={s.total} />
                      ))}
                    </ResultTable>
                  )}
                  <ResultTable title="By topic">
                    {score.byTopic.map((t) => (
                      <ResultRow key={t.topicId} code={mixed ? subjectOf(t.topicId).code : undefined} name={topicLabel(t.topicId)} correct={t.correct} total={t.total} />
                    ))}
                  </ResultTable>
                </div>
              </details>
              <PaperRule />

              {/* ---------- The next step: open the review list (closed by default, so the page starts short) ---------- */}
              <button
                type="button"
                onClick={openReview}
                aria-expanded={reviewOpen}
                aria-controls="review-section"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-heading text-base font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                {counts.missed > 0 ? `Review ${counts.missed} missed ${counts.missed === 1 ? 'item' : 'items'}` : 'See all answers'}
                <ChevronDown className="size-5" aria-hidden />
              </button>
              <p className="text-center font-mono text-xs tracking-widest text-muted-foreground uppercase">— End of report —</p>
            </div>
            <div aria-hidden className="paper-tear" />
          </article>
        </div>
      </div>

      {note && <NoteCard message={note} />}

      {onRetrySave && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-wrong/40 bg-wrong-soft px-4 py-3 text-sm">
          <p>Your answers weren’t saved to your progress yet. Check your internet connection.</p>
          <button
            type="button"
            onClick={onRetrySave}
            disabled={saving}
            className="rounded-lg bg-wrong px-3 py-1.5 font-semibold text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Try again'}
          </button>
        </div>
      )}

      {/* ---------- Review every item: only after she asks for it (the button on the printout) ---------- */}
      {reviewOpen && (
        <section id="review-section" aria-labelledby="review-heading" className="scroll-mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="review-heading" className="text-lg font-bold">
              Review your answers
            </h2>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  aria-pressed={filter === f.value}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                    filter === f.value ? 'border-primary bg-primary text-white' : 'bg-card hover:border-primary/50',
                  )}
                >
                  {f.label}
                  <span className={cn('tabular-nums', filter === f.value ? 'text-white/80' : 'text-muted-foreground')}>{counts[f.value]}</span>
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="rounded-xl border bg-card px-4 py-6 text-center text-muted-foreground">Nothing here.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {shown.map(({ question, i }) => (
                <ReviewItem key={question.id} number={i + 1} question={question} answer={answers[i]} flagged={flags[i]} />
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Tap an item to see the answer and explanation. Wrong answers were added to Review Again.</p>
        </section>
      )}
    </div>
  )
}
