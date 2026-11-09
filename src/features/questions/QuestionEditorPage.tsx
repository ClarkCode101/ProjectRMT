import { ArrowLeft, CircleCheck, Info, Plus } from 'lucide-react'
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
import { useBookTopicId, useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { addQuestion, findSimilar, updateQuestion, useQuestionBank, useRefreshBank, type BankQuestion, type SimilarQuestion } from './api'
import { BOOK_SPINE, CHAPTER_MAX, chapterList, cleanChapter, GENERAL_TOPIC } from '@/lib/books'
import { addToBook, useBooks, useRefreshBooks, type Book } from './booksApi'
import { ChipRadio, CorrectToggle, SubjectChips, TopicPicker } from './QuestionFormParts'

// scroll-mb: when the keyboard moves to a box, it stops above the bar stuck to the bottom instead of behind it.
const fieldClass =
  'w-full scroll-mb-36 rounded-lg border border-input bg-card px-3 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-wrong'

/** What the note under the Question box says after a paste. */
type PasteNote = { kind: 'filled'; before: QuestionDraft; raw: string } | { kind: 'many'; count: number }

// /questions/new                → add a new question, choosing its subject and topic
// /questions/new?subject=ID     → from inside a subject's book: the subject is already set, only the topic is asked
// /questions/new?topic=ID       → the same, with the topic set too
// /questions/new?book=ID        → from inside one of her books: chapter first, a (remembered) subject, topic optional
// /questions/:id/edit           → edit one (hers or a built-in)
export default function QuestionEditorPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const bank = useQuestionBank()
  const subjects = useSubjects()
  const topics = useTopics()
  const bookParam = id ? null : searchParams.get('book')
  const books = useBooks({ enabled: bookParam !== null })
  // No nav here: it gives the bottom bar room, and the form has one clear way out (← Questions).
  useFocusMode(true)

  // Her book has to be loaded before the form starts, since it decides how the form is laid out.
  if (bank.isPending || subjects.isPending || topics.isPending || (bookParam !== null && books.isPending)) return <FullPageMessage>Loading…</FullPageMessage>
  if (bank.isError || subjects.isError || topics.isError) {
    return <FullPageMessage>Couldn’t load the question. Check your internet connection, then refresh.</FullPageMessage>
  }

  const existing = id ? bank.data.find((q) => q.id === id) : undefined
  if (id && !existing) return <FullPageMessage>This question doesn’t exist anymore.</FullPageMessage>

  const book = bookParam === null ? undefined : books.data?.find((b) => b.id === bookParam)

  // key: start a fresh form when moving between questions.
  return <EditorForm key={id ?? 'new'} existing={existing} book={book} subjects={subjects.data} topics={topics.data} />
}

// ---------- The subject she last used in each of her books, so it's already set next time (kept on this device) ----------
const BOOK_SUBJECT_KEY = 'projectrmt:book-subject'

