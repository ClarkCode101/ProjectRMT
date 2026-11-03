import { BookOpen, Check, Dices, Flame, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { LowFlag, REFERENCE_RANGE } from '@/components/report'
import type { DayActivity } from '@/lib/activity'
import { formatPercent, type OverallStats, type SubjectSummary } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import type { Verse } from '@/lib/verses'
import { useWarmupQuestions } from './api'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const cardClass = 'rounded-2xl border bg-card p-4 shadow-[0_12px_32px_-24px_rgb(7_71_94/0.45)]'

// ---------- Readiness: a gauge plus the subjects listed like lab results ----------

/** Half-circle gauge with a tick at 60%. */
function Gauge({ rate }: { rate: number | null }) {
  const pct = rate === null ? 0 : Math.round(rate * 100)
  // Point on the arc at 60% (left end = 0%, right end = 100%).
  const angle = Math.PI * (1 - 0.6)
  const tick = { x: 100 + 80 * Math.cos(angle), y: 100 - 80 * Math.sin(angle) }
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-60" aria-hidden>
      <path d="M20 100A80 80 0 0 1 180 100" fill="none" stroke="var(--secondary)" strokeWidth="18" strokeLinecap="round" />
      {pct > 0 && (
        <path
          d="M20 100A80 80 0 0 1 180 100"
          fill="none"
          stroke={rate! < 0.6 ? 'var(--wrong)' : 'var(--primary)'}
          strokeWidth="18"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct} 100`}
          className="transition-[stroke-dasharray] duration-700"
        />
      )}
      <circle cx={tick.x} cy={tick.y} r="3" fill="var(--foreground)" />
    </svg>
  )
}

export function ReadinessCard({ stats, summary }: { stats: OverallStats; summary: SubjectSummary[] }) {
  return (
    <section aria-labelledby="readiness-heading" className={cn(cardClass, '@container shrink-0')}>
      {/* Wide card: gauge on the left, results on the right (like a lab report summary). Narrow card: stacked. */}
      <h2 id="readiness-heading" className="font-heading text-base font-bold">
        Board readiness
      </h2>
      <div className="mt-2 grid gap-3 @md:grid-cols-[11rem_minmax(0,1fr)] @md:items-center @md:gap-5">
        {/* Narrow card: small gauge beside its caption. Wide card: gauge above the caption. */}
        <div className="flex items-center gap-3 @md:block">
          <div className="relative flex w-32 shrink-0 justify-center @md:mx-auto @md:w-auto @md:max-w-44 lg:tall:max-w-52">
            <Gauge rate={stats.accuracy} />
            <p className="absolute bottom-0 text-center">
              <span className={cn('block font-heading text-2xl leading-none @md:text-3xl lg:tall:text-4xl font-bold tabular-nums', stats.accuracy !== null && stats.accuracy < 0.6 ? 'text-wrong' : 'text-primary')}>
                {stats.accuracy === null ? '—' : formatPercent(stats.accuracy)}
              </span>
            </p>
          </div>
          <p className="text-xs text-muted-foreground @md:mt-1.5 @md:text-center lg:tall:text-sm">
            {stats.answered === 0 ? (
              'Answer a few questions to see your score.'
            ) : (
              <>
                <span className="font-bold text-foreground">
                  {stats.passingSubjects} of {stats.totalSubjects}
                </span>{' '}
                subjects passing. The dot marks 60%.
              </>
            )}
          </p>
        </div>

        {/* table-fixed lets long subject names shorten with "…" instead of pushing the columns out. */}
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Results by subject</caption>
          <colgroup>
            <col />
            <col className="w-18" />
            <col className="w-0 @md:w-20" />
          </colgroup>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="pb-1.5 font-semibold">Subject</th>
              <th scope="col" className="pb-1.5 text-right font-semibold">Result</th>
              <th scope="col" className="hidden pb-1.5 pl-3 text-right font-semibold @md:table-cell">Reference</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.subjectId} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-1 text-left font-normal tall:py-1.5 lg:tall:py-2">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="w-12 shrink-0 font-heading font-bold">{s.code}</span>
                    <span className="truncate text-muted-foreground">{s.name}</span>
                  </span>
                </th>
                <td className="py-1 text-right whitespace-nowrap tabular-nums tall:py-1.5 lg:tall:py-2">
                  {s.accuracy === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={cn('inline-flex items-center gap-1.5 font-bold', s.belowPassing ? 'text-wrong' : 'text-correct')}>
                      {s.belowPassing && <LowFlag />}
                      <span>
                        {Math.round(s.accuracy * 100)}
                        <span className="font-normal text-muted-foreground">%</span>
                      </span>
                    </span>
                  )}
                </td>
                <td className="hidden py-1 pl-3 text-right text-muted-foreground tabular-nums tall:py-1.5 lg:tall:py-2 @md:table-cell">{REFERENCE_RANGE}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------- Today (daily goal + streak) and the verse of the day ----------

/** Shared header for the two cards in this row, so they line up: title on the left, a small chip on the right. */
function RowCardHeader({ id, title, chip }: { id: string; title: string; chip: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 id={id} className="font-heading text-base font-bold">
        {title}
      </h2>
      {chip}
    </div>
  )
}

const chipClass = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold'

/** A ring that fills up toward today's goal, with today's count in the middle. Green once the goal is reached. */
function GoalRing({ done, target }: { done: number; target: number }) {
  const pct = Math.min(100, Math.round((done / target) * 100))
  return (
    <div className="relative grid size-20 shrink-0 place-items-center tall:size-24">
      <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r="19" fill="none" stroke="var(--secondary)" strokeWidth="4" />
        {pct > 0 && (
          <circle
            cx="22"
            cy="22"
            r="19"
            fill="none"
            stroke={done >= target ? 'var(--correct)' : 'var(--primary)'}
            strokeWidth="4"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${pct} 100`}
            className="transition-[stroke-dasharray] duration-700"
          />
        )}
      </svg>
      <span className="font-heading text-2xl font-bold tabular-nums tall:text-3xl">{done}</span>
    </div>
  )
}

