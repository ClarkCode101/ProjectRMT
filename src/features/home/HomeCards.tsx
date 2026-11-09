import { Check, Dices, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { SubjectSummary } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import { useWarmupQuestions } from './api'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const cardClass = 'rounded-2xl border bg-card p-4 shadow-[0_12px_32px_-24px_rgb(7_71_94/0.45)]'

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
