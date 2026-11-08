import { RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { MistakeItem } from '@/components/MistakeItem'
import { NoteCard } from '@/components/NoteCard'
import { NOTES } from '@/data/encouragements'
import { pickNote, shouldShowRandomNote } from '@/lib/planner'
import { HeroPanel, heroButtonClass, RangeBar, REFERENCE_RANGE, SampleRun } from '@/components/report'
import { formatPercent, PASSING_RATE } from '@/lib/quiz'
import { useSubjectOfTopic } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import type { AnswerResult } from './QuizRunner'

type Props = { answers: AnswerResult[]; onRestart: () => void }

function resultMessage(rate: number) {
  if (rate >= 0.9) return 'Excellent! Almost perfect. That’s a board-ready score.'
  if (rate >= PASSING_RATE) return 'You passed! Review the ones you missed to push your score higher.'
  if (rate >= 0.4) return 'Almost there! A little more review on the ones you missed and you’ll reach 60%.'
  return 'That’s okay, this is just the start. Go over the ones you missed below, then try again.'
}

export function QuizResults({ answers, onRestart }: Props) {
  const subjectOf = useSubjectOfTopic()
  const score = answers.filter((a) => a.isCorrect).length
  const rate = answers.length > 0 ? score / answers.length : 0
  const passed = rate >= PASSING_RATE
  const wrong = answers.filter((a) => !a.isCorrect)
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* The ONE colored thing on this screen: the score and what to do next. */}
      <HeroPanel labelledBy="result-heading" className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 id="result-heading" className="text-sm font-semibold text-white/70">
              Practice result
            </h1>
            <p className="font-heading text-6xl leading-none font-bold tabular-nums sm:text-7xl">{formatPercent(rate)}</p>
            <p className="mt-1.5 text-white/85 tabular-nums">
              {score} of {answers.length} correct
            </p>
          </div>
          {/* Like the "verified" stamp on a released lab result. */}
          <p
            className={cn(
              'stamp mt-2 shrink-0 rounded-md border-[3px] bg-white px-3 py-1.5 text-center font-heading text-lg leading-none font-bold sm:text-xl',
              passed ? 'border-correct text-correct' : 'border-wrong text-wrong',
            )}
          >
            {passed ? 'PASSED' : 'NOT YET'}
          </p>
        </div>
        <SampleRun samples={answers.map((a) => (a.isCorrect ? 'correct' : 'wrong'))} />
        <p className="text-white/90">{resultMessage(rate)}</p>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <button type="button" className={heroButtonClass} onClick={onRestart}>
            <RotateCcw className="size-5" aria-hidden />
            Practice again
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

      {bySubject.size > 1 && (
        <section aria-labelledby="by-subject-heading" className="space-y-3">
          <h2 id="by-subject-heading" className="text-lg font-bold">
            By subject
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
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
          <p className="text-xs text-muted-foreground">The tick on each bar marks 60%, the start of the passing range ({REFERENCE_RANGE}).</p>
        </section>
      )}

      {wrong.length > 0 && (
        <section aria-labelledby="missed-heading" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="missed-heading" className="text-lg font-bold">
              Questions you missed ({wrong.length})
            </h2>
            <Link to="/practice?from=mistakes" className="text-sm font-semibold text-primary hover:underline">
              Review again
            </Link>
          </div>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
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