function todayMessage(done: number, target: number) {
  if (done === 0) return 'Start with a few questions'
  if (done >= target) return 'Goal reached. Great work!'
  return `${target - done} more to go today`
}

/** `days`: the last 7 days, today last. */
function TodayCard({ days, target, streak }: { days: DayActivity[]; target: number; streak: number }) {
  const done = days.at(-1)?.answered ?? 0
  return (
    <section aria-labelledby="today-heading" className={cn(cardClass, 'flex flex-col gap-3')}>
      <RowCardHeader
        id="today-heading"
        title="Today"
        chip={
          <p className={cn(chipClass, streak > 0 ? 'bg-highlight-soft text-[#9A5B00]' : 'bg-secondary text-muted-foreground')}>
            <Flame className="size-3.5" aria-hidden />
            {streak > 0 ? `${streak}-day streak` : 'No streak yet'}
          </p>
        }
      />

      <div className="flex flex-1 items-center gap-4">
        <GoalRing done={done} target={target} />
        <div className="min-w-0">
          <p className="font-semibold tabular-nums">of {target} answered</p>
          <p className={cn('mt-0.5 text-sm', done >= target ? 'font-semibold text-correct' : 'text-muted-foreground')}>{todayMessage(done, target)}</p>
        </div>
      </div>

      {/* This week: a filled dot for every day with at least one answer. */}
      <ol className="flex justify-between" aria-label="This week">
        {days.map((d, i) => {
          const isToday = i === days.length - 1
          return (
            <li key={d.date} className="flex flex-col items-center gap-1" title={`${d.label}: ${d.answered} answered`}>
              <span
                className={cn(
                  'size-3 rounded-full border-2',
                  d.answered > 0 ? 'border-primary bg-primary' : 'border-border bg-card',
                  isToday && d.answered === 0 && 'border-primary/60',
                )}
                aria-hidden
              />
              <span className={cn('text-[10px] text-muted-foreground', isToday && 'font-bold text-foreground')} aria-hidden>
                {d.label.charAt(0)}
              </span>
              <span className="sr-only">
                {isToday ? 'Today' : d.label}: {d.answered > 0 ? `${d.answered} answered` : 'no answers'}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function VerseCard({ verse }: { verse: Verse }) {
  const short = verse.text.length <= 110
  return (
    <section aria-labelledby="verse-heading" className={cn(cardClass, 'flex flex-col gap-3')}>
      <RowCardHeader
        id="verse-heading"
        title="Verse of the day"
        chip={
          <p className={cn(chipClass, 'bg-secondary text-muted-foreground')} title="World English Bible">
            <BookOpen className="size-3.5" aria-hidden />
            WEB
          </p>
        }
      />
      {/* Centered in the space left, with a thin blue line on the left like a printed quotation. */}
      <figure className="my-auto border-l-[3px] border-primary/70 pl-3.5">
        {/* Short verses get the bigger heading font; long ones stay smaller so the card keeps a tidy size. */}
        <blockquote className={cn('text-pretty', short ? 'font-heading text-lg leading-snug font-semibold' : verse.text.length > 160 ? 'text-sm leading-relaxed' : 'leading-relaxed')}>
          {verse.text}
        </blockquote>
        <figcaption className="mt-2 text-sm font-bold text-primary">{verse.reference}</figcaption>
      </figure>
    </section>
  )
}

export function TodayAndVerse({ days, target, streak, verse }: { days: DayActivity[]; target: number; streak: number; verse: Verse }) {
  return (
    // From tablet size up this row takes whatever height is left in the column.
    // Side by side when the column is wide enough, stacked when it is narrow.
    <div className="@container md:min-h-min md:flex-1">
      <div className="grid h-full gap-3 @md:grid-cols-2 lg:gap-4">
        <TodayCard days={days} target={target} streak={streak} />
        <VerseCard verse={verse} />
      </div>
    </div>
  )
}

// ---------- Warm-up: one quick question, the mini game on Home ----------

/** bare: no card border/padding, for use inside a dialog. */
export function WarmupCard({ subject, subjectTopicIds, bare = false }: { subject: SubjectSummary; subjectTopicIds: number[]; bare?: boolean }) {
  // The list arrives already shuffled, so going through it in order never repeats until it runs out.
  const questions = useWarmupQuestions(subject.subjectId, subjectTopicIds)
  const [position, setPosition] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState({ right: 0, total: 0 })

  const pool = questions.data ?? []
  const question = pool.length > 0 ? pool[position % pool.length] : undefined
  const order = question?.order ?? []

  function choose(originalIndex: number) {
    if (picked !== null || !question) return
    setPicked(originalIndex)
    setScore((s) => ({ right: s.right + (originalIndex === question.correct_index ? 1 : 0), total: s.total + 1 }))
  }

  function nextQuestion() {
    setPosition((p) => p + 1)
    setPicked(null)
  }

  const answered = picked !== null && question
  const isRight = answered && picked === question.correct_index

  return (
    <section aria-labelledby="warmup-heading" className={bare ? undefined : cardClass}>
      <div className="flex items-center justify-between gap-3 pr-8">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-highlight-soft">
            <Dices className="size-4.5 text-[#9A5B00]" aria-hidden />
          </span>
          <div>
            <h2 id="warmup-heading" className="font-heading text-lg leading-tight font-bold">
              Warm-up: {subject.code}
            </h2>
            <p className="text-xs text-muted-foreground">One quick question. Not counted in your scores.</p>
          </div>
        </div>
        {score.total > 0 && (
          <p className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-sm font-bold tabular-nums">
            {score.right}/{score.total}
            <span className="sr-only"> correct</span>
          </p>
        )}
      </div>

      {questions.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading a question…</p>
      ) : questions.isError ? (
        <p className="mt-4 text-sm text-muted-foreground">Couldn’t load a question. Check your internet connection.</p>
      ) : !question ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No {subject.code} questions yet.{' '}
          <Link to="/questions/new" className="font-semibold text-primary hover:underline">
            Add one
          </Link>
        </p>
      ) : (
        <div key={question.id} className="animate-in fade-in mt-4 space-y-3 duration-200">
          <p className="leading-snug font-bold sm:text-lg">{question.stem}</p>
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Choices">
            {order.map((originalIndex, displayPos) => {
              const isCorrectChoice = originalIndex === question.correct_index
              const showCorrect = answered && isCorrectChoice
              const showWrong = answered && picked === originalIndex && !isCorrectChoice
              return (
                <button
                  key={originalIndex}
                  type="button"
                  disabled={Boolean(answered)}
                  onClick={() => choose(originalIndex)}
                  className={cn(
                    'flex min-h-12 items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40',
                    !answered && 'hover:border-primary active:bg-secondary',
                    showCorrect && 'border-correct bg-correct-soft ring-1 ring-correct',
                    showWrong && 'border-wrong bg-wrong-soft ring-1 ring-wrong',
                    answered && !showCorrect && !showWrong && 'opacity-50',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-md font-heading text-xs font-bold',
                      showCorrect ? 'bg-correct text-white' : showWrong ? 'bg-wrong text-white' : 'bg-secondary',
                    )}
                  >
                    {showCorrect ? <Check className="size-4" aria-label="Correct answer" /> : showWrong ? <X className="size-4" aria-label="Your answer, incorrect" /> : LETTERS[displayPos]}
                  </span>
                  <span className="flex-1">{question.choices[originalIndex]}</span>
                </button>
              )
            })}
          </div>

          {answered && (
            <div role="status" className={cn('animate-in fade-in rounded-xl px-3.5 py-3 text-sm duration-200', isRight ? 'bg-correct-soft' : 'bg-wrong-soft')}>
              <p className={cn('font-heading text-base font-bold', isRight ? 'text-correct' : 'text-wrong')}>{isRight ? 'Correct!' : 'Not quite.'}</p>
              {question.explanation && <p className="mt-1 leading-relaxed">{question.explanation}</p>}
            </div>
          )}
          {answered && (
            <button
              type="button"
              onClick={nextQuestion}
              autoFocus
              className="h-11 w-full rounded-xl bg-primary font-heading font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 sm:w-auto sm:px-6"
            >
              Another one
            </button>
          )}
        </div>
      )}
    </section>
  )
}
