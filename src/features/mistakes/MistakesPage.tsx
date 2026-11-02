import { Link } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { useMistakes } from './api'

export default function MistakesPage() {
  const mistakes = useMistakes()
  const subjects = useSubjects()
  const topics = useTopics()

  if (mistakes.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (mistakes.isError) return <FullPageMessage>Hindi ma-load ang mistakes. Check your internet.</FullPageMessage>

  const topicById = new Map((topics.data ?? []).map((t) => [t.id, t]))
  const subjectById = new Map((subjects.data ?? []).map((s) => [s.id, s]))
  const label = (topicId: number) => {
    const topic = topicById.get(topicId)
    const subject = topic && subjectById.get(topic.subject_id)
    return topic ? `${subject?.code ?? ''} · ${topic.name}` : ''
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Review Again</h1>
          <p className="text-sm text-muted-foreground">
            Mga tanong na mali ang huling sagot mo. Mawawala sila dito kapag nasagot mo nang tama.
          </p>
        </div>
      </div>

      {mistakes.data.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            Wala pang mistakes. Mag-practice muna! 📚
          </CardContent>
        </Card>
      ) : (
        <>
          <Link
            to="/practice?from=mistakes"
            className={cn(buttonVariants(), 'h-12 w-full text-base')}
          >
            Practice these {mistakes.data.length} questions
          </Link>

          {mistakes.data.map((m) => (
            <Card key={m.questionId}>
              <CardContent className="space-y-2">
                <Badge variant="secondary">{label(m.topicId)}</Badge>
                <p className="font-medium">{m.stem}</p>
                {m.selectedIndex !== null && (
                  <p className="text-sm text-red-700">Sagot mo: {m.choices[m.selectedIndex]}</p>
                )}
                <p className="text-sm text-green-700">Tamang sagot: {m.choices[m.correctIndex]}</p>
                {m.explanation && <p className="text-sm text-muted-foreground">{m.explanation}</p>}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}
