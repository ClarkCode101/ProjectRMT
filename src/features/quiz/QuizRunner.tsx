import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { shuffledChoiceOrder } from '@/lib/quiz'
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

  const score = answers.filter((a) => a.isCorrect).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Item {current + 1} of {questions.length}
        </span>
        <span>Score: {score}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((current + (answer ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      <Card>
        <CardContent className="space-y-4">
          {question.source !== 'builtin' && <Badge variant="secondary">My question</Badge>}
          <p className="text-lg leading-relaxed font-medium">{question.stem}</p>

          <div className="space-y-2" role="group" aria-label="Choices">
            {order.map((originalIndex, displayPos) => {
              const isCorrectChoice = originalIndex === question.correct_index
              const isSelected = answer?.selectedIndex === originalIndex
              return (
                <button
                  key={originalIndex}
                  type="button"
                  disabled={Boolean(answer)}
                  onClick={() => choose(originalIndex)}
                  className={cn(
                    'flex min-h-12 w-full items-start gap-3 rounded-lg border px-3 py-3 text-left text-base transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    !answer && 'hover:bg-muted active:bg-muted',
                    answer && isCorrectChoice && 'border-green-600 bg-green-50 text-green-900',
                    answer && isSelected && !isCorrectChoice && 'border-red-600 bg-red-50 text-red-900',
                    answer && !isSelected && !isCorrectChoice && 'opacity-60',
                  )}
                >
                  <span className="font-semibold">{LETTERS[displayPos]}.</span>
                  <span className="flex-1">{question.choices[originalIndex]}</span>
                  {answer && isCorrectChoice && <span aria-label="correct answer">✓</span>}
                  {answer && isSelected && !isCorrectChoice && <span aria-label="your answer, wrong">✗</span>}
                </button>
              )
            })}
          </div>

          {answer && (
            <div
              role="status"
              className={cn(
                'rounded-lg p-3 text-sm leading-relaxed',
                answer.isCorrect ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900',
              )}
            >
              <p className="font-semibold">{answer.isCorrect ? 'Tama! 🎉' : 'Mali — okay lang, babalikan natin ito.'}</p>
              {question.explanation && <p className="mt-1">{question.explanation}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          Hindi na-save ang ilang sagot (check your internet). Tuloy lang ang quiz.
        </p>
      )}

      {answer && (
        <Button className="h-12 w-full text-base" onClick={next} autoFocus>
          {isLast ? 'See results' : 'Next'}
        </Button>
      )}
    </div>
  )
}