function rememberedSubject(bookId: string): number | null {
  try {
    const saved = JSON.parse(localStorage.getItem(BOOK_SUBJECT_KEY) ?? '{}') as Record<string, unknown>
    const id = Number(saved[bookId])
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

function rememberSubject(bookId: string, subjectId: number) {
  try {
    const saved = JSON.parse(localStorage.getItem(BOOK_SUBJECT_KEY) ?? '{}') as Record<string, unknown>
    localStorage.setItem(BOOK_SUBJECT_KEY, JSON.stringify({ ...saved, [bookId]: subjectId }))
  } catch {
    // storage blocked: it just won't be remembered
  }
}

function draftFrom(q: BankQuestion): QuestionDraft {
  const choices = [...q.choices, ...Array(CHOICE_COUNT).fill('')].slice(0, CHOICE_COUNT)
  const choiceNotes = [...(q.choice_notes ?? []), ...Array(CHOICE_COUNT).fill('')].slice(0, CHOICE_COUNT)
  const difficulty = q.difficulty === 1 || q.difficulty === 3 ? q.difficulty : 2
  return { topicId: q.topic_id, stem: q.stem, choices, correctIndex: q.correct_index, explanation: q.explanation ?? '', choiceNotes, difficulty }
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

/** Her book's page on Questions, opened at a chapter if there is one. */
function bookAddress(bookId: string, chapter: string | null) {
  return `/questions?${new URLSearchParams(chapter ? { book: bookId, chapter } : { book: bookId })}`
}

/** Has she written something that would be lost? On a new question, just picking a topic doesn't count. */
function hasUnsavedWork(draft: QuestionDraft, saved: QuestionDraft, isNew: boolean) {
  const comparable = (d: QuestionDraft) => JSON.stringify({ ...d, topicId: isNew ? null : d.topicId })
  return comparable(draft) !== comparable(saved)
}

function EditorForm({
  existing,
  book,
  subjects,
  topics,
}: {
  existing: BankQuestion | undefined
  /** opened from inside one of her books (?book=ID): a new question goes into that book too */
  book: Book | undefined
  subjects: { id: number; code: string; name: string }[]
  topics: { id: number; subject_id: number; name: string }[]
}) {
  const navigate = useNavigate()
  const refreshBank = useRefreshBank()
  const refreshBooks = useRefreshBooks()
  const [searchParams] = useSearchParams()
  const generalOf = (subject: number | null) => topics.find((t) => t.subject_id === subject && t.name === GENERAL_TOPIC)?.id ?? null
  // Written in her own book: no board subject to pick, it goes under the hidden "Your books" topic (migration 0007).
  // (Until 0007 is run there's no such topic: then she still picks a subject, as before.)
  const bookTopicId = useBookTopicId()

  // Where she came from decides what the form asks (see the routes above).
  const topicParam = topics.find((t) => t.id === Number(searchParams.get('topic')))
  const subjectParam = subjects.find((s) => s.id === Number(searchParams.get('subject')))?.id
  const fromSubject = existing || book ? null : (topicParam?.subject_id ?? subjectParam ?? null)

  const [draft, setDraft] = useState<QuestionDraft>(() => {
    if (existing) return draftFrom(existing)
    // her book: the hidden "Your books" topic (or, before migration 0007, the subject she used last time in it)
    if (book) return emptyDraft(bookTopicId ?? generalOf(rememberedSubject(book.id)))
    return emptyDraft(topicParam?.id ?? null)
  })
  // The form as it was last opened or saved, to tell whether there's unsaved work.
  const [savedDraft, setSavedDraft] = useState(draft)
  const [subjectId, setSubjectId] = useState<number | null>(
    () => topics.find((t) => t.id === draft.topicId)?.subject_id ?? fromSubject ?? (book ? rememberedSubject(book.id) : null),
  )
  // From a subject's book the subject is set; "Change" unlocks the full subject + topic picker.
  const [subjectLocked, setSubjectLocked] = useState(fromSubject !== null)
  // Her book: the topic stays "General" unless she asks to pick one.
  const [pickingTopic, setPickingTopic] = useState(false)
  // In its subject's book (counted in its score and quizzes)? Written in her own book: no, it lives only there.
  const inSubject = existing ? existing.in_subject : !book
  // Lives only in her books: no subject or topic to ask about (written in her book, or editing one that was).
  const bookOnly = existing ? !existing.in_subject : book !== undefined && bookTopicId !== null
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
  // Her book's chapter for this question (writing in a book only). Opened from a chapter (?chapter=…) = that one.
  const [chapter, setChapter] = useState(() => searchParams.get('chapter') ?? '')
  const [chapterError, setChapterError] = useState<string | null>(null)
  const cleaned = cleanChapter(chapter)
  const cleanedChapter = 'error' in cleaned ? null : cleaned.chapter
  const existingChapters = book ? chapterList(book.chapters).chapters : []
  // Typing a new chapter name (instead of tapping one she already has). With no chapters yet, it's the only way.
  const [typingChapter, setTypingChapter] = useState(() => chapter !== '' && !existingChapters.some((c) => c.name === chapter))

  /** Her book: picking the subject also sets its "General" topic, and remembers the subject for next time. */
  function chooseBookSubject(id: number) {
    setSubjectId(id)
    setPickingTopic(false)
    update({ topicId: generalOf(id) })
    if (book) rememberSubject(book.id, id)
  }

  const errors: DraftErrors = showErrors ? validateDraft(draft) : {}
  // In her book the topic takes care of itself once a subject is chosen, so ask for the subject instead.
  const needed = stillNeeded(draft).map((n) => (book && n === 'a topic' ? 'a subject' : n))
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

  function setChoiceNote(index: number, value: string) {
    setDraft((d) => ({ ...d, choiceNotes: d.choiceNotes.map((n, i) => (i === index ? value : n)) }))
  }

  // The note boxes stay folded away until she asks for them, unless the question already has notes.
  const [showNotes, setShowNotes] = useState(() => draft.choiceNotes.some((n) => n.trim() !== ''))

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

  /**
   * Enter in a choice (or its note) moves to the next box instead of saving by accident:
   * choice A → note A → choice B … when the notes are open, choice A → choice B when they aren't.
   */
  function handleChoiceKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number, inNote = false) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const next = showNotes && !inNote ? `choice-note-${index}` : index < CHOICE_COUNT - 1 ? `choice-${index + 1}` : 'explanation'
    document.getElementById(next)?.focus()
  }

  async function save(thenAddAnother: boolean) {
    setSaving(true)
    setSaveError(null)
    try {
      if (existing) {
        await updateQuestion(existing.id, draft, { builtin: isBuiltin })
      } else {
        const newId = await addQuestion(draft, inSubject)
        // The question is already saved here. If putting it in the book fails, don't report a failed save
        // (trying again would make a duplicate); she can still add it with "Add to book".
        if (book) await addToBook(book.id, [newId], cleanedChapter).catch(() => {})
      }
      refreshBank()
      if (book) refreshBooks()
      if (thenAddAnother) {
        // Keep the subject, topic and chapter (she's usually adding several to the same one); clear the rest.
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
      // Back to where this question now lives (her book, or its subject and topic), so she can see it there.
      // Replace: the Back button shouldn't reopen the form she just saved.
      justSaved.current = true
      // A question that lives only in her book isn't on its topic's list, so go back to where she came from instead.
      if (!book && !inSubject) return navigate(-1)
      navigate(book ? bookAddress(book.id, cleanedChapter) : `/questions?topic=${draft.topicId}`, { replace: true, state: { saved: existing ? 'updated' : 'added' } })
    } catch {
      setSaveError('Couldn’t save. Check your internet connection and try again.')
      setSaving(false)
    }
  }

  async function attemptSave(thenAddAnother: boolean) {
    setAddingAnother(thenAddAnother)
    setShowErrors(true)
    if (book && 'error' in cleaned) {
      setChapterError(cleaned.error)
      document.getElementById('chapter')?.focus()
      return
    }
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

  // Leaving goes back to the book or subject she came from, not all the way to the shelves.
  const leaveTo = book
    ? bookAddress(book.id, searchParams.get('chapter'))
    : draft.topicId
      ? `/questions?topic=${draft.topicId}`
      : fromSubject !== null
        ? `/questions?subject=${fromSubject}`
        : '/questions'

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link to={leaveTo} className={cn(backLinkClass, 'max-w-full')}>
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{book ? book.title : 'Questions'}</span>
        </Link>
        <h1 className="text-2xl leading-tight font-bold sm:text-3xl">{existing ? 'Edit question' : 'Add a question'}</h1>
        {book && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden className="h-4 w-1.5 shrink-0 rounded-[1px]" style={{ background: BOOK_SPINE[book.color] }} />
            <span>
              Goes into your book <span className="font-semibold text-foreground">{book.title}</span> only, not into a subject.
            </span>
          </p>
        )}
        {isBuiltin && (
          <p className="flex items-start gap-2 rounded-md border border-highlight/50 bg-highlight-soft p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            This is a built-in question. Your changes are saved for your account only.
          </p>
        )}
        {addedCount > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-md bg-correct-soft px-3 py-2 font-semibold text-correct">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            {addedCount === 1 ? 'Question added.' : `${addedCount} questions added.`} Write the next one.
          </p>
        )}
      </div>

      {book ? (
        <>
          {/* ---------- Her book: chapter first (it takes the topic's place), then which subject ---------- */}
          <fieldset className="space-y-2" aria-describedby={chapterError ? 'chapter-error' : undefined}>
            <legend className="mb-2 flex flex-wrap items-baseline gap-x-2">
              <span className="font-bold">Topic</span>
              <span className="text-sm text-muted-foreground">optional, your own name for a group in this book</span>
            </legend>
            {existingChapters.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <ChipRadio
                  name="chapter"
                  checked={!typingChapter && chapter === ''}
                  onChange={() => {
                    setTypingChapter(false)
                    setChapter('')
                    setChapterError(null)
                  }}
                >
                  None
                </ChipRadio>
                {existingChapters.map((c) => (
                  <ChipRadio
                    key={c.name}
                    name="chapter"
                    checked={!typingChapter && chapter === c.name}
                    onChange={() => {
                      setTypingChapter(false)
                      setChapter(c.name)
                      setChapterError(null)
                    }}
                  >
                    {c.name}
                  </ChipRadio>
                ))}
                <ChipRadio
                  name="chapter"
                  checked={typingChapter}
                  onChange={() => {
                    setTypingChapter(true)
                    setChapter('')
                    requestAnimationFrame(() => document.getElementById('chapter')?.focus())
                  }}
                >
                  <Plus className="-ml-0.5 size-4" aria-hidden />
                  New topic
                </ChipRadio>
              </div>
            )}
            {(typingChapter || existingChapters.length === 0) && (
              <>
                <Label htmlFor="chapter" className="sr-only">
                  New topic name
                </Label>
                <input
                  id="chapter"
                  value={chapter}
                  maxLength={CHAPTER_MAX + 20}
                  placeholder="e.g. Enzymes, or Week 3 drills"
                  onChange={(e) => {
                    setChapter(e.target.value)
                    setChapterError(null)
                  }}
                  aria-invalid={Boolean(chapterError)}
                  className={cn(fieldClass, 'h-11')}
                />
              </>
            )}
            {chapterError && <ErrorText id="chapter-error">{chapterError}</ErrorText>}
          </fieldset>

          {/* Before migration 0007 only: every question still needs a subject, so ask for one (remembered per book). */}
          {!bookOnly && (
          <>
          <fieldset aria-describedby={errors.topic && subjectId === null ? 'topic-error' : undefined}>
            <legend className="mb-2 font-bold">For which subject?</legend>
            <SubjectChips subjects={subjects} subjectId={subjectId} onChange={chooseBookSubject} />
            {errors.topic && subjectId === null && <ErrorText id="topic-error">Choose a subject.</ErrorText>}
          </fieldset>

          {/* The topic is optional here ("General"); a specific one only if she asks for it. */}
          {subjectId !== null &&
            (pickingTopic ? (
              <TopicPicker
                subjects={subjects}
                topics={topics}
                subjectId={subjectId}
                topicId={draft.topicId}
                showSubjects={false}
                error={errors.topic}
                onSubjectChange={chooseBookSubject}
                onTopicChange={(id) => update({ topicId: id })}
              />
            ) : (
              <p className="-mt-2 text-sm text-muted-foreground">
                Topic: <span className="font-semibold text-foreground">{topics.find((t) => t.id === draft.topicId)?.name ?? GENERAL_TOPIC}</span>
                {' · '}
                <button
                  type="button"
                  onClick={() => setPickingTopic(true)}
                  className="rounded-sm font-semibold text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  Pick a topic
                </button>
              </p>
            ))}
          </>
          )}
        </>
      ) : bookOnly ? (
        <p className="rounded-lg border-l-4 border-primary bg-card px-3 py-2 text-sm text-muted-foreground">
          This question lives only in your books, so it has no subject or topic.
        </p>
      ) : subjectLocked && subjectId !== null ? (
        <>
          {/* ---------- From a subject's book: the subject is set, only the topic is asked ---------- */}
          <div className="flex items-center justify-between gap-3 rounded-lg border-l-4 border-primary bg-card py-2 pr-1 pl-3">
            <p className="min-w-0 text-sm">
              Goes into{' '}
              <span className="font-heading font-bold">
                {subjects.find((s) => s.id === subjectId)?.code} · {subjects.find((s) => s.id === subjectId)?.name}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setSubjectLocked(false)}
              aria-label="Change the subject"
              className="h-9 shrink-0 rounded-md bg-primary/[0.08] px-3 text-sm font-bold text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              Change
            </button>
          </div>
          <TopicPicker
            subjects={subjects}
            topics={topics}
            subjectId={subjectId}
            topicId={draft.topicId}
            showSubjects={false}
            error={errors.topic}
            onSubjectChange={(id) => setSubjectId(id)}
            onTopicChange={(id) => update({ topicId: id })}
          />
        </>
      ) : (
        <TopicPicker
          subjects={subjects}
          topics={topics}
          subjectId={subjectId}
          topicId={draft.topicId}
          error={errors.topic}
          onSubjectChange={(id) => {
            setSubjectId(id)
            update({ topicId: null }) // the topic list changes with the subject
          }}
          onTopicChange={(id) => update({ topicId: id })}
        />
      )}

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
            <Link
              // Upload keeps where she came from: her book, or the subject she's adding to
              to={book ? `/questions/upload?book=${book.id}` : subjectId !== null ? `/questions/upload?subject=${subjectId}` : '/questions/upload'}
              state={{ pastedText: draft.stem }} className="rounded-sm text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
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
            <div key={i} className={cn(showNotes && 'pb-1.5')}>
              <div className="flex items-center gap-2">
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
              {/* The note sits right under its own choice, lined up with the choice box (same as on the answer screen). */}
              {showNotes && (
                <div className="mt-1.5 pr-13 pl-7 sm:pr-28">
                  <Label htmlFor={`choice-note-${i}`} className="sr-only">
                    Note for choice {CHOICE_LETTERS[i]}
                  </Label>
                  <input
                    id={`choice-note-${i}`}
                    value={draft.choiceNotes[i] ?? ''}
                    onChange={(e) => setChoiceNote(i, e.target.value)}
                    onKeyDown={(e) => handleChoiceKeyDown(e, i, true)}
                    placeholder={isCorrect ? 'Why this is the answer (optional)' : 'What this choice really is, or why it’s wrong (optional)'}
                    className={cn(fieldClass, 'h-9 text-sm')}
                  />
                </div>
              )}
            </div>
          )
        })}
        {errors.choices && <ErrorText id="choices-error">{errors.choices}</ErrorText>}
        {errors.correct && <ErrorText id="correct-error">{errors.correct}</ErrorText>}
        {!showNotes && (
          <button
            type="button"
            onClick={() => {
              setShowNotes(true)
              requestAnimationFrame(() => document.getElementById('choice-note-0')?.focus())
            }}
            className="inline-flex items-center gap-1.5 rounded-sm pt-1 text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <Plus className="size-4" aria-hidden />
            Add a note for each choice
          </button>
        )}
        {showNotes && (
          <p className="pt-1 text-sm text-muted-foreground">Notes are optional. Each one shows under its choice after you answer.</p>
        )}
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
