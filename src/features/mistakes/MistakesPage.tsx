import { Link } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { SubjectTag } from '@/components/specimen'
import { buttonVariants } from '@/components/ui/button'
import { useSubjectOfTopic } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { useMistakes } from './api'

export default function MistakesPage() {
  const mistakes = useMistakes()
  const subjectOf = useSubjectOfTopic()

  if (mistakes.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (mistakes.isError) return <FullPageMessage>Hindi ma-load ang listahan. Check your internet, then refresh.</FullPageMessage>

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold">Review Again</h1>
        <p className="text-muted-foreground">
          Mga tanong na mali ang huling sagot mo. Aalis sila dito kapag nasagot mo nang tama.
        </p>
      </div>

      {mistakes.data.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-input p-6">
          <p>Wala pang laman. Dito mapupunta ang mga mamamali mo sa practice.</p>
          <Link to="/practice" className={cn(buttonVariants(), 'h-11 rounded-lg px-4 font-bold')}>
            Start practice
          </Link>
        </div>
      ) : (
        <>
          <Link to="/practice?from=mistakes" className={cn(buttonVariants(), 'h-12 w-full rounded-lg text-base font-bold')}>
            Practice these {mistakes.data.length} items
          </Link>

          <ul className="divide-y rounded-xl border bg-card">
            {mistakes.data.map((m) => {
              const subject = subjectOf(m.topicId)
              return (
                <li key={m.questionId} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-x-3">
                    <SubjectTag code={subject.code} />
                    {subject.topicName && <span className="text-sm text-muted-foreground">{subject.topicName}</span>}
                  </div>
                  <p className="font-bold">{m.stem}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    {m.selectedIndex !== null && (
                      <>
                        <dt className="text-muted-foreground">Sagot mo</dt>
                        <dd className="text-wrong line-through decoration-1">{m.choices[m.selectedIndex]}</dd>
                      </>
                    )}
                    <dt className="text-muted-foreground">Tama</dt>
                    <dd className="font-bold text-correct">{m.choices[m.correctIndex]}</dd>
                  </dl>
                  {m.explanation && <p className="text-sm leading-relaxed text-muted-foreground">{m.explanation}</p>}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
