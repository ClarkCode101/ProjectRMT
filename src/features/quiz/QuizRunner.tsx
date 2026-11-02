import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SubjectTag, TubeRack, type TubeState } from '@/components/specimen'
import { Button } from '@/components/ui/button'
import { shuffledChoiceOrder } from '@/lib/quiz'
import { useSubjectOfTopic } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { recordAttempt, type QuizQuestion } from './api'

export type AnswerResult = { question: QuizQuestion; selectedIndex: number; isCorrect: boolean }

type Props = {
  sessionId: string
  questions: QuizQuestion[]
  onFinish: (answers: AnswerResult[]) => void
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function QuizRunner({ sessionId, questions, onFinish }: Props) {
  const subjectOf = useSubjectOfTopic()
  // Shuffle each question's choices once, when the quiz starts.
  // choiceOrders[q][displayPosition] = original choice index.
  const [choiceOrders] = useState(() => questions.map((q) => shuffledChoiceOrder(q.choices.length)))
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<AnswerResult[]>([])
  const [saveError, setSaveError] = useState(false)
  // When the current question appeared on screen (for time_ms).
  const shownAt = useRef(0)
  useEffect(() => {
    shownAt.current = Date.now()
  }, [current])

  const question = questions[current]
  const order = choiceOrders[current]
  const answer = answers[current] as AnswerResult | undefined
  const isLast = current === questions.length - 1
  const subject = subjectOf(question.topic_id)

  function choose(originalIndex: number) {
    if (answer) return // already answered
    const result: AnswerResult = {
      question,
      selectedIndex: originalIndex,
      isCorrect: originalIndex === question.correct_index,
    }
    setAnswers((prev) => [...prev, result])

    // Save in the background; the quiz keeps going even if this fails.
    recordAttempt({
      sessionId,
      questionId: question.id,
      selectedIndex: originalIndex,
      isCorrect: result.isCorrect,
      timeMs: Date.now() - shownAt.current,
    }).catch(() => setSaveError(true))
  }

  function next() {
    if (isLast) {
      onFinish(answers)
      return
    }
    setCurrent((c) => c + 1)
    window.scrollTo({ top: 0 })
  }

  const tubes = questions.map((q, i) => {
    const state: TubeState = answers[i] ? (answers[i].isCorrect ? 'correct' : 'wrong') : i === current ? 'current' : 'empty'
    return { state, subjectCode: subjectOf(q.topic_id).code }
  })

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <TubeRack tubes={tubes} />
        <p className="text-sm text-muted-foreground tabular-nums">
          Item {current + 1} of {questions.length}
        </p>
      </div>

      <article className="space-y-5 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SubjectTag code={subject.code} />
          {subject.topicName && <span className="text-sm text-muted-foreground">{subject.topicName}</span>}
          {question.source !== 'builtin' && (
            <span className="rounded-sm bg-secondary px-1.5 text-xs font-semibold">Akin</span>
          )}
        </div>

        <p className="text-xl leading-snug font-bold">{question.stem}</p>

        <div className="space-y-2" role="group" aria-label="Choices">
          {order.map((originalIndex, displayPos) => {
            const isCorrectChoice = originalIndex === question.correct_index
            const isSelected = answer?.selectedIndex === originalIndex
            const showCorrect = answer && isCorrectChoice
            const showWrong = answer && isSelected && !isCorrectChoice
            return (
              <button
                key={originalIndex}
                type="button"
                disabled={Boolean(answer)}
                onClick={() => choose(originalIndex)}
                className={cn(
                  'flex min-h-13 w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left text-base transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                  !answer && 'border-border hover:border-primary/50 active:bg-secondary',
                  showCorrect && 'border-correct bg-correct-soft',
                  showWrong && 'border-wrong bg-wrong-soft',
                  answer && !isSelected && !isCorrectChoice && 'border-transparent text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-bold',
                    showCorrect ? 'bg-correct text-white' : showWrong ? 'bg-wrong text-white' : 'bg-secondary',
                  )}
                >
                  {showCorrect ? <Check className="size-4" aria-label="Tamang sagot" /> : showWrong ? <X className="size-4" aria-label="Mali ang napili mo" /> : LETTERS[displayPos]}
                </span>
                <span className="flex-1">{question.choices[originalIndex]}</span>
              </button>
            )
          })}
        </div>

        {answer && (
          <div role="status" className={cn('border-l-4 pl-4', answer.isCorrect ? 'border-correct' : 'border-wrong')}>
            <p className={cn('font-bold', answer.isCorrect ? 'text-correct' : 'text-wrong')}>
              {answer.isCorrect ? 'Tama.' : 'Mali. Mapupunta ito sa Review Again.'}
            </p>
            {question.explanation && <p className="mt-1 leading-relaxed">{question.explanation}</p>}
          </div>
        )}
      </article>

      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          Hindi na-save ang ilang sagot. Check your internet; tuloy lang ang quiz.
        </p>
      )}

      {answer && (
        <Button className="h-12 w-full rounded-lg text-base font-bold" onClick={next} autoFocus>
          {isLast ? 'See results' : 'Next item'}
        </Button>
      )}
    </div>
  )
}
