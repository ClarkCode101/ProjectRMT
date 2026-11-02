import { ArrowLeft, Check, Info } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { NativeSelect } from '@/components/NativeSelect'
import { heroButtonClass } from '@/components/report'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CHOICE_COUNT, emptyDraft, validateDraft, type DraftErrors, type QuestionDraft } from '@/lib/questions'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { addQuestion, findSimilar, updateQuestion, useQuestionBank, useRefreshBank, type BankQuestion, type SimilarQuestion } from './api'

const LETTERS = ['A', 'B', 'C', 'D']
const DIFFICULTIES = [
  { value: 1, label: 'Easy' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Hard' },
] as const

const fieldClass =
  'w-full rounded-lg border border-input bg-card px-3 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-wrong'

// /questions/new            → add a new question (?topic=ID pre-selects the topic)
// /questions/:id/edit       → edit one (hers or a built-in)
export default function QuestionEditorPage() {
  const { id } = useParams()
  const bank = useQuestionBank()
  const subjects = useSubjects()
  const topics = useTopics()

  if (bank.isPending || subjects.isPending || topics.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (bank.isError || subjects.isError || topics.isError) {
    return <FullPageMessage>Couldn’t load the question. Check your internet connection, then refresh.</FullPageMessage>
  }

  const existing = id ? bank.data.find((q) => q.id === id) : undefined
  if (id && !existing) return <FullPageMessage>This question doesn’t exist anymore.</FullPageMessage>

  // key: start a fresh form when moving between questions.
  return <EditorForm key={id ?? 'new'} existing={existing} subjects={subjects.data} topics={topics.data} />
}

function draftFrom(q: BankQuestion): QuestionDraft {
  const choices = [...q.choices, ...Array(CHOICE_COUNT).fill('')].slice(0, CHOICE_COUNT)
  const difficulty = q.difficulty === 1 || q.difficulty === 3 ? q.difficulty : 2
  return { topicId: q.topic_id, stem: q.stem, choices, correctIndex: q.correct_index, explanation: q.explanation ?? '', difficulty }
}

function EditorForm({
  existing,
  subjects,
  topics,
}: {
  existing: BankQuestion | undefined
  subjects: { id: number; code: string; name: string }[]
  topics: { id: number; subject_id: number; name: string }[]
}) {
  const navigate = useNavigate()
  const refresh = useRefreshBank()
  const [searchParams] = useSearchParams()

  const [draft, setDraft] = useState<QuestionDraft>(() => {
    if (existing) return draftFrom(existing)
    const topicParam = Number(searchParams.get('topic'))
    return emptyDraft(topics.some((t) => t.id === topicParam) ? topicParam : null)
  })
  const [subjectId, setSubjectId] = useState<number | null>(() => topics.find((t) => t.id === draft.topicId)?.subject_id ?? null)
  // Errors only show after the first save attempt, so she isn't scolded while typing.
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [similar, setSimilar] = useState<SimilarQuestion[]>([])

  const errors: DraftErrors = showErrors ? validateDraft(draft) : {}
  const isBuiltin = existing !== undefined && existing.owner_id === null
  const topicsInSubject = topics.filter((t) => t.subject_id === subjectId)

  function update(changes: Partial<QuestionDraft>) {
    setDraft((d) => ({ ...d, ...changes }))
  }

  function setChoice(index: number, value: string) {
    setDraft((d) => ({ ...d, choices: d.choices.map((c, i) => (i === index ? value : c)) }))
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      if (existing) await updateQuestion(existing.id, draft)
      else await addQuestion(draft)
      refresh()
      navigate('/questions', { state: { saved: existing ? 'updated' : 'added' } })
    } catch {
      setSaveError('Couldn’t save. Check your internet connection and try again.')
      setSaving(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setShowErrors(true)
    if (Object.keys(validateDraft(draft)).length > 0) return

    // Duplicate check (PROJECT_PLAN.md §5) for new questions, or when the question text changed.
    if (!existing || existing.stem.trim() !== draft.stem.trim()) {
      setSaving(true)
      try {
        const matches = await findSimilar(draft.stem, existing?.id)
        if (matches.length > 0) {
          setSimilar(matches)
          setSaving(false)
          return
        }
      } catch {
        // The check is only a helper; if it fails, still let her save.
      }
    }
    await save()
  }

  const hasErrors = Object.keys(errors).length > 0

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link to="/questions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          Questions
        </Link>
        <h1 className="text-2xl leading-tight font-bold sm:text-3xl">{existing ? 'Edit question' : 'Add a question'}</h1>
        {isBuiltin && (
          <p className="flex items-start gap-2 rounded-md border border-highlight/50 bg-highlight-soft p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            This is a built-in question. Your changes replace the original.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="subject" label="Subject">
          <NativeSelect
            id="subject"
            value={subjectId ?? ''}
            onChange={(e) => {
              setSubjectId(e.target.value ? Number(e.target.value) : null)
              update({ topicId: null }) // topic list changes with the subject
            }}
            className="bg-card"
          >
            <option value="">Choose a subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}: {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="topic" label="Topic" error={errors.topic}>
          <NativeSelect
            id="topic"
            value={draft.topicId ?? ''}
            onChange={(e) => update({ topicId: e.target.value ? Number(e.target.value) : null })}
            disabled={subjectId === null}
            aria-invalid={Boolean(errors.topic)}
            aria-describedby={errors.topic ? 'topic-error' : undefined}
            className="bg-card aria-invalid:border-wrong"
          >
            <option value="">{subjectId === null ? 'Choose a subject first' : 'Choose a topic'}</option>
            {topicsInSubject.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field id="stem" label="Question" error={errors.stem}>
        <textarea
          id="stem"
          rows={3}
          value={draft.stem}
          onChange={(e) => update({ stem: e.target.value })}
          aria-invalid={Boolean(errors.stem)}
          aria-describedby={errors.stem ? 'stem-error' : undefined}
          className={cn(fieldClass, 'min-h-24 py-2.5 leading-relaxed')}
        />
      </Field>

      <fieldset className="space-y-2" aria-describedby={cn(errors.choices && 'choices-error', errors.correct && 'correct-error') || undefined}>
        <legend className="mb-2 flex flex-wrap items-baseline gap-x-2">
          <span className="font-bold">Choices</span>
          <span className="text-sm text-muted-foreground">Tap the letter of the correct answer.</span>
        </legend>
        {draft.choices.map((choice, i) => {
          const isCorrect = draft.correctIndex === i
          return (
            <div key={i} className="flex items-center gap-2">
              {/* The letter is the "correct answer" radio button. */}
              <label
                className={cn(
                  'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border font-heading text-lg font-bold has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                  isCorrect ? 'border-correct bg-correct text-white' : 'bg-card hover:border-correct',
                )}
              >
                <input type="radio" name="correct" checked={isCorrect} onChange={() => update({ correctIndex: i })} className="sr-only" />
                <span className="sr-only">Mark choice {LETTERS[i]} as the correct answer</span>
                {isCorrect ? <Check className="size-5" strokeWidth={3} aria-hidden /> : <span aria-hidden>{LETTERS[i]}</span>}
              </label>
              <Label htmlFor={`choice-${i}`} className="sr-only">
                Choice {LETTERS[i]}
              </Label>
              <input
                id={`choice-${i}`}
                value={choice}
                onChange={(e) => setChoice(i, e.target.value)}
                aria-invalid={Boolean(errors.choices) && choice.trim() === ''}
                className={cn(fieldClass, 'h-11', isCorrect && 'border-correct')}
              />
            </div>
          )
        })}
        {errors.choices && <ErrorText id="choices-error">{errors.choices}</ErrorText>}
        {errors.correct && <ErrorText id="correct-error">{errors.correct}</ErrorText>}
      </fieldset>

      <Field id="explanation" label="Explanation" hint="optional, shown after each answer">
        <textarea
          id="explanation"
          rows={3}
          value={draft.explanation}
          onChange={(e) => update({ explanation: e.target.value })}
          className={cn(fieldClass, 'min-h-24 py-2.5 leading-relaxed')}
        />
      </Field>

      <fieldset>
        <legend className="mb-2 font-bold">Difficulty</legend>
        <div className="grid grid-cols-3 gap-2 sm:w-80">
          {DIFFICULTIES.map((d) => (
            <label
              key={d.value}
              className={cn(
                'flex h-11 cursor-pointer items-center justify-center rounded-lg border bg-card text-sm font-semibold has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                draft.difficulty === d.value ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'hover:border-primary/50',
              )}
            >
              <input type="radio" name="difficulty" checked={draft.difficulty === d.value} onChange={() => update({ difficulty: d.value })} className="sr-only" />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>

      {hasErrors && (
        <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
          Some parts are missing. Check the messages above.
        </p>
      )}
      {saveError && (
        <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
          {saveError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        <Link to="/questions" className="inline-flex h-12 items-center justify-center rounded-lg px-5 font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
          Cancel
        </Link>
        <button type="submit" disabled={saving} className={cn(heroButtonClass, 'h-12 text-base')}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Add question'}
        </button>
      </div>

      <Dialog open={similar.length > 0} onClose={() => setSimilar([])} labelledBy="similar-heading">
        <div className="space-y-4">
          <div>
            <h2 id="similar-heading" className="text-xl font-bold">
              {similar.some((q) => q.exact) ? 'You already have this question' : 'This looks like a question you already have'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Check that it asks something different before you save it.</p>
          </div>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {similar.map((q) => (
              <li key={q.id} className="rounded-md bg-background px-3 py-2 text-sm">
                <span className="block text-xs font-semibold text-muted-foreground">{q.exact ? 'Same text' : `${Math.round(q.score * 100)}% similar`}</span>
                {q.stem}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg" onClick={() => setSimilar([])}>
              Go back and edit
            </Button>
            <Button
              type="button"
              className="h-11 flex-1 rounded-lg"
              onClick={() => {
                setSimilar([])
                void save()
              }}
            >
              Save anyway
            </Button>
          </div>
        </div>
      </Dialog>
    </form>
  )
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-bold">{label}</span>
        {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
      {error && <ErrorText id={`${id}-error`}>{error}</ErrorText>}
    </div>
  )
}

function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-sm font-semibold text-wrong">
      {children}
    </p>
  )
}
