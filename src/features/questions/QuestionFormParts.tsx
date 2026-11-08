import { Check, Circle, CircleCheck } from 'lucide-react'
import { useState, type MouseEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Pieces shared by the Add a question form and the Upload review, so both work the same way.

/** A subject or topic choice (a real radio button, styled as a pill). Selected = solid blue with a check, like the topic chips on Practice. */
function ChipRadio({
  name,
  checked,
  onChange,
  onClick,
  title,
  children,
}: {
  name: string
  checked: boolean
  onChange: () => void
  onClick?: (event: MouseEvent<HTMLInputElement>) => void
  title?: string
  children: ReactNode
}) {
  return (
    <label
      title={title}
      className={cn(
        'relative inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
        checked ? 'border-primary bg-primary text-white' : 'bg-card hover:border-primary/50',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} onClick={onClick} className="sr-only" />
      {checked && <Check className="-ml-0.5 size-4" aria-hidden />}
      {children}
    </label>
  )
}

/**
 * Subject chips, then that subject's topic chips.
 * Once a topic is tapped they fold into one line, so what comes next is what she sees first.
 */
export function TopicPicker({
  subjects,
  topics,
  subjectId,
  topicId,
  onSubjectChange,
  onTopicChange,
  error,
}: {
  subjects: { id: number; code: string; name: string }[]
  topics: { id: number; subject_id: number; name: string }[]
  subjectId: number | null
  topicId: number | null
  /** the caller clears the topic, since the list changes with the subject */
  onSubjectChange: (subjectId: number) => void
  onTopicChange: (topicId: number) => void
  error?: string
}) {
  const [changing, setChanging] = useState(topicId === null)
  const topicsInSubject = topics.filter((t) => t.subject_id === subjectId)
  const chosenTopic = topicsInSubject.find((t) => t.id === topicId)
  const chosenSubject = subjects.find((s) => s.id === subjectId)

  /** A tap on a topic folds the chips. Not the arrow keys (detail 0): those walk through the topics one by one. */
  function foldAfterTap(event: MouseEvent<HTMLInputElement>) {
    if (event.detail > 0) setChanging(false)
  }

  function openPicker() {
    setChanging(true)
    // The Change button is about to disappear, so keep the keyboard's place on the chosen topic.
    requestAnimationFrame(() => document.querySelector<HTMLElement>('input[name="topic"]:checked')?.focus())
  }

  if (!changing && chosenTopic) {
    return (
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-card py-1 pr-1 pl-3.5">
        <p className="min-w-0">
          <span className="font-heading font-bold">{chosenSubject?.code}</span>
          <span aria-hidden className="text-muted-foreground"> · </span>
          <span className="sr-only">, topic: </span>
          {chosenTopic.name}
        </p>
        <button
          type="button"
          onClick={openPicker}
          aria-label="Change the subject or topic"
          className="h-10 shrink-0 rounded-md bg-primary/[0.08] px-3.5 text-sm font-bold text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 font-bold">Subject</legend>
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <ChipRadio key={s.id} name="subject" title={s.name} checked={subjectId === s.id} onChange={() => onSubjectChange(s.id)}>
              {s.code}
              <span className="sr-only">{s.name}</span>
            </ChipRadio>
          ))}
        </div>
      </fieldset>

      <fieldset aria-describedby={error ? 'topic-error' : undefined}>
        <legend className="mb-2 font-bold">Topic</legend>
        {subjectId === null ? (
          <p className="text-sm text-muted-foreground">Choose a subject first.</p>
        ) : (
          // key: another subject's topics appear with the same small fade as on Practice.
          <div key={subjectId} className="flex animate-in flex-wrap gap-2 fade-in duration-300">
            {topicsInSubject.map((t) => (
              <ChipRadio key={t.id} name="topic" checked={topicId === t.id} onChange={() => onTopicChange(t.id)} onClick={foldAfterTap}>
                {t.name}
              </ChipRadio>
            ))}
          </div>
        )}
        {error && (
          <p id="topic-error" className="mt-2 text-sm font-semibold text-wrong">
            {error}
          </p>
        )}
      </fieldset>
    </div>
  )
}

/**
 * Marks a choice as the correct answer. Only the chosen one says "Correct", so it can't look like they all are.
 * The same width on every row, so the boxes don't jump when she picks. Phones (and `compact`): icon only.
 */
export function CorrectToggle({ name, letter, checked, onChange, compact = false }: { name: string; letter: string; checked: boolean; onChange: () => void; compact?: boolean }) {
  return (
    <label
      className={cn(
        'relative flex size-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
        !compact && 'sm:w-26',
        checked ? 'border-correct bg-correct text-white' : 'border-input bg-card text-muted-foreground hover:border-correct hover:text-correct',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span className="sr-only">Choice {letter} is the correct answer</span>
      {checked ? <CircleCheck className="size-5 shrink-0" aria-hidden /> : <Circle className="size-5 shrink-0" aria-hidden />}
      {checked && !compact && (
        <span aria-hidden className="max-sm:hidden">
          Correct
        </span>
      )}
    </label>
  )
}
