import { Flame, House, RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { MistakeItem } from '@/components/MistakeItem'
import { NoteCard } from '@/components/NoteCard'
import { VerseCard } from '@/components/VerseCard'
import { NOTES } from '@/data/encouragements'
import { useTopicPerformance } from '@/features/dashboard/api'
import { PlanResultButtons, PlanResultHeading } from '@/features/plan/PlanResultParts'
import { planResultMessage, type PlanResultInfo } from '@/features/plan/planResults'
import { quietHeroButtonClass } from '@/features/plan/planStyles'
import { pickNote, shouldShowRandomNote } from '@/lib/planner'
import { practiceMessage, practiceReport, type PracticeMode, type PriorHistory } from '@/lib/practiceReport'
import { HeroPanel, heroButtonClass, RangeBar, REFERENCE_RANGE, SampleRun } from '@/components/report'
import { Slime } from '@/components/Slime'
import { PASSING_LABEL, PASSING_RATE } from '@/lib/quiz'
import { useSubjectOfTopic } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import type { QuizQuestion } from './api'
import type { AnswerResult } from './QuizRunner'

type Props = {
  answers: AnswerResult[]
  mode: PracticeMode
  /** her answers before this session; null if they couldn't be loaded (then New and Cleared are left out) */
  prior: PriorHistory | null
  /** e.g. the book's title; otherwise the subject code, or "Mix" */
  label?: string
  onRestart: () => void
  /** Review again only: quiz the ones she just missed */
  onReviewLeft: (missed: QuizQuestion[]) => void
  /** Practice only: quiz her whole Review again list */
  onReviewMistakes: () => void
  starting: boolean
  /**
   * The quiz was a task in Today's plan: the results say where she is in the plan, and the gold button
   * starts the next task (or, all done, shows what she learned). No "Practice again" or "Review again" then:
   * both lead out of the plan, and the ones she missed come back in tomorrow's plan anyway.
   */
  plan?: PlanResultInfo | null
}

/** Show the best-streak badge from this many in a row (same as the badge during the quiz). */
const STREAK_BADGE_FROM = 3

/** One count beside the score, e.g. "2 Cleared". Gold only for a win worth celebrating. */
function Count({ value, label, win = false }: { value: number; label: string; win?: boolean }) {
  return (
    <li className="border-l border-white/20 px-3.5 first:border-l-0 first:pl-0 last:pr-0">
      <span className={cn('block font-heading text-2xl leading-none font-bold tabular-nums', win && 'text-highlight')}>{value}</span>
      <span className="mt-1 block text-xs font-semibold whitespace-nowrap text-white/70">{label}</span>
    </li>
  )
}

/**
 * A topic's score this morning → now. "Now" comes from the scores, which refresh once her answers reach the server,
 * so it may catch up a moment after the screen opens. Not shown until there is a score now.
 */
function TopicChange({ focus }: { focus: NonNullable<PlanResultInfo['focus']> }) {
  const performance = useTopicPerformance()
  const rows = (performance.data ?? []).filter((r) => r.subject_id === focus.subjectId && (focus.topicId === null || r.topic_id === focus.topicId))
  const attempts = rows.reduce((sum, r) => sum + r.attempts, 0)
  if (attempts === 0) return null
  const now = rows.reduce((sum, r) => sum + r.accuracy * r.attempts, 0) / attempts
  const pct = (rate: number) => `${Math.floor(rate * 100)}%`
  return (
    <p className="font-heading text-xl font-bold whitespace-nowrap tabular-nums">
      <span className="text-base text-white/60">{focus.from === null ? 'new' : pct(focus.from)}</span>
      <span aria-hidden className="text-white/60"> → </span>
      <span className="sr-only"> now </span>
      <span className={focus.from === null || now >= focus.from ? 'text-[#8fe0b0]' : 'text-white'}>{pct(now)}</span>
    </p>
  )
}

// Practice is for learning, so the results lead with what she learned (new, cleared, to review),
// not a pass/fail verdict. The PASSED stamp belongs to Mock exam, where the score is the point.
export function QuizResults({ answers, mode, prior, label, onRestart, onReviewLeft, onReviewMistakes, starting, plan = null }: Props) {
  const subjectOf = useSubjectOfTopic()
  const report = practiceReport(
    answers.map((a) => ({ questionId: a.question.id, isCorrect: a.isCorrect })),
    prior,
    mode,
  )
  const wrong = answers.filter((a) => !a.isCorrect)
  const review = mode === 'review'
  // Now and then (about 1 session in 3), a personal note. The same session always gets the same answer.
  const seed = answers.map((a) => a.question.id).join(',')
  const note = answers.length > 0 && shouldShowRandomNote(seed) ? pickNote(NOTES, 'random', seed) : null

  // Score per subject within this session, in the order subjects first appeared.
  const bySubject = new Map<string, { correct: number; total: number }>()
  for (const a of answers) {
    const code = subjectOf(a.question.topic_id).code ?? '—'
    const entry = bySubject.get(code) ?? { correct: 0, total: 0 }
    entry.total++
    if (a.isCorrect) entry.correct++
    bySubject.set(code, entry)
  }
  const sessionLabel = label ?? (bySubject.size === 1 ? [...bySubject.keys()][0] : 'Mix')
  const reviewLeft = review && wrong.length > 0

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* The ONE colored thing on this screen: what she learned and what to do next. */}
      <HeroPanel labelledBy="result-heading" className="space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          {/* The slime cheers for a good run (passing range or better) and smiles otherwise: practice is for learning. */}
          <Slime mood={report.total > 0 && report.correct / report.total >= PASSING_RATE ? 'cheer' : 'happy'} className="-my-2 w-16 sm:w-20" />
          {plan ? (
            <PlanResultHeading plan={plan} id="result-heading" />
          ) : (
            <h1 id="result-heading" className="mr-auto text-sm font-semibold text-white/70">
              {review ? 'Review again done' : 'Practice done'}{' '}
              <span className="font-normal text-white/55">· {review ? `${report.total} ${report.total === 1 ? 'mistake' : 'mistakes'}` : sessionLabel}</span>
            </h1>
          )}
          {report.bestStreak >= STREAK_BADGE_FROM && (
            <span className="flex shrink-0 items-center gap-1 rounded-full border-2 border-ink bg-highlight-soft px-2.5 py-0.5 font-heading text-sm font-bold text-foreground tabular-nums">
              <Flame className="size-4 text-highlight" aria-hidden />
              Best streak {report.bestStreak}
            </span>
          )}
        </div>

        {/* The score, with the learning counts beside it (they wrap under it on a narrow phone). */}
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <p className="font-heading text-4xl leading-none font-bold tabular-nums">
            {report.correct}{' '}
            <span className="text-lg font-semibold text-white/70">
              of {report.total} {plan?.kind === 'learn' ? 'after studying' : review || plan?.kind === 'mistakes' ? 'fixed' : 'correct'}
            </span>
          </p>
          {/* In the plan: a topic's score this morning → now (the plan counts the rest its own way). */}
          {plan ? (
            plan.focus && <TopicChange focus={plan.focus} />
          ) : (
            <ul className="flex" aria-label="This session">
              {review ? (
                <>
                  <Count value={report.correct} label="Cleared" win={report.correct > 0} />
                  <Count value={report.toReview} label="Still to review" />
                </>
              ) : (
                <>
                  {report.fresh !== null && <Count value={report.fresh} label="New" />}
                  {report.cleared !== null && <Count value={report.cleared} label="Cleared" win={report.cleared > 0} />}
                  <Count value={report.toReview} label="To review" />
                </>
              )}
            </ul>
          )}
        </div>

        <SampleRun samples={answers.map((a) => (a.isCorrect ? 'correct' : 'wrong'))} />
        <p className="text-white/90">{plan ? planResultMessage(plan, report.correct, report.total) : practiceMessage(report, mode)}</p>

        {/* Two buttons of the same size and shape: gold = the next step, see-through = the quiet way out. */}
        {plan ? (
          <PlanResultButtons plan={plan} />
        ) : (
        <div className="grid gap-2.5 pt-1 sm:grid-cols-2">
          {reviewLeft ? (
            <button type="button" className={cn(heroButtonClass, 'sm:flex sm:w-full')} disabled={starting} onClick={() => onReviewLeft(wrong.map((a) => a.question))}>
              <RotateCcw className="size-5" aria-hidden />
              {starting ? 'Loading…' : `Review the ${wrong.length} left`}
            </button>
          ) : (
            <button type="button" className={cn(heroButtonClass, 'sm:flex sm:w-full')} onClick={onRestart}>
              <RotateCcw className="size-5" aria-hidden />
              Practice again
            </button>
          )}
          <Link to="/" className={quietHeroButtonClass}>
            <House className="size-5" aria-hidden />
            Back to Home
          </Link>
        </div>
        )}
      </HeroPanel>

      {note && <NoteCard message={note} />}
      {/* In the plan, nothing between the results and the next task (and the questions to read). */}
      {!plan && <VerseCard />}

      {bySubject.size > 1 && (
        <section aria-labelledby="by-subject-heading" className="space-y-3">
          <h2 id="by-subject-heading" className="text-lg font-bold">
            By subject
          </h2>
          <ul className="divide-y-2 divide-dashed divide-border overflow-hidden rounded-2xl border-[2.5px] border-ink bg-card shadow-toon">
            {[...bySubject].map(([code, { correct, total }]) => {
              const subjectRate = correct / total
              return (
                <li key={code} className="grid grid-cols-[4rem_minmax(0,1fr)_3.5rem] items-center gap-3 px-4 py-3">
                  <span className="font-heading font-bold">{code}</span>
                  <RangeBar rate={subjectRate} label={`${code}: ${correct} of ${total} correct`} />
                  <span className={cn('text-right font-semibold tabular-nums', subjectRate < PASSING_RATE && 'text-wrong')}>
                    {correct}/{total}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-muted-foreground">The tick on each bar marks {PASSING_LABEL}, the start of the passing range ({REFERENCE_RANGE}).</p>
        </section>
      )}

      {wrong.length > 0 && (
        <section aria-labelledby="missed-heading" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="missed-heading" className="text-lg font-bold">
              Questions you missed ({wrong.length})
            </h2>
            {!review && !plan && (
              <button
                type="button"
                onClick={onReviewMistakes}
                className="rounded-sm text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                Review again
              </button>
            )}
          </div>
          <ul className="divide-y-2 divide-dashed divide-border overflow-hidden rounded-2xl border-[2.5px] border-ink bg-card shadow-toon">
            {wrong.map(({ question, selectedIndex }) => (
              <MistakeItem
                key={question.id}
                subject={subjectOf(question.topic_id)}
                stem={question.stem}
                choices={question.choices}
                selectedIndex={selectedIndex}
                correctIndex={question.correct_index}
                choiceNotes={question.choice_notes}
                explanation={question.explanation}
              />
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Tap a question to see the answer and explanation.</p>
        </section>
      )}
    </div>
  )
}
