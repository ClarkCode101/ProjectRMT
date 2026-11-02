import { Link } from 'react-router'
import { SubjectTag, TubeRack } from '@/components/specimen'
import { Button, buttonVariants } from '@/components/ui/button'
import { formatPercent, PASSING_RATE } from '@/lib/quiz'
import { useSubjectOfTopic } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import type { AnswerResult } from './QuizRunner'

type Props = { answers: AnswerResult[]; onRestart: () => void }

export function QuizResults({ answers, onRestart }: Props) {
  const subjectOf = useSubjectOfTopic()
  const score = answers.filter((a) => a.isCorrect).length
  const rate = answers.length > 0 ? score / answers.length : 0
  const passed = rate >= PASSING_RATE
  const wrong = answers.filter((a) => !a.isCorrect)

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <TubeRack
          size="lg"
          tubes={answers.map((a) => ({
            state: a.isCorrect ? 'correct' : 'wrong',
            subjectCode: subjectOf(a.question.topic_id).code,
          }))}
        />
        <div>
          <p className="text-3xl font-extrabold tabular-nums">
            {score} of {answers.length} correct
          </p>
          <p className={cn('mt-1 text-lg font-bold', passed ? 'text-correct' : 'text-wrong')}>
            {formatPercent(rate)}, {passed ? 'pasado sa 60% na passing.' : 'kulang pa sa 60% na passing.'}
          </p>
        </div>
      </section>

      {wrong.length > 0 && (
        <section aria-labelledby="missed-heading" className="space-y-3">
          <h2 id="missed-heading" className="text-lg font-bold">
            Mga namali ({wrong.length})
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {wrong.map(({ question, selectedIndex }) => (
              <li key={question.id} className="space-y-2 p-4">
                <SubjectTag code={subjectOf(question.topic_id).code} />
                <p className="font-bold">{question.stem}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Sagot mo</dt>
                  <dd className="text-wrong line-through decoration-1">{question.choices[selectedIndex]}</dd>
                  <dt className="text-muted-foreground">Tama</dt>
                  <dd className="font-bold text-correct">{question.choices[question.correct_index]}</dd>
                </dl>
                {question.explanation && <p className="text-sm leading-relaxed text-muted-foreground">{question.explanation}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button className="h-12 rounded-lg text-base font-bold" onClick={onRestart}>
          New practice
        </Button>
        <Link to="/mistakes" className={cn(buttonVariants({ variant: 'outline' }), 'h-12 rounded-lg text-base')}>
          Open Review Again
        </Link>
      </div>
    </div>
  )
}
