import { Check, Combine, Plus, TriangleAlert, Users, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Dialog } from '@/components/Dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { BOOK_COLORS, BOOK_SPINE, BOOK_TITLE_MAX, CHAPTER_MAX, chapterList, cleanBookTitle, cleanChapter, cleanLibraryName, LIBRARY_NAME_MAX, mergeTopicName } from '@/lib/books'
import { communityErrorMessage } from '@/lib/community'
import { findMergeDuplicates } from '@/lib/mergeDuplicates'
import { setBookShared, useRefreshCommunity } from '@/features/community/api'
import type { BookColor } from '@/lib/database.types'
import { useBookTopicId, useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { setQuestionPlace, useRefreshBank, type BankQuestion } from './api'
import { ChipRadio } from './QuestionFormParts'
import { addToBook, createBook, deleteBook, mergeBooks, removeFromBook, renameLibrary, setChapter, splitTopic, updateBook, useRefreshBooks, type Book } from './booksApi'

const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40'
const SAVE_ERROR = 'Couldn’t save. Check your internet connection and try again.'

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close" className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground', focusRing)}>
      <X className="size-5" aria-hidden />
    </button>
  )
}

/** Which libraries a book can go in, and how much room each one has left. */
type LibraryChoice = { names: string[]; roomLeft: number[] }

/**
 * Make a new book, or rename / recolor / move / delete one (when `book` is given).
 * `onCreated` gets the new book's id and library, so the shelf can show that library and drop the book in.
 */
export function BookDialog({
  open,
  onClose,
  book,
  libraries,
  defaultLibrary = 1,
  onCreated,
  onDeleted,
  onMergeRequest,
  deletesQuestions = 0,
}: {
  open: boolean
  onClose: () => void
  book?: Book
  libraries: LibraryChoice
  /** the library on screen, picked first for a new book (if it has room) */
  defaultLibrary?: number
  onCreated?: (id: string, library: number) => void
  onDeleted?: () => void
  /** "Merge into another book…": open the Merge dialog (only given when she has another book) */
  onMergeRequest?: () => void
  /** how many of her questions live only in this book (deleted with it, migration 0013) */
  deletesQuestions?: number
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="book-dialog-heading" variant="sheet" closeOnBackdrop={false}>
      {/* key: opening it again starts from the book's current name, color and library */}
      {open && <BookForm key={book?.id ?? 'new'} book={book} libraries={libraries} defaultLibrary={defaultLibrary} onClose={onClose} onCreated={onCreated} onDeleted={onDeleted} onMergeRequest={onMergeRequest} deletesQuestions={deletesQuestions} />}
    </Dialog>
  )
}

