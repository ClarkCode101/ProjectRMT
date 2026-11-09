import { BadgeCheck, Bookmark, BookMinus, BookPlus, Check, ChevronDown, CircleCheck, Flag, Info, Pencil, Search, SlidersHorizontal, Trash2, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/dashboard'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { filterQuestions, summarizeCoverage, type BankFilters } from '@/lib/questions'
import { BOOK_SUBJECT_CODE, useSubjectOfTopic, useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { BOOK_SPINE, bookAccuracy, booksContaining, chapterList, LIBRARY_COUNT, libraryNames, NO_CHAPTER, questionsOnlyIn, roomLeft, SUBJECT_COLOR } from '@/lib/books'
import { summarizePerformance, type SubjectInfo } from '@/lib/quiz'
import { useTopicPerformance } from '@/features/dashboard/api'
import { attemptHistoryOptions } from '@/features/quiz/api'
import { reviewStatesOptions } from '@/features/flashcards/api'
import { countDue } from '@/lib/fsrs'
import { useQuery } from '@tanstack/react-query'
import { deleteQuestion, setQuestionStatus, useQuestionBank, useRefreshBank, type BankQuestion } from './api'
import { AddToBookDialog, BookDialog, ChapterDialog, LibraryDialog, MergeBookDialog } from './BookDialogs'
import { Bookshelf } from './Bookshelf'
import { addToBook, removeFromBook, useBooks, useLibraryNames, useRefreshBooks, type Book } from './booksApi'
import { ChapterContents, Contents, OpenBinder, TitlePage } from './BinderPage'
import { DrawerBar } from './DrawerBar'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
// Long lists are slow on phones, so show them in batches.
const BATCH = 30

const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40'

export default function QuestionsPage() {
  const bank = useQuestionBank()
  const subjects = useSubjects()
  const topics = useTopics()
  const books = useBooks()
  const libraries = useLibraryNames()

  if (bank.isPending || subjects.isPending || topics.isPending || books.isPending || libraries.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (bank.isError || subjects.isError || topics.isError) {
    return <FullPageMessage>Couldn’t load the questions. Check your internet connection, then refresh.</FullPageMessage>
  }

  // Books failing to load (e.g. migration 0004 not run yet) shouldn't take the whole page down: the subjects still work.
  return (
    <QuestionBankView
      questions={bank.data}
      subjects={subjects.data}
      topics={topics.data}
      books={books.data ?? []}
      libraryNames={libraries.data ?? libraryNames([])}
      booksUnavailable={books.isError || libraries.isError}
    />
  )
}

/** The library she looked at last, so "← Shelves" from inside a book goes back to the same one. */
const LIBRARY_KEY = 'projectrmt:library'
function rememberedLibrary() {
  try {
    const slot = Number(sessionStorage.getItem(LIBRARY_KEY))
    return Number.isInteger(slot) && slot >= 1 && slot <= LIBRARY_COUNT ? slot : 1
  } catch {
    return 1
  }
}

/**
 * Two screens, one job each, so she always knows where she is:
 * - /questions: the bookshelf, to choose where to go (or search, or add, or make a book).
 * - /questions?subject=ID, ?topic=ID, ?book=ID or ?view=all: a list, with DrawerBar stuck on top.
 * Everything she filtered by is kept in the address, so Back and coming back from the editor just work.
 */
function QuestionBankView({
  questions,
  subjects,
  topics,
  books,
  libraryNames: names,
  booksUnavailable,
}: {
  questions: BankQuestion[]
  subjects: SubjectInfo[]
  topics: { id: number; subject_id: number; name: string }[]
  books: Book[]
  libraryNames: string[]
  booksUnavailable: boolean
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  // Set by the editor after a save, so we can say it worked.
  const saved = (useLocation().state as { saved?: 'added' | 'updated' } | null)?.saved
  const refreshBooks = useRefreshBooks()

  const book = books.find((b) => b.id === searchParams.get('book')) ?? null
  const topic = book ? null : (topics.find((t) => t.id === Number(searchParams.get('topic'))) ?? null)
  const subjectParam = book ? null : (subjects.find((s) => s.id === Number(searchParams.get('subject')))?.id ?? null)
  const subjectId = topic?.subject_id ?? subjectParam
  const search = searchParams.get('q') ?? ''
  const onlyNeedsLook = searchParams.get('needs') === '1'
  const atShelf = subjectId === null && !book && searchParams.get('view') !== 'all'

  const [source, setSource] = useState<BankFilters['source']>('all')
  const [optionsOpen, setOptionsOpen] = useState(false)
  // The New book dialog. forQuestion: opened from "Add to book" on a question, so that question goes into the new book.
  const [newBook, setNewBook] = useState<{ forQuestion: string | null } | null>(null)
  const [editingBook, setEditingBook] = useState(false)
  // The book she just made, so it slides onto the shelf.
  const [arrivingId, setArrivingId] = useState<string | null>(null)
  // Merging one of her books into another: dropped on the shelf (target picked), or from Edit book (targetId null).
  const [merging, setMerging] = useState<{ sourceId: string; targetId: string | null } | null>(null)

  // ---------- Flashcards due in the open book (the count on Study → Flashcards) ----------
  const reviewStates = useQuery({ ...reviewStatesOptions, enabled: !atShelf })
  const [now] = useState(() => new Date())
  const statesById = new Map((reviewStates.data ?? []).map((r) => [r.question_id, r]))
  const dueIn = (ids: Iterable<string>) => (reviewStates.data ? countDue(ids, statesById, now) : undefined)

  // ---------- Her scores, for the stars on the books (they appear once loaded; the shelves don't wait) ----------
  const performance = useTopicPerformance()
  // Answers are only needed for books' scores: on the shelves, or inside one of her books.
  const attempts = useQuery({ ...attemptHistoryOptions, enabled: atShelf || book !== null })
  const subjectAccuracy = performance.data
    ? new Map(summarizePerformance(performance.data, subjects, topics).map((s) => [s.subjectId, s.accuracy]))
    : undefined
  const bookScores = attempts.data ? new Map(books.map((b) => [b.id, bookAccuracy(b.questionIds, attempts.data)])) : undefined
  const [renamingLibrary, setRenamingLibrary] = useState(false)

  // The library on screen: ?lib=2 in the address, else the one she looked at last.
  const libParam = Number(searchParams.get('lib'))
  const library = Number.isInteger(libParam) && libParam >= 1 && libParam <= LIBRARY_COUNT ? libParam : rememberedLibrary()
  function showLibrary(slot: number) {
    try {
      sessionStorage.setItem(LIBRARY_KEY, String(slot))
    } catch {
      // storage blocked: it just won't be remembered
    }
    setSearchParams({ lib: String(slot) }, { replace: true })
  }
  // Room left in each library, for the New book / Edit book picker.
  const roomByLibrary = names.map((_, i) => roomLeft(i + 1, books.filter((b) => b.library === i + 1).length, subjects.length))

  async function handleBookCreated(id: string, slot: number) {
    setArrivingId(id)
    if (atShelf && slot !== library) showLibrary(slot) // show where it went

    const questionId = newBook?.forQuestion
    if (!questionId) return
    try {
      await addToBook(id, [questionId])
      refreshBooks()
    } catch {
      // The book was made; she can still add the question from "Add to book".
    }
  }

  // A subject's book holds only the questions that are in it: not the ones that live only in one of her books.
  const inSubjects = questions.filter((q) => q.in_subject)
  const coverage = summarizeCoverage(inSubjects, subjects, topics)
  const subject = coverage.find((s) => s.subjectId === subjectId)

  // Questions are ready to use by default (the built-in set is fact-checked; ones she types are hers).
  // Only two kinds "need a look": ones she reported from a quiz, and uploads saved before uploads started as ready to use.
  const needsLook = questions.filter((q) => q.status === 'unverified')
  const subjectOfTopic = new Map(topics.map((t) => [t.id, t.subject_id]))
  const flaggedBySubject = new Map<number, number>()
  for (const q of needsLook) {
    if (!q.in_subject) continue // not on a subject's book
    const id = subjectOfTopic.get(q.topic_id)
    if (id !== undefined) flaggedBySubject.set(id, (flaggedBySubject.get(id) ?? 0) + 1)
  }

  // Inside one of her books: one chapter (?chapter=NAME, or NO_CHAPTER for the ones without), or all of them.
  const chapterParam = book ? searchParams.get('chapter') : null
  const contents = book ? chapterList(book.chapters) : null
  const chapter = chapterParam !== null && (chapterParam === NO_CHAPTER || contents?.chapters.some((c) => c.name === chapterParam)) ? chapterParam : null
  const inChapter = (id: string) => chapter === null || (book?.chapters.get(id) ?? null) === (chapter === NO_CHAPTER ? null : chapter)

  // Every question in the open subject (for its flashcards due count).
  const subjectQuestionIds = subject ? inSubjects.filter((q) => subjectOfTopic.get(q.topic_id) === subject.subjectId).map((q) => q.id) : []

  // Inside a book: only its questions (in the chosen chapter). Otherwise: everything, narrowed by subject/topic below.
  // (A subject's book leaves out the questions that live only in her books; "All questions" shows everything.)
  const pool = book ? questions.filter((q) => book.questionIds.has(q.id) && inChapter(q.id)) : subject ? inSubjects : questions
  const subjectTopicIds = topic ? [topic.id] : subject ? subject.topics.map((t) => t.topicId) : null
  const filters: BankFilters = { search, subjectTopicIds, status: 'all', source }
  const needsLookInScope = filterQuestions(pool, { ...filters, status: 'unverified' })
  const shown = onlyNeedsLook ? needsLookInScope : filterQuestions(pool, filters)
  // How many are in this book, drawer or folder before searching, for "3 of 30 questions match".
  const scopeTotal = filterQuestions(pool, { search: '', subjectTopicIds, status: 'all', source: 'all' }).length

  const scope: Record<string, string> = book
    ? { book: book.id, ...(chapter !== null && { chapter }) }
    : topic
      ? { topic: String(topic.id) }
      : subject
        ? { subject: String(subject.subjectId) }
        : { view: 'all' }
  // From a chapter of her book, a new question starts in that chapter.
  const addTo = book
    ? `/questions/new?${new URLSearchParams({ book: book.id, ...(chapter !== null && chapter !== NO_CHAPTER && { chapter }) })}`
    : topic
      ? `/questions/new?topic=${topic.id}`
      : subject
        ? `/questions/new?subject=${subject.subjectId}` // from a subject's book: the subject is already set
        : '/questions/new'
  const addLabel = book ? 'Write a question' : topic ? `Add to ${topic.name}` : 'Add question'

  /** The address for this list with the search and "needs a look" kept. */
  function listParams(where: Record<string, string>, change: { search?: string; needs?: boolean } = {}) {
    const nextSearch = change.search ?? search
    const nextNeeds = change.needs ?? onlyNeedsLook
    return { ...where, ...(nextSearch && { q: nextSearch }), ...(nextNeeds && { needs: '1' }) }
  }

  function updateList(change: { search?: string; needs?: boolean }) {
    // The first letter typed at the shelves moves to the list (a real step, so Back returns to the shelves).
    // After that, typing shouldn't fill up the Back button's history.
    setSearchParams(listParams(scope, change), { replace: !atShelf })
  }

  function selectChapter(next: string | null) {
    if (!book) return
    setSearchParams(listParams({ book: book.id, ...(next !== null && { chapter: next }) }), { replace: true })
  }

  function selectTopic(id: number | null) {
    setSearchParams(listParams(id === null ? { subject: String(subjectId) } : { topic: String(id) }), { replace: true })
    window.scrollTo({ top: 0 })
  }

  const placeholder = atShelf ? 'Search all questions' : `Search in ${book?.title ?? topic?.name ?? subject?.code ?? 'all questions'}`

  return (
    // Wider inside a book: the open binder has two pages side by side.
    <div
      className={cn(
        'mx-auto',
        atShelf
          ? 'max-w-4xl space-y-4'
          : // Inside a book: one screen tall (no page scroll), like Practice. Only the questions scroll, inside the binder.
            // Phone: minus the top bar, main's padding and the bottom nav (11rem). Computer: minus main's padding (2.5rem).
            // Wider too: the open binder has two pages side by side.
            'flex h-[calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-[30rem] max-w-6xl flex-col gap-3 md:h-[calc(100dvh-2.5rem)]',
      )}
    >
      {atShelf ? (
        <>
          <PageHeader title="Questions" subtitle={`${questions.length} questions on your shelves${needsLook.length > 0 ? ` · ${needsLook.length} need a look` : ''}.`} />
          {booksUnavailable && (
            <p role="status" className="flex items-start gap-2 rounded-md border border-highlight/50 bg-highlight-soft p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              Your books couldn’t load. If you just updated the app, run supabase/migrations/0004_books.sql in Supabase first, then refresh.
            </p>
          )}
          <Bookshelf
            libraryNames={names}
            library={library}
            onLibraryChange={showLibrary}
            onRenameLibrary={() => setRenamingLibrary(true)}
            coverage={coverage}
            flaggedBySubject={flaggedBySubject}
            books={books}
            subjectAccuracy={subjectAccuracy}
            bookAccuracy={bookScores}
            arrivingId={arrivingId}
            onNewBook={() => setNewBook({ forQuestion: null })}
            onMerge={(sourceId, targetId) => setMerging({ sourceId, targetId })}
          />
          {/* Nothing else on this screen: the shelves are the way in. Add, Upload and search live inside each book. */}
        </>
      ) : (
        <>
          {/* ---------- Inside a book: a slim bar on top, then the binder page ---------- */}
          <DrawerBar
            title={book?.title ?? subject?.code ?? 'All questions'}
            addTo={addTo}
            addLabel={addLabel}
            // Upload from inside a book: into that book (her book), or with its subject already set
            uploadTo={book ? `/questions/upload?book=${book.id}` : subject ? `/questions/upload?subject=${subject.subjectId}` : '/questions/upload'}
          />

          <OpenBinder
            color={book ? BOOK_SPINE[book.color] : subject ? (SUBJECT_COLOR[subject.code] ?? BOOK_SPINE.teal) : BOOK_SPINE.teal}
            pageKey={book?.id ?? String(subject?.subjectId ?? 'all')}
            left={
              <>
                {book ? (
                  <TitlePage
                    title={book.title}
                    count={book.questionIds.size}
                    accuracy={bookScores?.get(book.id)}
                    study={
                      book.questionIds.size > 0
                        ? { practice: `/practice?book=${book.id}`, mock: `/mock?book=${book.id}`, flashcards: `/flashcards?book=${book.id}`, due: dueIn(book.questionIds) }
                        : undefined
                    }
                    onEdit={() => setEditingBook(true)}
                    tag={
                      book.publishedAt ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/[0.08] px-2 py-px text-xs font-semibold text-primary">
                          <Users className="size-3" aria-hidden />
                          Shared to Community
                        </span>
                      ) : book.copiedFrom ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-px text-xs font-semibold text-foreground">
                          <Users className="size-3" aria-hidden />
                          From Community
                        </span>
                      ) : undefined
                    }
                    note={
                      <>
                        Fill it with <span className="font-semibold text-foreground">{addLabel}</span>, or open any subject and tap{' '}
                        <span className="font-semibold text-foreground">Add to book</span> on a question you already have.
                      </>
                    }
                  />
                ) : subject ? (
                  <TitlePage
                    title={subject.code}
                    subtitle={subject.name}
                    count={subject.total}
                    accuracy={subjectAccuracy?.get(subject.subjectId)}
                    // each opens on this subject (Practice also on the chosen topic, if any)
                    study={{
                      practice: `/practice?subject=${subject.subjectId}${topic ? `&topic=${topic.id}` : ''}`,
                      mock: `/mock?subject=${subject.subjectId}`,
                      flashcards: `/flashcards?subject=${subject.subjectId}`,
                      due: dueIn(subjectQuestionIds),
                    }}
                  />
                ) : (
                  <TitlePage title="All questions" count={questions.length} />
                )}
                {subject && <Contents subject={subject} topicId={topic?.id ?? null} onSelect={selectTopic} />}
                {book && contents && (
                  <ChapterContents chapters={contents.chapters} unfiled={contents.unfiled} total={book.questionIds.size} chapter={chapter} onSelect={selectChapter} />
                )}
              </>
            }
            right={
              <>
                {saved && (
                  <p role="status" className="flex items-center gap-2 rounded-md bg-correct-soft px-3 py-2 font-semibold text-correct">
                    <CircleCheck className="size-4 shrink-0" aria-hidden />
                    {saved === 'added' ? 'Question added.' : 'Changes saved.'}
                  </p>
                )}

                {/* ---------- Search, filter, and the questions ---------- */}
                <section aria-label="Find questions" className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Label htmlFor="q-search" className="sr-only">
                        Search questions
                      </Label>
                      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <input
                        id="q-search"
                        type="search"
                        placeholder={placeholder}
                        value={search}
                        onChange={(e) => updateList({ search: e.target.value })}
                        className="h-11 w-full rounded-lg border border-input bg-background/60 pr-3 pl-9 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setOptionsOpen(true)}
                      aria-label={source !== 'all' ? 'Filter options (changed)' : 'Filter options'}
                      className={cn('relative flex size-11 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground', focusRing)}
                    >
                      <SlidersHorizontal className="size-5" aria-hidden />
                      {source !== 'all' && <span className="absolute top-2 right-2 size-2 rounded-full bg-highlight" aria-hidden />}
                    </button>
                  </div>

                  <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="text-sm text-muted-foreground" aria-live="polite">
                      {shown.length === scopeTotal ? questionCount(shown.length) : `${shown.length} of ${questionCount(scopeTotal)} match`}
                    </p>
                    {/* Only there when there's something to look at (or to turn back off), so most days it's out of the way. */}
                    {(needsLookInScope.length > 0 || onlyNeedsLook) && (
                      <button
                        type="button"
                        onClick={() => updateList({ needs: !onlyNeedsLook })}
                        aria-pressed={onlyNeedsLook}
                        className={cn(
                          'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors',
                          focusRing,
                          onlyNeedsLook ? 'bg-primary text-white' : 'bg-highlight-soft text-foreground hover:brightness-95',
                        )}
                      >
                        {onlyNeedsLook ? <Check className="size-4" aria-hidden /> : <Flag className="size-3.5" aria-hidden />}
                        Needs a look · <span className="tabular-nums">{needsLookInScope.length}</span>
                      </button>
                    )}
                  </div>

                  {/* the only part that scrolls: the questions, on the page's ruled lines (edge to edge: -mx) */}
                  <div className="binder-scroll -mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain sm:-mx-6">
                    {shown.length === 0 ? (
                      <p className="border-y border-primary/10 px-4 py-10 text-center text-muted-foreground">
                        {book && scopeTotal === 0
                          ? 'This book is empty. Write a question for it, or add ones you already have.'
                          : topic && scopeTotal === 0
                            ? `Nothing filed under ${topic.name} yet. Add the first one.`
                            : 'No questions match. Try a different search or filter.'}
                      </p>
                    ) : (
                      // key: a different list starts from its first batch again (and slides in like the next page).
                      <QuestionList
                        key={JSON.stringify([scope, search, onlyNeedsLook, source])}
                        questions={shown}
                        books={books}
                        openBook={book}
                        // inside a subject, every question is from it: show just the topic, not the subject code again
                        showSubject={!subject}
                        onNewBookFor={(questionId) => setNewBook({ forQuestion: questionId })}
                      />
                    )}
                  </div>
                </section>
              </>
            }
          />
        </>
      )}

      {/* Make a new book (from the shelf's empty slot, or from "Add to book" on a question) */}
      <BookDialog
        open={newBook !== null}
        onClose={() => setNewBook(null)}
        libraries={{ names, roomLeft: roomByLibrary }}
        defaultLibrary={library}
        onCreated={(id, slot) => void handleBookCreated(id, slot)}
      />
      {/* Rename / recolor / move / delete the open book. Deleting goes back to the shelves. */}
      {book && (
        <BookDialog
          open={editingBook}
          onClose={() => setEditingBook(false)}
          book={book}
          libraries={{ names, roomLeft: roomByLibrary }}
          onDeleted={() => setSearchParams({ lib: String(book.library) })}
          deletesQuestions={questionsOnlyIn(book.id, books, questions)}
          onMergeRequest={
            books.length > 1
              ? () => {
                  setEditingBook(false)
                  setMerging({ sourceId: book.id, targetId: null })
                }
              : undefined
          }
        />
      )}
      {/* Merge one of her books into another (it's then removed; its questions go into the other one) */}
      <MergeBookDialog
        open={merging !== null}
        onClose={() => setMerging(null)}
        source={books.find((b) => b.id === merging?.sourceId) ?? null}
        target={books.find((b) => b.id === merging?.targetId) ?? null}
        books={books}
        onMerged={(targetId) => {
          setArrivingId(targetId) // the book that took it in does a little hop on the shelf
          // Merged from inside the book (Edit book): that book is gone, so open the one it went into.
          if (book) setSearchParams({ book: targetId }, { replace: true })
        }}
      />
      <LibraryDialog open={renamingLibrary} onClose={() => setRenamingLibrary(false)} slot={library} name={names[library - 1]} />

      <Dialog open={optionsOpen} onClose={() => setOptionsOpen(false)} labelledBy="q-options-heading" variant="sheet" closeOnBackdrop={false}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="q-options-heading" className="font-heading text-lg font-bold">
              Filter options
            </h2>
            <button
              type="button"
              onClick={() => setOptionsOpen(false)}
              aria-label="Close"
              className={cn('flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground', focusRing)}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div>
            <Label htmlFor="q-source" className="mb-1.5 block text-sm font-semibold">
              Source
            </Label>
            <NativeSelect id="q-source" value={source} onChange={(e) => setSource(e.target.value as BankFilters['source'])} className="bg-card">
              <option value="all">Any source</option>
              <option value="builtin">Built-in</option>
              <option value="mine">Mine</option>
            </NativeSelect>
          </div>
          <button
            type="button"
            onClick={() => setOptionsOpen(false)}
            className={cn('h-11 w-full rounded-lg bg-primary font-heading font-bold text-primary-foreground hover:bg-primary/90', focusRing)}
          >
            Done
          </button>
        </div>
      </Dialog>
    </div>
  )
}

function questionCount(n: number) {
  return `${n} question${n === 1 ? '' : 's'}`
}

function QuestionList({
  questions,
  books,
  openBook,
  showSubject,
  onNewBookFor,
}: {
  questions: BankQuestion[]
  books: Book[]
  /** the book being looked at, if any (its rows get "Remove from book") */
  openBook: Book | null
  /** false inside a subject (every question is from it, so only the topic is shown) */
  showSubject: boolean
  onNewBookFor: (questionId: string) => void
}) {
  const [shownCount, setShownCount] = useState(BATCH)
  return (
    <>
      {/* Ruled lines across the page, like a notebook. */}
      <ol className="page-flip divide-y divide-primary/10 border-y border-primary/10">
        {questions.slice(0, shownCount).map((q, i) => (
          <QuestionRow key={q.id} number={i + 1} question={q} books={books} openBook={openBook} showSubject={showSubject} onNewBook={() => onNewBookFor(q.id)} />
        ))}
      </ol>
      {questions.length > shownCount && (
        <div className="px-4 py-3 sm:px-6">
          <Button variant="outline" className="h-11 w-full rounded-lg" onClick={() => setShownCount((n) => n + BATCH)}>
            Show more ({questions.length - shownCount} left)
          </Button>
        </div>
      )}
    </>
  )
}

/** One question. Closed: subject, status and the question. Open: choices, explanation, and actions. */
function QuestionRow({
  number,
  question: q,
  books,
  openBook,
  showSubject,
  onNewBook,
}: {
  /** its place in the list, written in the margin */
  number: number
  question: BankQuestion
  books: Book[]
  openBook: Book | null
  showSubject: boolean
  onNewBook: () => void
}) {
  const subjectOf = useSubjectOfTopic()
  const refreshBank = useRefreshBank()
  const refreshBooks = useRefreshBooks()
  const refresh = () => {
    refreshBank()
    refreshBooks()
  }
  const [addToBookOpen, setAddToBookOpen] = useState(false)
  const [chapterOpen, setChapterOpen] = useState(false)
  const inBooks = booksContaining(books, q.id)
  const subject = subjectOf(q.topic_id)
  const isMine = q.owner_id !== null
  const verified = q.status === 'verified'
  // Uploads saved before they started as ready to use (old ones) still "need a look"; anything else that isn't verified was reported from a quiz.
  const needsLookLabel = q.source === 'upload' ? 'Needs a look' : 'Reported'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      refresh()
    } catch {
      setError('Couldn’t save. Check your internet connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-stretch gap-3 pr-4 outline-none hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset sm:pr-5 [&::-webkit-details-marker]:hidden">
          {/* the notebook margin: the question's number, with a red margin line */}
          <span aria-hidden className="w-9 shrink-0 border-r-2 border-wrong/25 pt-3.5 pr-2 text-right font-heading text-sm font-bold text-muted-foreground tabular-nums sm:w-11">
            {number}
          </span>
          <span className="min-w-0 flex-1 py-3.5">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {/* a question written in her book has no real subject or topic ("Book only" says it instead) */}
              {subject.code !== BOOK_SUBJECT_CODE && (
                <span>
                  {showSubject && <span className="font-heading font-bold text-foreground">{subject.code ?? '—'} </span>}
                  {subject.topicName}
                </span>
              )}
              {/* No badge when it's fine (most of them), so the few that need a look stand out. */}
              {!verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-highlight-soft px-2 py-px font-semibold text-foreground">
                  {needsLookLabel === 'Reported' && <Flag className="size-3" aria-hidden />}
                  {needsLookLabel}
                </span>
              )}
              {isMine && <span className="rounded-full bg-secondary px-2 py-px font-semibold text-foreground">Mine</span>}
              {/* lives only in her book(s): not in its subject (migration 0006) */}
              {!q.in_subject && <span className="rounded-full border border-dashed border-primary/30 px-2 py-px font-semibold text-muted-foreground">Book only</span>}
              {/* inside her book: the question's chapter in it */}
              {openBook?.chapters.get(q.id) && (
                <span className="inline-flex max-w-48 items-center gap-1 rounded-full bg-primary/[0.08] px-2 py-px font-semibold text-primary">
                  <Bookmark className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{openBook.chapters.get(q.id)}</span>
                </span>
              )}
              {/* which of her books it's in (a small spine in each book's color), except the one she's looking at */}
              {inBooks
                .filter((b) => b.id !== openBook?.id)
                .map((b) => (
                  <span key={b.id} className="inline-flex max-w-40 items-center gap-1 rounded-full bg-secondary px-2 py-px font-semibold text-foreground">
                    <span aria-hidden className="h-2.5 w-1 shrink-0 rounded-[1px]" style={{ background: BOOK_SPINE[b.color] }} />
                    <span className="truncate">{b.title}</span>
                  </span>
                ))}
            </span>
            <span className="mt-0.5 block leading-snug font-semibold">{q.stem}</span>
          </span>
          <ChevronDown className="mt-4 size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>

        <div className="space-y-3 pr-4 pb-4 pl-12 sm:pr-5 sm:pl-14">
          <ol className="grid gap-1.5 text-sm" aria-label="Choices">
            {q.choices.map((choice, i) => {
              const correct = i === q.correct_index
              return (
                <li key={i} className={cn('flex gap-2 rounded-md px-3 py-2', correct ? 'bg-correct-soft font-bold text-correct' : 'bg-background')}>
                  <span className="w-4 shrink-0 font-heading font-bold">{LETTERS[i]}</span>
                  <span className="min-w-0 flex-1">{choice}</span>
                  {correct && <span className="shrink-0 text-xs">Correct</span>}
                </li>
              )
            })}
          </ol>
          {q.explanation ? (
            <p className="leading-relaxed text-foreground/90">{q.explanation}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No explanation yet.</p>
          )}

          {error && (
            <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {verified ? (
              // Quiet: most questions are fine; this is only for when she spots a problem here.
              <Button variant="outline" className="h-10 rounded-lg" disabled={busy} onClick={() => run(() => setQuestionStatus(q.id, 'unverified', !isMine))}>
                <Flag className="size-4" aria-hidden />
                Report a problem
              </Button>
            ) : (
              // After fixing it (Edit) or checking it, one tap clears the flag.
              <Button className="h-10 rounded-lg" disabled={busy} onClick={() => run(() => setQuestionStatus(q.id, 'verified', !isMine))}>
                <BadgeCheck className="size-4" aria-hidden />
                Looks right now
              </Button>
            )}
            <Link
              to={`/questions/${q.id}/edit`}
              className={cn('inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:border-primary', focusRing)}
            >
              <Pencil className="size-4" aria-hidden />
              Edit
            </Link>
            {openBook && (
              <Button variant="outline" className="h-10 rounded-lg" onClick={() => setChapterOpen(true)}>
                <Bookmark className="size-4" aria-hidden />
                Topic
              </Button>
            )}
            {/* Built-in questions already live in their subject book, so they can't go into hers (migration 0014). */}
            {isMine && (
              <Button variant="outline" className="h-10 rounded-lg" onClick={() => setAddToBookOpen(true)}>
                <BookPlus className="size-4" aria-hidden />
                Add to book{inBooks.length > 0 && <span className="text-muted-foreground tabular-nums">· {inBooks.length}</span>}
              </Button>
            )}
            {openBook && (
              <Button
                variant="ghost"
                className="h-10 rounded-lg"
                // A book-only question in just this book would be left in nothing at all: delete it instead (or move it first).
                disabled={busy || (!q.in_subject && inBooks.length === 1)}
                title={!q.in_subject && inBooks.length === 1 ? 'It’s only in this book. Delete it, or add it to a subject or another book first.' : undefined}
                onClick={() => run(() => removeFromBook(openBook.id, q.id))}
              >
                <BookMinus className="size-4" aria-hidden />
                Remove from book
              </Button>
            )}
            {isMine && (
              <Button variant="ghost" className="h-10 rounded-lg text-wrong hover:bg-wrong-soft hover:text-wrong" disabled={busy} onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" aria-hidden />
                Delete
              </Button>
            )}
          </div>
        </div>
      </details>

      {openBook && <ChapterDialog open={chapterOpen} onClose={() => setChapterOpen(false)} book={openBook} questionId={q.id} />}

      <AddToBookDialog
        open={addToBookOpen}
        onClose={() => setAddToBookOpen(false)}
        question={q}
        books={books}
        openBook={openBook}
        onNewBook={() => {
          setAddToBookOpen(false)
          onNewBook()
        }}
      />

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} labelledBy={`delete-${q.id}`}>
        <div className="space-y-4">
          <div>
            <h2 id={`delete-${q.id}`} className="text-xl font-bold">
              Delete this question?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              It will be removed from practice, and your past answers to it are deleted too. This can’t be undone.
            </p>
          </div>
          {/* "Keep" comes first so it gets the focus when the dialog opens. */}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="outline" className="h-11 flex-1 rounded-lg" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              className="h-11 flex-1 rounded-lg bg-wrong text-white hover:bg-wrong/90"
              onClick={() => {
                setConfirmDelete(false)
                void run(() => deleteQuestion(q.id))
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </li>
  )
}
