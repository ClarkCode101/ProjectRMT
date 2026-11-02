import { Link } from 'react-router'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPercent, PASSING_RATE } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import type { AnswerResult } from './QuizRunner'

type Props = { answers: AnswerResult[]; onRestart: () => void }

export function QuizResults({ answers, onRestart }: Props) {
  const score = answers.filter((a) => a.isCorrect).length
  const rate = answers.length > 0 ? score / answers.length : 0
  const passed = rate >= PASSING_RATE
  const wrong = answers.filter((a) => !a.isCorrect)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-center">
          <p className="text-4xl font-bold">
            {score} / {answers.length}
          </p>
          <p className={cn('text-lg font-semibold', passed ? 'text-green-700' : 'text-red-700')}>
            {formatPercent(rate)} — {passed ? 'Pasado! Keep going 💪' : 'Below 60%, review natin ito.'}
          </p>
        </CardContent>
      </Card>

      {wrong.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mga namali ({wrong.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {wrong.map(({ question, selectedIndex }) => (
              <div key={question.id} className="space-y-1 border-b pb-3 last:border-0 last:pb-0">
                <p className="font-medium">{question.stem}</p>
                <p className="text-sm text-red-700">Sagot mo: {question.choices[selectedIndex]}</p>
                <p className="text-sm text-green-700">Tamang sagot: {question.choices[question.correct_index]}</p>
                {question.explanation && <p className="text-sm text-muted-foreground">{question.explanation}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button className="h-12 text-base" onClick={onRestart}>
          New quiz
        </Button>
        <Link to="/mistakes" className={cn(buttonVariants({ variant: 'outline' }), 'h-12 text-base')}>
          Go to Mistakes
        </Link>
      </div>
    </div>
  )
}