function BookForm({
  book,
  libraries,
  defaultLibrary,
  onClose,
  onCreated,
  onDeleted,
  onMergeRequest,
  deletesQuestions,
}: {
  book?: Book
  libraries: LibraryChoice
  defaultLibrary: number
  onClose: () => void
  onCreated?: (id: string, library: number) => void
  onDeleted?: () => void
  onMergeRequest?: () => void
  deletesQuestions: number
}) {
  const refreshBooks = useRefreshBooks()
  const refreshBank = useRefreshBank()
  const [title, setTitle] = useState(book?.title ?? '')
  const [color, setColor] = useState<BookColor>(book?.color ?? 'teal')
  // A library can take this book if it has room, or if the book is already in it.
  const fits = (slot: number) => slot === book?.library || (libraries.roomLeft[slot - 1] ?? 0) > 0
  const [library, setLibrary] = useState(() => {
    if (book) return book.library
    if (fits(defaultLibrary)) return defaultLibrary
    return libraries.names.map((_, i) => i + 1).find(fits) ?? defaultLibrary
  })
  const noRoomAnywhere = !book && !libraries.names.some((_, i) => fits(i + 1))
  const [titleError, setTitleError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const cleaned = cleanBookTitle(title)
    if ('error' in cleaned) {
      setTitleError(cleaned.error)
      document.getElementById('book-title')?.focus()
      return
    }
    setBusy(true)
    setSaveError(null)
    try {
      if (book) {
        await updateBook(book.id, { title: cleaned.title, color, library })
      } else {
        const id = await createBook(cleaned.title, color, library)
        onCreated?.(id, library)
      }
      refreshBooks()
      onClose()
    } catch {
      setSaveError(SAVE_ERROR)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!book) return
    setBusy(true)
    setSaveError(null)
    try {
      await deleteBook(book.id)
      refreshBooks()
      refreshBank() // the questions that lived only in it are gone too
      onDeleted?.()
      onClose()
    } catch {
      setSaveError(SAVE_ERROR)
      setBusy(false)
    }
  }

  if (book && confirmingDelete) {
    return (
      <div className="space-y-4">
        <div>
          <h2 id="book-dialog-heading" className="text-xl font-bold">
            Delete “{book.title}”?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The book is removed from your shelf.{' '}
            {deletesQuestions > 0 ? (
              <>
                <span className="font-semibold text-foreground">
                  {deletesQuestions} question{deletesQuestions === 1 ? '' : 's'} that {deletesQuestions === 1 ? 'is' : 'are'} only in this book will be deleted too.
                </span>{' '}
                To keep {deletesQuestions === 1 ? 'it' : 'them'}, merge this book into another one instead.{' '}
              </>
            ) : (
              'Its questions stay in their subjects or your other books, so nothing else is lost. '
            )}
            {book.publishedAt && 'It also leaves Community; classmates who already added it keep their copies.'}
          </p>
        </div>
        {saveError && (
          <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
            {saveError}
          </p>
        )}
        {/* "Keep" comes first so it gets the focus. */}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg" onClick={() => setConfirmingDelete(false)}>
            Keep it
          </Button>
          <Button type="button" disabled={busy} className="h-11 flex-1 rounded-lg bg-wrong text-white hover:bg-wrong/90" onClick={() => void handleDelete()}>
            {busy ? 'Deleting…' : 'Delete book'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="book-dialog-heading" className="font-heading text-lg font-bold">
          {book ? 'Edit book' : 'New book'}
        </h2>
        <CloseButton onClick={onClose} />
      </div>

      {/* A preview of the cover, so she sees how it will look on the shelf (same look as Bookshelf's Cover) */}
      <div aria-hidden className="flex justify-center">
        <span className="relative flex h-[7.5rem] w-[5.5rem] flex-col items-center overflow-hidden rounded-l-[3px] rounded-r-lg border border-primary/15 bg-card px-2 pt-2.5 pb-2 pl-4 text-primary-deep shadow-[0_8px_16px_-10px_rgb(7_71_94/0.55)]">
          {/* the binder's spine in the chosen color */}
          <span className="absolute inset-y-0 left-0 w-2.5 transition-colors" style={{ background: BOOK_SPINE[color] }} />
          <span className="relative line-clamp-2 w-full text-center font-heading text-xs leading-tight font-bold tracking-wide uppercase">{title.trim() || 'Your book'}</span>
          <span className="relative flex flex-1 items-center">
            <span
              className="flex size-10 items-center justify-center rounded-full border-2 bg-secondary/60 font-heading text-xl font-black transition-colors"
              style={{ borderColor: BOOK_SPINE[color], color: BOOK_SPINE[color] }}
            >
              {(title.trim().charAt(0) || '?').toUpperCase()}
            </span>
          </span>
        </span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="book-title" className="font-bold">
          Name
        </Label>
        <input
          id="book-title"
          autoFocus
          value={title}
          maxLength={BOOK_TITLE_MAX + 20}
          placeholder="e.g. Pre-board week 3"
          onChange={(e) => {
            setTitle(e.target.value)
            setTitleError(null)
          }}
          aria-invalid={Boolean(titleError)}
          aria-describedby={titleError ? 'book-title-error' : undefined}
          className="h-11 w-full rounded-lg border border-input bg-card px-3 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-wrong"
        />
        {titleError && (
          <p id="book-title-error" className="text-sm font-semibold text-wrong">
            {titleError}
          </p>
        )}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 font-bold">Color</legend>
        <div className="flex flex-wrap gap-2">
          {BOOK_COLORS.map((c) => (
            <label key={c} className="relative flex size-11 cursor-pointer items-center justify-center rounded-full has-focus-visible:ring-3 has-focus-visible:ring-ring/50" style={{ background: BOOK_SPINE[c] }}>
              <input type="radio" name="book-color" checked={color === c} onChange={() => setColor(c)} className="sr-only" />
              <span className="sr-only">{c}</span>
              {color === c && <Check className="size-5 text-white" aria-hidden />}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Which library it stands in. A full one can't be picked (unless the book is already there). */}
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 font-bold">Library</legend>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {libraries.names.map((name, i) => {
            const slot = i + 1
            const ok = fits(slot)
            return (
              <label
                key={slot}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                  !ok ? 'cursor-not-allowed opacity-50' : library === slot ? 'cursor-pointer border-primary bg-primary text-white' : 'cursor-pointer bg-card hover:border-primary/50',
                )}
              >
                <input type="radio" name="book-library" checked={library === slot} disabled={!ok} onChange={() => setLibrary(slot)} className="sr-only" />
                {library === slot && <Check className="size-4 shrink-0" aria-hidden />}
                <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
                {!ok && <span className="shrink-0 text-xs">Full</span>}
              </label>
            )
          })}
        </div>
      </fieldset>

      {book && <ShareSwitch book={book} />}

      {noRoomAnywhere && (
        <p role="alert" className="rounded-md bg-highlight-soft px-3 py-2 text-sm font-semibold">
          All three libraries are full. Delete a book you don’t need anymore to make room.
        </p>
      )}

      {saveError && (
        <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
          {saveError}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button type="submit" disabled={busy || noRoomAnywhere} className={cn('h-11 flex-1 rounded-lg bg-primary font-heading font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60', focusRing)}>
          {busy ? 'Saving…' : book ? 'Save' : 'Put it on the shelf'}
        </button>
        {book && onMergeRequest && (
          <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg" onClick={onMergeRequest}>
            <Combine className="size-4" aria-hidden />
            Merge into…
          </Button>
        )}
        {book && (
          <Button type="button" variant="ghost" className="h-11 flex-1 rounded-lg text-wrong hover:bg-wrong-soft hover:text-wrong" onClick={() => setConfirmingDelete(true)}>
            Delete book
          </Button>
        )}
      </div>
    </form>
  )
}

/** Messages merge_books raises on purpose (migration 0012): written for her, so they're shown as they are. */
const MERGE_MESSAGES = ['Pick a different book to merge into.', 'Book not found.', 'Keep the topic name to 40 letters or fewer.']

/**
 * Merge one of her books into another: all its questions go into the other book under one topic
 * (its name, which she can change), then it's removed from the shelf. Opened by dropping a book on another
 * one on the shelf (`target` already picked), or from Edit book (she picks the target here).
 */
export function MergeBookDialog({
  open,
  onClose,
  source,
  target,
  books,
  questions,
  onMerged,
}: {
  open: boolean
  onClose: () => void
  source: Book | null
  /** the book it was dropped on; null = she picks one in the dialog */
  target: Book | null
  /** all her books (the ones it can go into are picked from these) */
  books: Book[]
  /** every question she can see, for the duplicate check between the two books */
  questions: readonly MergeQuestion[]
  onMerged: (targetId: string) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="merge-dialog-heading" variant="sheet" closeOnBackdrop={false}>
      {/* key: every merge starts fresh (the topic name comes from the book being merged) */}
      {open && source && <MergeForm key={`${source.id}-${target?.id ?? ''}`} source={source} target={target} books={books} questions={questions} onClose={onClose} onMerged={onMerged} />}
    </Dialog>
  )
}

/** What the merge's duplicate check needs to know about a question. */
type MergeQuestion = { id: string; stem: string; owner_id: string | null }

function MergeForm({
  source,
  target,
  books,
  questions,
  onClose,
  onMerged,
}: {
  source: Book
  target: Book | null
  books: Book[]
  questions: readonly MergeQuestion[]
  onClose: () => void
  onMerged: (targetId: string) => void
}) {
  const refreshBooks = useRefreshBooks()
  const refreshCommunity = useRefreshCommunity()
  const refreshBank = useRefreshBank()
  const [targetId, setTargetId] = useState<string | null>(target?.id ?? null)
  const [topic, setTopic] = useState(() => mergeTopicName(source.title))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const others = books.filter((b) => b.id !== source.id)
  const chosen = others.find((b) => b.id === targetId) ?? null

  // ---------- Duplicates: questions coming in that look like ones already in the other book ----------
  // Only her own questions move (built-in ones stay in their subjects), so only those are checked.
  const incoming = questions.filter((q) => q.owner_id !== null && source.questionIds.has(q.id))
  const existing = chosen ? questions.filter((q) => chosen.questionIds.has(q.id)) : []
  const duplicates = chosen ? findMergeDuplicates(incoming, existing) : []
  // Which ones she's skipping. The same ones start ticked, alike ones don't; picking another book starts over.
  const [skipChoice, setSkipChoice] = useState<{ targetId: string; ids: Set<string> } | null>(null)
  const skipped = chosen && skipChoice?.targetId === chosen.id ? skipChoice.ids : new Set(duplicates.filter((d) => d.exact).map((d) => d.incomingId))
  function toggleSkip(id: string) {
    if (!chosen) return
    const next = new Set(skipped)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSkipChoice({ targetId: chosen.id, ids: next })
  }
  // How many will actually go in: hers, not already in the other book, not skipped.
  const count = incoming.filter((q) => !(chosen?.questionIds.has(q.id) ?? false) && !skipped.has(q.id)).length

  async function handleMerge(event: FormEvent) {
    event.preventDefault()
    if (!chosen) return
    const cleaned = cleanChapter(topic)
    if ('error' in cleaned) {
      setError(cleaned.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await mergeBooks(source.id, chosen.id, cleaned.chapter, [...skipped])
      refreshBooks()
      if (skipped.size > 0) refreshBank() // skipped duplicates that lived only in the merged book are deleted
      if (source.publishedAt) refreshCommunity() // it left Community
      onMerged(chosen.id)
      onClose()
    } catch (e) {
      const message = (e as { message?: string } | null)?.message ?? ''
      setError(MERGE_MESSAGES.includes(message) ? message : SAVE_ERROR)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleMerge(e)} noValidate className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 id="merge-dialog-heading" className="font-heading text-lg leading-snug font-bold">
          {chosen ? `Merge “${source.title}” into “${chosen.title}”?` : `Merge “${source.title}” into…`}
        </h2>
        <CloseButton onClick={onClose} />
      </div>

      {/* From Edit book: pick the book it goes into */}
      {!target && (
        <fieldset className="min-w-0">
          <legend className="mb-1.5 font-bold">Into which book?</legend>
          {others.length === 0 ? (
            <p className="text-sm text-muted-foreground">You don’t have another book to merge it into.</p>
          ) : (
            <ul className="binder-scroll max-h-[32dvh] space-y-1.5 overflow-y-auto pr-1">
              {others.map((b) => (
                <li key={b.id}>
                  <label
                    className={cn(
                      'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                      targetId === b.id ? 'border-primary bg-primary/5' : 'bg-card hover:border-primary/50',
                    )}
                  >
                    <input type="radio" name="merge-target" checked={targetId === b.id} onChange={() => setTargetId(b.id)} className="size-5 shrink-0 accent-primary" />
                    <span aria-hidden className="h-7 w-2.5 shrink-0 rounded-[2px]" style={{ background: BOOK_SPINE[b.color] }} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{b.title}</span>
                    <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{b.questionIds.size}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="merge-topic" className="font-bold">
          {chosen ? `Topic in ${chosen.title}` : 'Topic name'}
        </Label>
        <input
          id="merge-topic"
          value={topic}
          maxLength={CHAPTER_MAX + 20}
          placeholder="Empty = no topic"
          onChange={(e) => {
            setTopic(e.target.value)
            setError(null)
          }}
          aria-describedby="merge-summary"
          className="h-11 w-full rounded-lg border border-input bg-card px-3 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {/* ---------- Possible duplicates: the same ones ticked (skipped), alike ones for her to decide ---------- */}
      {chosen && duplicates.length > 0 && (
        <fieldset className="min-w-0 rounded-lg border border-highlight/50 bg-highlight-soft/50 p-3">
          <legend className="sr-only">Possible duplicates</legend>
          <p aria-hidden className="flex items-center gap-1.5 font-bold">
            <TriangleAlert className="size-4 shrink-0" />
            {duplicates.length} question{duplicates.length === 1 ? ' looks' : 's look'} like {duplicates.length === 1 ? 'one' : 'ones'} already in {chosen.title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Ticked ones are skipped. Tap a question to compare.</p>
          <ul className="binder-scroll mt-2 max-h-[28dvh] space-y-1.5 overflow-y-auto pr-1">
            {duplicates.map((d) => (
              <li key={d.incomingId} className="flex items-start gap-2.5 rounded-md bg-card px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={skipped.has(d.incomingId)}
                  onChange={() => toggleSkip(d.incomingId)}
                  disabled={busy}
                  aria-label={`Skip: ${d.incomingStem}`}
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                />
                <details className="group min-w-0 flex-1">
                  <summary className="cursor-pointer list-none rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
                    <span className={cn('mr-1.5 inline-block rounded-full px-1.5 text-[11px] font-bold', d.exact ? 'bg-wrong-soft text-wrong' : 'bg-secondary text-foreground')}>
                      {d.exact ? 'Same' : `${Math.round(d.score * 100)}% alike`}
                    </span>
                    <span className="text-sm font-semibold group-open:font-bold">{d.incomingStem}</span>
                  </summary>
                  <p className="mt-1.5 border-l-2 border-primary/30 pl-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Already in {chosen.title}:</span> {d.existingStem}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <div id="merge-summary" className="space-y-1.5 text-sm text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground tabular-nums">
            {count} question{count === 1 ? '' : 's'}
          </span>{' '}
          go into {chosen ? <span className="font-semibold text-foreground">{chosen.title}</span> : 'the book you pick'}
          {topic.trim() ? <> under the topic “{topic.trim()}”</> : ' with no topic'}
          {skipped.size > 0 && <> · {skipped.size} skipped</>}. Ones already in it stay where they are.
          {/* merge_books gives the target's untopiced questions the target's name, so both sides can be split again */}
          {chosen && [...chosen.chapters.values()].some((c) => c === null) && (
            <>
              {' '}
              {chosen.title}’s questions without a topic go under “{mergeTopicName(chosen.title)}”.
            </>
          )}
        </p>
        <p>
          “{source.title}” will be removed from your shelf. Its questions are kept
          {skipped.size > 0 ? ', except skipped duplicates that are only in it.' : '.'}
          {source.publishedAt && ' It also leaves Community; classmates who added it keep their copies.'}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
          {error}
        </p>
      )}

      {/* "Cancel" is first in the code, so it gets the focus; Merge sits on the right / bottom for the thumb. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg" onClick={onClose}>
          Cancel
        </Button>
        <button type="submit" disabled={busy || !chosen} className={cn('h-11 flex-1 rounded-lg bg-primary font-heading font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60', focusRing)}>
          {busy ? 'Merging…' : 'Merge books'}
        </button>
      </div>
    </form>
  )
}

/** Messages split_topic raises on purpose (migration 0016): written for her, so they're shown as they are. */
const SPLIT_MESSAGES = [
  'Book not found.',
  'Pick a topic first.',
  'Pick one of your libraries.',
  'This topic has no questions of yours to move.',
  'This topic is already the whole book.',
  'That library is full. Pick another one or make room first.',
]

/**
 * A topic in one of her books becomes its own book (the opposite of merging). Her questions under it leave this
 * book and go into a new book named after the topic, in the library she picks.
 */
export function SplitTopicDialog({
  open,
  onClose,
  book,
  chapter,
  libraries,
  onDone,
}: {
  open: boolean
  onClose: () => void
  book: Book
  /** the topic to move out; null when no topic is chosen */
  chapter: string | null
  libraries: LibraryChoice
  onDone: (newBookId: string) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="split-dialog-heading" variant="sheet" closeOnBackdrop={false}>
      {open && chapter !== null && <SplitForm key={`${book.id}-${chapter}`} book={book} chapter={chapter} libraries={libraries} onClose={onClose} onDone={onDone} />}
    </Dialog>
  )
}

function SplitForm({ book, chapter, libraries, onClose, onDone }: { book: Book; chapter: string; libraries: LibraryChoice; onClose: () => void; onDone: (newBookId: string) => void }) {
  const refreshBooks = useRefreshBooks()
  const refreshCommunity = useRefreshCommunity()
  const fits = (slot: number) => (libraries.roomLeft[slot - 1] ?? 0) > 0
  const firstWithRoom = libraries.names.map((_, i) => i + 1).find(fits) ?? 0 // 0 = all full
  const [library, setLibrary] = useState(fits(book.library) ? book.library : firstWithRoom || book.library)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const count = [...book.chapters.values()].filter((c) => c === chapter).length
  // What's left in this book: if it's just one topic, this book takes that topic's name (like split_topic does).
  const left = chapterList(new Map([...book.chapters].filter(([, c]) => c !== chapter)))
  const leftName = left.chapters.length === 1 && left.unfiled === 0 ? left.chapters[0].name : null

  async function handleSplit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = await splitTopic(book.id, chapter, library)
      refreshBooks()
      refreshCommunity() // it may be linked to its Community original again ("Already in your library")
      onDone(id)
      onClose()
    } catch (e) {
      const message = (e as { message?: string } | null)?.message ?? ''
      setError(SPLIT_MESSAGES.includes(message) ? message : SAVE_ERROR)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSplit(e)} noValidate className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 id="split-dialog-heading" className="font-heading text-lg leading-snug font-bold">
          Move “{chapter}” to its own book?
        </h2>
        <CloseButton onClick={onClose} />
      </div>

      <div className="space-y-1.5 text-sm text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground tabular-nums">
            {count} question{count === 1 ? '' : 's'}
          </span>{' '}
          leave <span className="font-semibold text-foreground">{book.title}</span> and become a new book named{' '}
          <span className="font-semibold text-foreground">“{chapter}”</span>.
          {leftName && leftName !== book.title && (
            <>
              {' '}
              What’s left here becomes <span className="font-semibold text-foreground">“{leftName}”</span>.
            </>
          )}
        </p>
        <p>If a book’s questions all came from one classmate and none were edited, it shows their name again.</p>
      </div>

      <fieldset>
        <legend className="mb-1.5 font-bold">Put it in</legend>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {libraries.names.map((name, i) => {
            const slot = i + 1
            const ok = fits(slot)
            return (
              <label
                key={slot}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                  !ok ? 'cursor-not-allowed opacity-50' : library === slot ? 'cursor-pointer border-primary bg-primary text-white' : 'cursor-pointer bg-card hover:border-primary/50',
                )}
              >
                <input type="radio" name="split-library" checked={library === slot} disabled={!ok || busy} onChange={() => setLibrary(slot)} className="sr-only" />
                {library === slot && ok && <Check className="size-4 shrink-0" aria-hidden />}
                <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
                {!ok && <span className="shrink-0 text-xs">Full</span>}
              </label>
            )
          })}
        </div>
      </fieldset>

      {firstWithRoom === 0 && (
        <p role="alert" className="rounded-md bg-highlight-soft px-3 py-2 text-sm font-semibold">
          All three libraries are full. Delete or merge a book to make room.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg" onClick={onClose}>
          Cancel
        </Button>
        <button
          type="submit"
          disabled={busy || firstWithRoom === 0}
          className={cn('h-11 flex-1 rounded-lg bg-primary font-heading font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60', focusRing)}
        >
          {busy ? 'Making the book…' : 'Make the book'}
        </button>
      </div>
    </form>
  )
}

/**
 * "Share to Community" in Edit book. It saves right away (not with Save), like a phone's settings switch,
 * so she can turn it on or off without touching the rest of the form.
 */
function ShareSwitch({ book }: { book: Book }) {
  const refreshCommunity = useRefreshCommunity()
  const [shared, setShared] = useState(book.publishedAt !== null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const empty = book.questionIds.size === 0
  // An empty book can't be shared, but if it somehow is, she can still turn it off.
  const disabled = busy || (empty && !shared)

  async function toggle() {
    const next = !shared
    setBusy(true)
    setError(null)
    try {
      await setBookShared(book.id, next)
      setShared(next)
      refreshCommunity()
    } catch (e) {
      setError(communityErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-start gap-3">
        <Users className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p id={`share-${book.id}`} className="font-bold">
            Share to Community
          </p>
          <p id={`share-hint-${book.id}`} className="text-sm text-muted-foreground">
            {empty && !shared
              ? 'Add at least one question first.'
              : shared
                ? 'Everyone with a ProjectRMT account can see it and add their own copy.'
                : 'Only you can see this book.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={shared}
          aria-labelledby={`share-${book.id}`}
          aria-describedby={`share-hint-${book.id}`}
          disabled={disabled}
          onClick={() => void toggle()}
          className={cn(
            'relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50',
            focusRing,
            shared ? 'bg-primary' : 'bg-muted-foreground/40',
          )}
        >
          <span className={cn('absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform', shared && 'translate-x-5')} />
        </button>
      </div>
      {shared && <p className="text-xs text-muted-foreground">If you stop sharing later, classmates who already added it keep their copies.</p>}
      {error && (
        <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * "Add to book" on a question: where it lives.
 * - Her books: a checkbox each (a question can be in several). Ticking puts it in right away; unticking takes it out.
 * - Subject books: one only (a question has one topic). Picking a subject shows its topics; picking a topic moves the
 *   question there right away (it then counts in that subject's score and quizzes). "Book only" takes it out of the
 *   subjects again (only while it's in one of her books, so it's never left nowhere).
 * Built-in questions always stay in their subject: the dialog just says where (Edit changes the topic).
 */
export function AddToBookDialog({
  open,
  onClose,
  question,
  books,
  openBook = null,
  onNewBook,
}: {
  open: boolean
  onClose: () => void
  question: BankQuestion
  books: Book[]
  /** the book she's looking at: it stays ticked here (taking it out of it is "Remove from book" on the question) */
  openBook?: Book | null
  /** no books yet, or she wants another: open the New book dialog */
  onNewBook: () => void
}) {
  const refreshBooks = useRefreshBooks()
  const refreshBank = useRefreshBank()
  const subjects = useSubjects()
  const topics = useTopics()
  const bookTopicId = useBookTopicId()
  const questionId = question.id
  // What's being saved right now (a book's id, or "place"), so nothing can be double-tapped.
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isBuiltin = question.owner_id === null
  const topicList = topics.data ?? []
  const currentTopic = topicList.find((t) => t.id === question.topic_id)
  // The subject it's in now (null = book only).
  const currentSubjectId = question.in_subject ? (currentTopic?.subject_id ?? null) : null
  // The subject she's looking at (its topics show under it); starts on the one it's in.
  const [openSubjectId, setOpenSubjectId] = useState<number | null>(currentSubjectId)
  const inAnyBook = books.some((b) => b.questionIds.has(questionId))
  // A book-only question has to stay in at least one book, or it would be in nothing at all.
  const onlyBook = !question.in_subject && books.filter((b) => b.questionIds.has(questionId)).length === 1

  async function run(key: string, action: () => Promise<void>) {
    setSaving(key)
    setError(null)
    try {
      await action()
      refreshBooks()
      refreshBank()
    } catch {
      setError(SAVE_ERROR)
    } finally {
      setSaving(null)
    }
  }

  function toggleBook(book: Book) {
    void run(book.id, () => (book.questionIds.has(questionId) ? removeFromBook(book.id, questionId) : addToBook(book.id, [questionId])))
  }

  function placeInTopic(topicId: number) {
    void run('place', () => setQuestionPlace(questionId, topicId, true))
  }

  function makeBookOnly() {
    if (bookTopicId === null) return
    setOpenSubjectId(null)
    void run('place', () => setQuestionPlace(questionId, bookTopicId, false))
  }

  const sectionTitle = 'mb-1.5 flex items-baseline justify-between gap-2 font-heading text-xs font-bold tracking-[0.15em] text-muted-foreground uppercase'
  const row = 'flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40'

  return (
    <Dialog open={open} onClose={onClose} labelledBy={`add-to-book-${questionId}`} variant="sheet" size="lg" closeOnBackdrop={false}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id={`add-to-book-${questionId}`} className="font-heading text-lg font-bold">
            Add to book
          </h2>
          <CloseButton onClick={onClose} />
        </div>

        <div className="binder-scroll max-h-[60dvh] space-y-5 overflow-y-auto pr-1">
          {/* ---------- Her books: any number ---------- */}
          <fieldset className="min-w-0">
            <legend className={cn(sectionTitle, 'w-full')}>
              Your books <span className="font-sans text-[11px] font-semibold tracking-normal normal-case">any number</span>
            </legend>
            {books.length === 0 ? (
              <p className="text-sm text-muted-foreground">You don’t have any books yet. Make one with “New book”.</p>
            ) : (
              <ul className="space-y-1.5">
                {books.map((b) => {
                  const inBook = b.questionIds.has(questionId)
                  // Locked: the book she's in right now, or the only home of a book-only question.
                  const isOpenBook = b.id === openBook?.id
                  const locked = inBook && (isOpenBook || onlyBook)
                  return (
                    <li key={b.id}>
                      <label className={cn(row, locked ? 'cursor-default' : 'cursor-pointer', inBook ? 'border-primary bg-primary/5' : 'bg-card hover:border-primary/50')}>
                        <input type="checkbox" checked={inBook} disabled={saving !== null || locked} onChange={() => toggleBook(b)} className="size-5 shrink-0 accent-primary" />
                        <span aria-hidden className="h-7 w-2.5 shrink-0 rounded-[2px]" style={{ background: BOOK_SPINE[b.color] }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{b.title}</span>
                          {locked && (
                            <span className="block text-xs text-muted-foreground">
                              {isOpenBook ? 'This book · to take it out, use “Remove from book”' : 'Its only book · add it to a subject or another book first'}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{saving === b.id ? 'Saving…' : b.questionIds.size}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </fieldset>

          {/* ---------- Subject books: one only ---------- */}
          <fieldset className="min-w-0">
            <legend className={cn(sectionTitle, 'w-full')}>
              Subject books <span className="font-sans text-[11px] font-semibold tracking-normal normal-case">one only</span>
            </legend>
            {isBuiltin ? (
              <p className="rounded-lg border bg-card px-3 py-2.5 text-sm">
                In{' '}
                <span className="font-semibold">
                  {subjects.data?.find((s) => s.id === currentTopic?.subject_id)?.code} · {currentTopic?.name}
                </span>
                . Built-in questions stay in their subject; use Edit to change the topic.
              </p>
            ) : (
              <div className="space-y-3">
                {/* where it is now, in one line */}
                <p className="text-sm text-muted-foreground">
                  {currentSubjectId === null ? (
                    'Now only in your books.'
                  ) : (
                    <>
                      Now in{' '}
                      <span className="font-semibold text-foreground">
                        {subjects.data?.find((s) => s.id === currentSubjectId)?.code} · {currentTopic?.name}
                      </span>
                      .
                    </>
                  )}
                </p>
                {/* one subject (or none): short chips, like Add a question */}
                <div className="flex flex-wrap gap-2">
                  <ChipRadio
                    name={`subject-${questionId}`}
                    checked={openSubjectId === null}
                    disabled={saving !== null || !inAnyBook || bookTopicId === null}
                    title={inAnyBook ? 'Only in your books, not in a subject' : 'Put it in one of your books first'}
                    onChange={makeBookOnly}
                  >
                    Book only
                  </ChipRadio>
                  {(subjects.data ?? []).map((s) => (
                    <ChipRadio key={s.id} name={`subject-${questionId}`} title={s.name} checked={openSubjectId === s.id} disabled={saving !== null} onChange={() => setOpenSubjectId(s.id)}>
                      {s.code}
                      <span className="sr-only">{s.name}</span>
                    </ChipRadio>
                  ))}
                </div>
                {!inAnyBook && currentSubjectId !== null && (
                  <p className="text-xs text-muted-foreground">“Book only” needs it to be in one of your books first.</p>
                )}
                {/* the chosen subject's topics: picking one moves the question there. min-w-0 lets the chips wrap. */}
                {openSubjectId !== null && (
                  <fieldset key={openSubjectId} className="animate-in fade-in min-w-0 rounded-lg bg-secondary/40 p-3 duration-200">
                    <legend className="sr-only">Topic in {subjects.data?.find((s) => s.id === openSubjectId)?.name}</legend>
                    <p aria-hidden className="mb-2 text-xs font-semibold text-muted-foreground">
                      {saving === 'place'
                        ? 'Saving…'
                        : openSubjectId === currentSubjectId
                          ? `${subjects.data?.find((s) => s.id === openSubjectId)?.name}: tap another topic to move it`
                          : `${subjects.data?.find((s) => s.id === openSubjectId)?.name}: pick a topic to add it here`}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {topicList
                        .filter((t) => t.subject_id === openSubjectId)
                        .map((t) => (
                          <ChipRadio
                            key={t.id}
                            name={`topic-${questionId}`}
                            checked={question.in_subject && question.topic_id === t.id}
                            disabled={saving !== null}
                            onChange={() => placeInTopic(t.id)}
                          >
                            {t.name}
                          </ChipRadio>
                        ))}
                    </div>
                  </fieldset>
                )}
              </div>
            )}
          </fieldset>
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" onClick={onClose} className={cn('h-11 flex-1 rounded-lg bg-primary font-heading font-bold text-primary-foreground hover:bg-primary/90', focusRing)}>
            Done
          </button>
          <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg" onClick={onNewBook}>
            <Plus className="size-4" aria-hidden />
            New book
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Rename one of the three libraries. */
export function LibraryDialog({ open, onClose, slot, name }: { open: boolean; onClose: () => void; slot: number; name: string }) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="library-dialog-heading" variant="sheet" closeOnBackdrop={false}>
      {/* key: opening it again starts from the current name */}
      {open && <LibraryForm key={`${slot}-${name}`} slot={slot} name={name} onClose={onClose} />}
    </Dialog>
  )
}

function LibraryForm({ slot, name, onClose }: { slot: number; name: string; onClose: () => void }) {
  const refreshBooks = useRefreshBooks()
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const cleaned = cleanLibraryName(value)
    if ('error' in cleaned) {
      setError(cleaned.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await renameLibrary(slot, cleaned.title)
      refreshBooks()
      onClose()
    } catch {
      setError(SAVE_ERROR)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="library-dialog-heading" className="font-heading text-lg font-bold">
          Rename library
        </h2>
        <CloseButton onClick={onClose} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="library-name-input" className="font-bold">
          Name
        </Label>
        <input
          id="library-name-input"
          autoFocus
          value={value}
          maxLength={LIBRARY_NAME_MAX + 20}
          placeholder="e.g. Pre-boards"
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'library-name-error' : undefined}
          className="h-11 w-full rounded-lg border border-input bg-card px-3 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-wrong"
        />
        {error && (
          <p id="library-name-error" role="alert" className="text-sm font-semibold text-wrong">
            {error}
          </p>
        )}
      </div>
      <button type="submit" disabled={busy} className={cn('h-11 w-full rounded-lg bg-primary font-heading font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60', focusRing)}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}

/** Move a question to another chapter of a book: type a new name, pick an existing one, or leave it empty for none. */
export function ChapterDialog({ open, onClose, book, questionId }: { open: boolean; onClose: () => void; book: Book; questionId: string }) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy={`chapter-dialog-${questionId}`} variant="sheet" closeOnBackdrop={false}>
      {/* key: opening it again starts from the question's current chapter */}
      {open && <ChapterForm key={book.chapters.get(questionId) ?? ''} book={book} questionId={questionId} onClose={onClose} />}
    </Dialog>
  )
}

function ChapterForm({ book, questionId, onClose }: { book: Book; questionId: string; onClose: () => void }) {
  const refreshBooks = useRefreshBooks()
  const [value, setValue] = useState(book.chapters.get(questionId) ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const existing = chapterList(book.chapters).chapters

  async function save(raw: string) {
    const cleaned = cleanChapter(raw)
    if ('error' in cleaned) {
      setError(cleaned.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setChapter(book.id, questionId, cleaned.chapter)
      refreshBooks()
      onClose()
    } catch {
      setError(SAVE_ERROR)
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save(value)
      }}
      noValidate
      className="space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={`chapter-dialog-${questionId}`} className="font-heading text-lg font-bold">
          Topic in {book.title}
        </h2>
        <CloseButton onClick={onClose} />
      </div>

      {/* one tap on a chapter she already has */}
      {existing.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {existing.map((c) => (
            <button
              key={c.name}
              type="button"
              disabled={busy}
              onClick={() => void save(c.name)}
              className={cn(
                'inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors',
                focusRing,
                c.name === book.chapters.get(questionId) ? 'border-primary bg-primary text-white' : 'bg-card hover:border-primary/50',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`chapter-input-${questionId}`} className="font-bold">
          {existing.length > 0 ? 'Or type a new one' : 'Topic name'}
        </Label>
        <input
          id={`chapter-input-${questionId}`}
          autoFocus={existing.length === 0}
          value={value}
          maxLength={CHAPTER_MAX + 20}
          placeholder="e.g. Enzymes (empty = no topic)"
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          aria-invalid={Boolean(error)}
          className="h-11 w-full rounded-lg border border-input bg-card px-3 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-wrong"
        />
        {error && (
          <p role="alert" className="text-sm font-semibold text-wrong">
            {error}
          </p>
        )}
      </div>
      <button type="submit" disabled={busy} className={cn('h-11 w-full rounded-lg bg-primary font-heading font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60', focusRing)}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
