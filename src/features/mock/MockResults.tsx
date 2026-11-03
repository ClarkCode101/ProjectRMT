import { Check, ChevronDown, Flag, Minus, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { NoteCard } from '@/components/NoteCard'
import { HeroPanel, heroButtonClass, RangeBar, REFERENCE_RANGE } from '@/components/report'
import type { QuizQuestion } from '@/features/quiz/api'
import { formatClock, type MockScore } from '@/lib/mockExam'
import { formatPercent, PASSING_RATE } from '@/lib/quiz'
import { useSubjectOfTopic, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'wrong' | 'blank' | 'flagged'

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
  if (rate >= 0.9) return 'Board-ready. Keep this up and you’ll walk into the exam confident.'
  if (rate >= PASSING_RATE) return 'You passed this mock! Review the items you missed to make it stick.'
  if (rate >= 0.4) return 'Close to passing. Go over the missed items below, then try another mock.'
  return 'A tough one, and that’s what mocks are for. Review every item below; each one is a lesson.'
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

/** One row with a name, a 60% bar and "correct/total". */
function ScoreRow({ name, code, correct, total }: { name: string; code?: string; correct: number; total: number }) {
  const rate = correct / total
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_6rem_3.5rem] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_3.5rem]">
      <span className="truncate font-semibold" title={name}>
        {code && <span className="mr-1.5 font-heading font-bold text-primary">{code}</span>}
        {name}
      </span>
      <RangeBar rate={rate} label={`${name}: ${correct} of ${total} correct`} />
      <span className={cn('text-right font-semibold tabular-nums', rate < PASSING_RATE && 'text-wrong')}>
        {correct}/{total}
      </span>
    </li>
  )
}

/** In a mixed exam, only the weakest few topics are listed (the subject rows above give the big picture). */
const WEAKEST_TOPICS_SHOWN = 8

export function MockResults({ label, questions, answers, flags, score, durationSec, timedOut, onRetrySave, saving, onNewExam, note }: Props) {
  const topics = useTopics()
  const subjectOf = useSubjectOfTopic()
  const topicName = new Map((topics.data ?? []).map((t) => [t.id, t.name]))
  const [filter, setFilter] = useState<Filter>('all')

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
  const topicRows = mixed ? score.byTopic.slice(0, WEAKEST_TOPICS_SHOWN) : score.byTopic

  const statusOf = (i: number) => (answers[i] === null ? 'blank' : answers[i] === questions[i].correct_index ? 'right' : 'wrong')
  const counts = {
    all: questions.length,
    wrong: questions.filter((_, i) => statusOf(i) === 'wrong').length,
    blank: questions.filter((_, i) => statusOf(i) === 'blank').length,
    flagged: flags.filter(Boolean).length,
  }
  const shown = questions
    .map((question, i) => ({ question, i }))
    .filter(({ i }) => filter === 'all' || (filter === 'flagged' ? flags[i] : statusOf(i) === filter))

  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'wrong', label: 'Wrong' },
    { value: 'blank', label: 'Blank' },
    { value: 'flagged', label: 'Flagged' },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* The ONE colored thing on this screen: the score and what to do next. */}
      <HeroPanel labelledBy="mock-result-heading" className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 id="mock-result-heading" className="text-sm font-semibold text-white/70">
              Mock exam result · {label}
            </h1>
            <p className="font-heading text-6xl leading-none font-bold tabular-nums sm:text-7xl">{formatPercent(score.rate)}</p>
            <p className="mt-1.5 text-white/85 tabular-nums">
              {score.correct} of {score.total} correct · {formatClock(durationSec)} used
              {timedOut && ' · time ran out'}
            </p>
          </div>
          {/* Like the "verified" stamp on a released lab result. */}
          <p
            className={cn(
              'stamp mt-2 shrink-0 rounded-md border-[3px] bg-white px-3 py-1.5 text-center font-heading text-lg leading-none font-bold sm:text-xl',
              score.passed ? 'border-correct text-correct' : 'border-wrong text-wrong',
            )}
          >
            {score.passed ? 'PASSED' : 'NOT YET'}
          </p>
        </div>
        <p className="text-white/90">{resultMessage(score.rate)}</p>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <button type="button" className={heroButtonClass} onClick={onNewExam}>
            <RotateCcw className="size-5" aria-hidden />
            New mock exam
          </button>
          <Link
            to="/"
            className="rounded-md px-2 py-2.5 text-center text-sm font-semibold text-white/85 underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-3 focus-visible:ring-white/60"
          >
            Back to Home
          </Link>
        </div>
      </HeroPanel>

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

      {/* ---------- Mixed exam: by subject first (each must reach 60% on the real exam) ---------- */}
      {mixed && (
        <section aria-labelledby="by-subject-heading" className="space-y-3">
          <h2 id="by-subject-heading" className="text-lg font-bold">
            By subject
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {[...bySubject.values()].map((s) => (
              <ScoreRow key={s.code} code={s.code} name={s.name} correct={s.correct} total={s.total} />
            ))}
          </ul>
        </section>
      )}

      {/* ---------- By topic: where the points were lost (weakest first) ---------- */}
      <section aria-labelledby="by-topic-heading" className="space-y-3">
        <h2 id="by-topic-heading" className="text-lg font-bold">
          {mixed ? 'Weakest topics' : 'By topic'}
        </h2>
        <ul className="divide-y rounded-xl border bg-card">
          {topicRows.map((t) => (
            <ScoreRow
              key={t.topicId}
              code={mixed ? subjectOf(t.topicId).code : undefined}
              name={topicName.get(t.topicId) ?? `Topic #${t.topicId}`}
              correct={t.correct}
              total={t.total}
            />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">The tick on each bar marks 60%, the start of the passing range ({REFERENCE_RANGE}).</p>
      </section>

      {/* ---------- Review every item ---------- */}
      <section aria-labelledby="review-heading" className="space-y-3">
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
    </div>
  )
}
