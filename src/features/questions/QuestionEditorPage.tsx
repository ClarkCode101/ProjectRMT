import { ArrowLeft, CircleCheck, Info } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { backLinkClass, headerSecondaryClass } from '@/components/dashboard'
import { useFocusMode } from '@/components/layoutContext'
import { heroButtonClass } from '@/components/report'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CHOICE_COUNT, CHOICE_LETTERS, emptyDraft, readPastedQuestion, stillNeeded, validateDraft, type DraftErrors, type QuestionDraft } from '@/lib/questions'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { addQuestion, findSimilar, updateQuestion, useQuestionBank, useRefreshBank, type BankQuestion, type SimilarQuestion } from './api'
import { CorrectToggle, TopicPicker } from './QuestionFormParts'

// scroll-mb: when the keyboard moves to a box, it stops above the bar stuck to the bottom instead of behind it.
const fieldClass =
  'w-full scroll-mb-36 rounded-lg border border-input bg-card px-3 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-wrong'

/** What the note under the Question box says after a paste. */
type PasteNote = { kind: 'filled'; before: QuestionDraft; raw: string } | { kind: 'many'; count: number }

// /questions/new            → add a new question (?topic=ID pre-selects the topic)
// /questions/:id/edit       → edit one (hers or a built-in)
export default function QuestionEditorPage() {
  const { id } = useParams()
  const bank = useQuestionBank()
  const subjects = useSubjects()
  const topics = useTopics()
  // No nav here: it gives the bottom bar room, and the form has one clear way out (← Questions).
  useFocusMode(true)

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

/** After a failed save, jump to the first thing that needs fixing, so she doesn't have to hunt for it. */
function focusFirstProblem(draft: QuestionDraft, errors: DraftErrors, subjectChosen: boolean) {
  let selector: string | null = null
  if (errors.topic) selector = subjectChosen ? 'input[name="topic"]' : 'input[name="subject"]'
  else if (errors.stem) selector = '#stem'
  else if (errors.choices) selector = `#choice-${Math.max(0, draft.choices.findIndex((c) => c.trim() === ''))}`
  else if (errors.correct) selector = 'input[name="correct"]'
  if (selector) document.querySelector<HTMLElement>(selector)?.focus()
}

/** Has she written something that would be lost? On a new question, just picking a topic doesn't count. */
function hasUnsavedWork(draft: QuestionDraft, saved: QuestionDraft, isNew: boolean) {
  const comparable = (d: QuestionDraft) => JSON.stringify({ ...d, topicId: isNew ? null : d.topicId })
  return comparable(draft) !== comparable(saved)
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
  // The form as it was last opened or saved, to tell whether there's unsaved work.
  const [savedDraft, setSavedDraft] = useState(draft)
  const [subjectId, setSubjectId] = useState<number | null>(() => topics.find((t) => t.id === draft.topicId)?.subject_id ?? null)
  // Errors only show after the first save attempt, so she isn't scolded while typing.
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [similar, setSimilar] = useState<SimilarQuestion[]>([])
  const [pasteNote, setPasteNote] = useState<PasteNote | null>(null)
  // How many she has added with "Save & next" on this visit.
  const [addedCount, setAddedCount] = useState(0)
  // Which button she pressed, remembered in case the "looks similar" dialog comes up first.
  const [addingAnother, setAddingAnother] = useState(false)
  const stemRef = useRef<HTMLTextAreaElement>(null)

  const errors: DraftErrors = showErrors ? validateDraft(draft) : {}
  const needed = stillNeeded(draft)
  const isBuiltin = existing !== undefined && existing.owner_id === null

  // ---------- Leaving with unsaved work asks first: ← Questions, the phone's Back button, or closing the tab ----------
  const unsaved = hasUnsavedWork(draft, savedDraft, !existing)
  // Set just before going back after a save, so that doesn't ask.
  const justSaved = useRef(false)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => unsaved && !justSaved.current && !nextLocation.state?.pastedText && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  function update(changes: Partial<QuestionDraft>) {
    setDraft((d) => ({ ...d, ...changes }))
  }

  function setChoice(index: number, value: string) {
    setDraft((d) => ({ ...d, choices: d.choices.map((c, i) => (i === index ? value : c)) }))
  }

  /**
   * Pasting a whole question into an empty form fills in the rest. Anything else pastes as normal text,
   * and it never overwrites what she already typed. Only for new questions.
   */
  function handleStemPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (existing || draft.stem.trim() !== '' || draft.choices.some((c) => c.trim() !== '')) return
    const raw = event.clipboardData.getData('text')
    const pasted = readPastedQuestion(raw)
    if (pasted.kind === 'plain') return
    event.preventDefault()
    if (pasted.kind === 'many') {
      update({ stem: raw })
      setPasteNote({ kind: 'many', count: pasted.count })
      return
    }
    update({ stem: pasted.stem, choices: pasted.choices, correctIndex: pasted.correctIndex, explanation: pasted.explanation || draft.explanation })
    setPasteNote({ kind: 'filled', before: draft, raw })
  }

  function undoPaste() {
    if (pasteNote?.kind !== 'filled') return
    setDraft({ ...pasteNote.before, stem: pasteNote.raw })
    setPasteNote(null)
    stemRef.current?.focus()
  }

  /** Enter in a choice moves to the next box instead of saving by accident. */
  function handleChoiceKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    document.getElementById(index < CHOICE_COUNT - 1 ? `choice-${index + 1}` : 'explanation')?.focus()
  }

  async function save(thenAddAnother: boolean) {
    setSaving(true)
    setSaveError(null)
    try {
      if (existing) await updateQuestion(existing.id, draft)
      else await addQuestion(draft)
      refresh()
      if (thenAddAnother) {
        // Keep the subject and topic (she's usually adding several to the same one); clear the rest.
        const next = emptyDraft(draft.topicId)
        setDraft(next)
        setSavedDraft(next)
        setShowErrors(false)
        setPasteNote(null)
        setAddedCount((n) => n + 1)
        setSaving(false)
        window.scrollTo({ top: 0 })
        stemRef.current?.focus({ preventScroll: true })
        return
      }
      // Back to the drawer and folder this question is filed in, so she can see it there.
      // Replace: the Back button shouldn't reopen the form she just saved.
      justSaved.current = true
      navigate(`/questions?topic=${draft.topicId}`, { replace: true, state: { saved: existing ? 'updated' : 'added' } })
    } catch {
      setSaveError('Couldn’t save. Check your internet connection and try again.')
      setSaving(false)
    }
  }

  async function attemptSave(thenAddAnother: boolean) {
    setAddingAnother(thenAddAnother)
    setShowErrors(true)
    const problems = validateDraft(draft)
    if (Object.keys(problems).length > 0) {
      focusFirstProblem(draft, problems, subjectId !== null)
      return
    }

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
    await save(thenAddAnother)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void attemptSave(false)
  }

  // Leaving goes back to the drawer she came from, not all the way to the cabinet.
  const leaveTo = draft.topicId ? `/questions?topic=${draft.topicId}` : '/questions'

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link to={leaveTo} className={backLinkClass}>
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
        {addedCount > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-md bg-correct-soft px-3 py-2 font-semibold text-correct">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            {addedCount === 1 ? 'Question added.' : `${addedCount} questions added.`} Write the next one.
          </p>
        )}
      </div>

      <TopicPicker
        subjects={subjects}
        topics={topics}
        subjectId={subjectId}
        topicId={draft.topicId}
        error={errors.topic}
        onSubjectChange={(id) => {
          setSubjectId(id)
          update({ topicId: null }) // topic list changes with the subject
        }}
        onTopicChange={(id) => update({ topicId: id })}
      />

      <Field id="stem" label="Question" error={errors.stem}>
        <textarea
          id="stem"
          ref={stemRef}
          rows={3}
          value={draft.stem}
          placeholder={existing ? undefined : 'Type it, or paste it with its choices and answer to fill in the rest.'}
          onChange={(e) => {
            update({ stem: e.target.value })
            setPasteNote(null)
          }}
          onPaste={handleStemPaste}
          aria-invalid={Boolean(errors.stem)}
          aria-describedby={errors.stem ? 'stem-error' : undefined}
          className={cn(fieldClass, 'field-sizing-content min-h-24 py-2.5 leading-relaxed')}
        />
        {pasteNote?.kind === 'filled' && (
          <p role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-correct-soft px-3 py-2 text-sm font-semibold text-correct">
            Filled in from what you pasted. Check it before saving.
            <button type="button" onClick={undoPaste} className="rounded-sm underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
              Undo
            </button>
          </p>
        )}
        {pasteNote?.kind === 'many' && (
          <p role="status" className="rounded-md bg-highlight-soft px-3 py-2 text-sm font-semibold">
            This looks like {pasteNote.count} questions. To add several at once, use{' '}
            <Link to="/questions/upload" state={{ pastedText: draft.stem }} className="rounded-sm text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
              Upload
            </Link>
            .
          </p>
        )}
      </Field>

      <fieldset className="space-y-2" aria-describedby={cn(errors.choices && 'choices-error', errors.correct && 'correct-error') || undefined}>
        <legend className="mb-2 flex flex-wrap items-baseline gap-x-2">
          <span className="font-bold">Choices</span>
          <span className="text-sm text-muted-foreground">Tap ○ to mark the correct one</span>
        </legend>
        {draft.choices.map((choice, i) => {
          const isCorrect = draft.correctIndex === i
          return (
            <div key={i} className="flex items-center gap-2">
              <span aria-hidden className={cn('w-5 shrink-0 text-center font-heading text-lg font-bold', isCorrect && 'text-correct')}>
                {CHOICE_LETTERS[i]}
              </span>
              <Label htmlFor={`choice-${i}`} className="sr-only">
                Choice {CHOICE_LETTERS[i]}
              </Label>
              <input
                id={`choice-${i}`}
                value={choice}
                onChange={(e) => setChoice(i, e.target.value)}
                onKeyDown={(e) => handleChoiceKeyDown(e, i)}
                aria-invalid={Boolean(errors.choices) && choice.trim() === ''}
                className={cn(fieldClass, 'h-11 min-w-0 flex-1', isCorrect && 'border-correct')}
              />
              <CorrectToggle name="correct" letter={CHOICE_LETTERS[i]} checked={isCorrect} onChange={() => update({ correctIndex: i })} />
            </div>
          )
        })}
        {errors.choices && <ErrorText id="choices-error">{errors.choices}</ErrorText>}
        {errors.correct && <ErrorText id="correct-error">{errors.correct}</ErrorText>}
      </fieldset>

      <Field id="explanation" label="Explanation" hint="optional, shown after each answer">
        <textarea
          id="explanation"
          rows={2}
          value={draft.explanation}
          onChange={(e) => update({ explanation: e.target.value })}
          className={cn(fieldClass, 'field-sizing-content min-h-16 py-2.5 leading-relaxed')}
        />
      </Field>

      {saveError && (
        <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
          {saveError}
        </p>
      )}

      {/* ---------- Stays on screen while she fills in the form, so what's left and Add are always in view. ---------- */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t bg-background/95 px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:mx-0 md:flex-row md:items-center md:justify-between md:gap-4 md:px-0">
        <p role="status" className={cn('flex min-w-0 items-start gap-1.5 text-sm', needed.length === 0 ? 'font-semibold text-correct' : 'text-muted-foreground')}>
          {needed.length === 0 ? (
            <>
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Ready to save.
            </>
          ) : (
            <span>
              <span className="font-semibold text-foreground">Still needed:</span> {needed.join(', ')}
            </span>
          )}
        </p>
        <div className={cn('grid shrink-0 gap-2', !existing && 'grid-cols-2')}>
          {!existing && (
            <button type="button" disabled={saving} onClick={() => void attemptSave(true)} className={cn(headerSecondaryClass, 'h-12 whitespace-nowrap disabled:opacity-60 sm:h-12')}>
              {saving && addingAnother ? 'Saving…' : 'Save & next'}
            </button>
          )}
          <button type="submit" disabled={saving} className={cn(heroButtonClass, 'h-12 px-5 text-base whitespace-nowrap focus-visible:ring-ring/50 sm:w-full')}>
            {saving && !addingAnother ? 'Saving…' : existing ? 'Save changes' : 'Save & finish'}
          </button>
        </div>
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
                void save(addingAnother)
              }}
            >
              Save anyway
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={blocker.state === 'blocked'}
        onClose={() => {
          if (blocker.state === 'blocked') blocker.reset()
        }}
        labelledBy="discard-heading"
      >
        <div className="space-y-4">
          <div>
            <h2 id="discard-heading" className="text-xl font-bold">
              {existing ? 'Discard your changes?' : 'Discard this question?'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">What you typed here hasn’t been saved.</p>
          </div>
          {/* "Keep" comes first so it gets the focus when the dialog opens. */}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button type="button" className="h-11 flex-1 rounded-lg bg-wrong text-white hover:bg-wrong/90" onClick={() => blocker.proceed?.()}>
              Discard
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
        <span className="text-base font-bold">{label}</span>
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
