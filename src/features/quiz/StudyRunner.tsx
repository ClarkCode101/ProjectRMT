import { BookOpen } from 'lucide-react'
import { useState } from 'react'
import { ChoiceList } from '@/components/ChoiceList'
import { ExitButton } from '@/components/ExitButton'
import { SampleRun, type SampleState } from '@/components/report'
import { Button } from '@/components/ui/button'
import { shuffledChoiceOrder } from '@/lib/quiz'
import { useSubjectOfTopic } from '@/lib/referenceData'
import type { QuizQuestion } from './api'

/**
 * Step 1 of a "Learn" task in Today's plan: study before being tested (a worked example comes before practice).
 * Each question shows its answer right away (marked, in a shuffled spot), with the note on every choice and the explanation.
 * Nothing is chosen or scored, and nothing is saved as an answer, so reading doesn't change her scores.
 * Step 2 (the test on the same questions) is a normal quiz, started by PracticePage.
 */
export function StudyRunner({ questions, onDone, onExit }: { questions: QuizQuestion[]; onDone: () => void; onExit: () => void }) {
  const [current, setCurrent] = useState(0)
  const subjectOf = useSubjectOfTopic()
  // Choices in a shuffled order (once per question, like a quiz), so the answer isn't always on top:
  // she learns the answer itself, not "it's the first one". The answer is still marked wherever it lands.
  const [orders] = useState(() => questions.map((q) => shuffledChoiceOrder(q.choices.length)))
  const question = questions[current]
  const isLast = current === questions.length - 1
  const subject = subjectOf(question.topic_id)
  const order = orders[current]
  const samples = questions.map((_, i): SampleState => (i < current ? 'correct' : i === current ? 'current' : 'pending'))

  function next() {
    if (isLast) return onDone()
    setCurrent((c) => c + 1)
    window.scrollTo({ top: 0 })
  }

  return (
    // Same single column as a quiz, so studying and testing feel like one flow.
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm tabular-nums">
          {/* Nothing is lost by leaving (nothing was answered), so no "Leave?" question. */}
          <ExitButton onClick={onExit} />
          <p className="font-heading font-semibold text-muted-foreground">
            <span className="text-foreground">{current + 1}</span> of {questions.length}
          </p>
          <span className="flex min-w-16 justify-end">
            <span className="flex items-center gap-1 rounded-full border-2 border-ink bg-highlight-soft px-2.5 py-0.5 font-heading text-xs font-bold">
              <BookOpen className="size-3.5" aria-hidden />
              Study
            </span>
          </span>
        </div>
        <SampleRun samples={samples} />
      </div>

      <article key={current} className="animate-in fade-in space-y-2 duration-200">
        <p className="text-sm text-muted-foreground">
          <span className="mr-1 rounded-md border-2 border-ink bg-card px-1.5 font-heading text-xs font-bold text-foreground">{subject.code ?? '—'}</span>
          {subject.topicName && <> {subject.topicName}</>}
        </p>
        <p className="text-xl leading-snug font-bold sm:text-2xl">{question.stem}</p>
      </article>

      {/* The answer is already "picked", so every note shows; tapping does nothing. */}
      <ChoiceList
        choices={question.choices}
        correctIndex={question.correct_index}
        choiceNotes={question.choice_notes}
        order={order}
        selectedIndex={question.correct_index}
        onChoose={() => {}}
        keyPrefix={current}
        answerLabel="Answer"
      />

      {question.explanation && (
        <div className="rounded-2xl border-2 border-dashed border-primary bg-primary/5 px-4 py-3">
          <p className="text-xs font-bold tracking-wide text-primary uppercase">Why</p>
          <p className="mt-1 leading-relaxed">{question.explanation}</p>
        </div>
      )}

      <Button className="h-13 w-full rounded-2xl border-[2.5px] font-heading text-lg font-semibold shadow-toon" onClick={next} autoFocus>
        {isLast ? 'Done studying' : 'Got it · Next'}
      </Button>
    </div>
  )
}
