import { BookOpen, Check, CircleCheck, Search, TriangleAlert, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/dashboard'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { BOOK_SPINE, libraryNames as defaultLibraryNames, roomLeft } from '@/lib/books'
import { communityErrorMessage, filterCommunityBooks, sortCommunityBooks, subjectsInUse, timesAddedLabel, type CommunityBook, type CommunitySort } from '@/lib/community'
import { findMergeDuplicates, makePlaceOf, type MergeDuplicate } from '@/lib/mergeDuplicates'
import { BOOK_SUBJECT_CODE, useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { useQuestionBank } from '@/features/questions/api'
import { ChipRadio } from '@/features/questions/QuestionFormParts'
import { useBooks, useLibraryNames } from '@/features/questions/booksApi'
import { addCommunityBook, useCommunityBooks, useCommunityPreview, useCommunityStems, useRefreshCommunity } from './api'

// The Community shelf (migration 0010): books that classmates shared. Tap one to peek inside, then
// "Add to my library" makes her own copy. The copy is hers to keep, even if the author deletes theirs.

const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40'

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export default function CommunityPage() {
  const community = useCommunityBooks()
  const subjects = useSubjects()
  const books = useBooks()
  const libraries = useLibraryNames()

  if (community.isPending || subjects.isPending || books.isPending || libraries.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (community.isError || subjects.isError || books.isError) {
    return <FullPageMessage>Couldn’t load Community. Check your internet connection, then refresh. (If you just updated the app, run supabase/migrations/0010_community.sql in Supabase first.)</FullPageMessage>
  }

  // Room left in each of her libraries, for the picker when adding a book.
  const names = libraries.data ?? defaultLibraryNames([])
  const room = names.map((_, i) => roomLeft(i + 1, books.data.filter((b) => b.library === i + 1).length, subjects.data.length))

  return <CommunityView shared={community.data} subjectOrder={subjects.data.map((s) => s.code)} libraryNames={names} roomLeft={room} />
}

function CommunityView({
  shared,
  subjectOrder,
  libraryNames,
  roomLeft,
}: {
  shared: CommunityBook[]
  subjectOrder: string[]
  libraryNames: string[]
  roomLeft: number[]
}) {
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState<string | null>(null)
  const [sort, setSort] = useState<CommunitySort>('newest')
  const [openId, setOpenId] = useState<string | null>(null)

  const chips = subjectsInUse(shared, subjectOrder)
  const shown = sortCommunityBooks(filterCommunityBooks(shared, { search, subject }), sort)
  // Looked up by id, so the sheet shows fresh numbers after she adds the book.
  const open = shared.find((b) => b.id === openId) ?? null

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Community" subtitle="Books your classmates shared. Add one and it’s yours to keep." />

      {shared.length === 0 ? (
        <div className="rounded-xl border border-dashed border-primary/30 bg-card px-6 py-12 text-center">
          <Users className="mx-auto size-10 text-primary/60" aria-hidden />
          <p className="mt-3 font-heading text-lg font-bold">No shared books yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Be the first: open one of your books on the Questions shelf and tap the{' '}
            <span className="font-semibold text-foreground">Share to Community</span> button at the top, next to Upload.
          </p>
        </div>
      ) : (
        <>
          {/* ---------- Search, sort and subject ---------- */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Label htmlFor="community-search" className="sr-only">
                  Search shared books
                </Label>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="community-search"
                  type="search"
                  placeholder="Search by book or classmate"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-card pr-3 pl-9 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
              <div role="radiogroup" aria-label="Sort" className="flex shrink-0 rounded-lg border bg-card p-1">
                {(
                  [
                    ['newest', 'Newest'],
                    ['popular', 'Most added'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={sort === value}
                    onClick={() => setSort(value)}
                    className={cn('h-9 flex-1 rounded-md px-3 text-sm font-semibold transition-colors', focusRing, sort === value ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {chips.length > 0 && (
              <fieldset>
                <legend className="sr-only">Subject</legend>
                <div className="flex flex-wrap gap-2">
                  <ChipRadio name="community-subject" checked={subject === null} onChange={() => setSubject(null)}>
                    All
                  </ChipRadio>
                  {chips.map((code) => (
                    <ChipRadio key={code} name="community-subject" checked={subject === code} onChange={() => setSubject(code)}>
                      {code}
                    </ChipRadio>
                  ))}
                </div>
              </fieldset>
            )}
          </div>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {shown.length === shared.length ? plural(shared.length, 'book') : `${shown.length} of ${plural(shared.length, 'book')} match`}
          </p>

          {/* ---------- The books ---------- */}
          {shown.length === 0 ? (
            <p className="rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground">No books match. Try a different search or subject.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((b) => (
                <li key={b.id}>
                  <BookCard book={b} onOpen={() => setOpenId(b.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog open={open !== null} onClose={() => setOpenId(null)} labelledBy="community-book-heading" variant="sheet" size="lg" closeOnBackdrop={false}>
        {/* key: another book starts fresh (no leftover "Added" or error) */}
        {open && <BookSheet key={open.id} book={open} libraryNames={libraryNames} roomLeft={roomLeft} onClose={() => setOpenId(null)} />}
      </Dialog>
    </div>
  )
}

/** A shared book's cover: the same white lab binder as the shelf, its color on the spine. */
function MiniCover({ book, className }: { book: Pick<CommunityBook, 'title' | 'color'>; className?: string }) {
  const color = BOOK_SPINE[book.color]
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex flex-col items-center overflow-hidden rounded-l-[3px] rounded-r-lg border border-primary/15 bg-card px-2 pt-2.5 pb-2 pl-4 text-primary-deep shadow-[0_8px_16px_-10px_rgb(7_71_94/0.55)]',
        className,
      )}
    >
      <span className="absolute inset-y-0 left-0 w-2.5" style={{ background: color }} />
      <span className="relative line-clamp-2 w-full text-center font-heading text-xs leading-tight font-bold tracking-wide uppercase">{book.title}</span>
      <span className="relative flex flex-1 items-center">
        <span className="flex size-10 items-center justify-center rounded-full border-2 bg-secondary/60 font-heading text-xl font-black" style={{ borderColor: color, color }}>
          {book.title.charAt(0).toUpperCase()}
        </span>
      </span>
    </span>
  )
}

function BookCard({ book, onOpen }: { book: CommunityBook; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={cn('group flex w-full flex-col items-center gap-2.5 rounded-xl p-2 text-center hover:bg-card/70', focusRing)}>
      <span className="relative">
        <MiniCover book={book} className="h-[9.5rem] w-28 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-y-1.5 group-hover:-rotate-2" />
        {(book.isMine || book.myCopyId) && (
          <span className="absolute -top-2 -right-3 inline-flex items-center gap-0.5 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white shadow">
            {book.isMine ? 'Yours' : <><Check className="size-3" aria-hidden /> Added</>}
          </span>
        )}
      </span>
      <span className="w-full min-w-0">
        <span className="line-clamp-2 font-semibold leading-snug">{book.title}</span>
        <span className="block truncate text-sm text-muted-foreground">by {book.authorName}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          {plural(book.questionCount, 'question')} · {timesAddedLabel(book.timesAdded)}
        </span>
      </span>
    </button>
  )
}

/** One shared book, up close: what's in it, then "Add to my library" at the bottom (the thumb's reach on an iPad). */
function BookSheet({ book, libraryNames, roomLeft, onClose }: { book: CommunityBook; libraryNames: string[]; roomLeft: number[]; onClose: () => void }) {
  const preview = useCommunityPreview(book.id)
  // The duplicate check only matters while she can still add it (not her own book, not added yet).
  const canAdd = !book.isMine && !book.myCopyId
  const duplicates = useAddDuplicates(canAdd ? book.id : null)
  const refreshCommunity = useRefreshCommunity()
  const firstWithRoom = roomLeft.findIndex((n) => n > 0) + 1 // 0 = every library is full
  const [library, setLibrary] = useState(firstWithRoom || 1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addedId, setAddedId] = useState<string | null>(null)

  async function handleAdd() {
    setBusy(true)
    setError(null)
    try {
      const id = await addCommunityBook(book.id, library)
      setAddedId(id)
      refreshCommunity()
    } catch (e) {
      setError(communityErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const copyId = addedId ?? book.myCopyId

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <MiniCover book={book} className="h-[7.5rem] w-[5.5rem] shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="community-book-heading" className="font-heading text-xl leading-tight font-bold">
            {book.title}
          </h2>
          <p className="text-sm text-muted-foreground">by {book.authorName}</p>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {plural(book.questionCount, 'question')} · {timesAddedLabel(book.timesAdded)}
          </p>
          {book.subjectCodes.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {book.subjectCodes.map((code) => (
                <span key={code} className="rounded-full bg-secondary px-2 py-px font-heading text-xs font-bold">
                  {code}
                </span>
              ))}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground', focusRing)}>
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {/* ---------- A peek inside ---------- */}
      <section aria-labelledby="community-preview-heading" className="rounded-lg border bg-card">
        <h3 id="community-preview-heading" className="border-b px-3 py-2 font-heading text-xs font-bold tracking-[0.15em] text-muted-foreground uppercase">
          A peek inside
        </h3>
        {preview.isPending ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
        ) : preview.isError ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Couldn’t load the questions. Check your internet connection.</p>
        ) : preview.data.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">This book has no questions right now.</p>
        ) : (
          <ol className="divide-y">
            {preview.data.map((q, i) => (
              <li key={q.id} className="flex gap-3 px-3 py-2.5">
                <span aria-hidden className="w-5 shrink-0 text-right font-heading text-sm font-bold text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  {(q.subjectCode !== BOOK_SUBJECT_CODE || q.chapter) && (
                    <span className="block text-xs text-muted-foreground">
                      {q.subjectCode !== BOOK_SUBJECT_CODE && <span className="font-heading font-bold text-foreground">{q.subjectCode}</span>}
                      {q.subjectCode !== BOOK_SUBJECT_CODE && q.chapter && ' · '}
                      {q.chapter}
                    </span>
                  )}
                  <span className="line-clamp-2 text-sm leading-snug font-semibold">{q.stem}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {book.questionCount > (preview.data?.length ?? 0) && preview.isSuccess && preview.data.length > 0 && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">…and {plural(book.questionCount - preview.data.length, 'more question')}</p>
        )}
      </section>

      {/* ---------- What she can do with it ---------- */}
      {book.isMine ? (
        <div className="space-y-3">
          <p className="rounded-md bg-secondary px-3 py-2 text-sm">
            This is your book. To stop sharing it, open it and tap the Share to Community button at the top.
          </p>
          <OpenBookLink id={book.id} label="Open your book" />
        </div>
      ) : copyId ? (
        <div className="space-y-3">
          <p role="status" className="flex items-center gap-2 rounded-md bg-correct-soft px-3 py-2 font-semibold text-correct">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            {addedId ? `Added to ${libraryNames[library - 1]}. It’s yours to keep.` : 'Already in your library.'}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <OpenBookLink id={copyId} label="Open your copy" />
            <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg" onClick={onClose}>
              Keep browsing
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {duplicates && <DuplicateWarning check={duplicates} total={book.questionCount} />}

          {/* Which library the copy goes in. A full one can't be picked. */}
          <fieldset>
            <legend className="mb-1.5 font-bold">Put it in</legend>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {libraryNames.map((name, i) => {
                const slot = i + 1
                const ok = (roomLeft[i] ?? 0) > 0
                return (
                  <label
                    key={slot}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                      !ok ? 'cursor-not-allowed opacity-50' : library === slot ? 'cursor-pointer border-primary bg-primary text-white' : 'cursor-pointer bg-card hover:border-primary/50',
                    )}
                  >
                    <input type="radio" name="community-library" checked={library === slot} disabled={!ok || busy} onChange={() => setLibrary(slot)} className="sr-only" />
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
              All three libraries are full. Delete a book you don’t need anymore to make room.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={busy || firstWithRoom === 0}
            onClick={() => void handleAdd()}
            className={cn('flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-heading text-lg font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60', focusRing)}
          >
            {busy ? 'Adding…' : 'Add to my library'}
          </button>
          <p className="text-center text-xs text-muted-foreground">You get your own copy. It stays even if {book.authorName} changes or deletes theirs.</p>
        </div>
      )}
    </div>
  )
}

type DuplicateCheck = { status: 'checking' } | { status: 'done'; found: MergeDuplicate[] }

/**
 * The questions in a shared book that look like ones she already has (same check as merge and upload: every
 * question she has, 60% alike or more). null = no check (nothing to check, or migration 0020 isn't run yet).
 */
function useAddDuplicates(bookId: string | null): DuplicateCheck | null {
  const stems = useCommunityStems(bookId)
  const bank = useQuestionBank()
  const topics = useTopics()
  const subjects = useSubjects()
  const books = useBooks()
  if (bookId === null || stems.isError || bank.isError) return null
  if (stems.isPending || bank.isPending || topics.isPending || subjects.isPending || books.isPending) return { status: 'checking' }
  const placeOf = makePlaceOf(topics.data ?? [], subjects.data ?? [], books.data ?? [])
  const mine = bank.data.map((q) => ({ id: q.id, stem: q.stem, place: placeOf(q) }))
  return { status: 'done', found: findMergeDuplicates(stems.data, mine) }
}

/** Above "Add to my library": a heads-up, not a stop. Adding still copies every question (she decides). */
function DuplicateWarning({ check, total }: { check: DuplicateCheck; total: number }) {
  if (check.status === 'checking') {
    return <p className="text-sm text-muted-foreground">Checking for questions you already have…</p>
  }
  const found = check.found
  if (found.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleCheck className="size-4 shrink-0 text-correct" aria-hidden />
        None of these look like questions you already have.
      </p>
    )
  }
  return (
    <section aria-labelledby="community-dupes-heading" className="min-w-0 rounded-lg border border-highlight/50 bg-highlight-soft/50 p-3">
      <h3 id="community-dupes-heading" className="flex items-center gap-1.5 font-bold">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        <span className="tabular-nums">
          {found.length} of {plural(total, 'question')}
        </span>{' '}
        {found.length === 1 ? 'looks' : 'look'} like {found.length === 1 ? 'one' : 'ones'} you already have
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">They’ll still be added with the book. Tap a question to compare.</p>
      <ul className="binder-scroll mt-2 max-h-[24dvh] space-y-1.5 overflow-y-auto pr-1">
        {found.map((d) => (
          <li key={d.incomingId} className="rounded-md bg-card px-2.5 py-2">
            <details className="group min-w-0">
              <summary className="cursor-pointer list-none rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
                <span className={cn('mr-1.5 inline-block rounded-full px-1.5 text-[11px] font-bold', d.exact ? 'bg-wrong-soft text-wrong' : 'bg-secondary text-foreground')}>
                  {d.exact ? 'Same' : `${Math.round(d.score * 100)}% alike`}
                </span>
                <span className="text-sm font-semibold group-open:font-bold">{d.incomingStem}</span>
              </summary>
              <p className="mt-1.5 border-l-2 border-primary/30 pl-2 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Already in {d.existingPlace}:</span> {d.existingStem}
              </p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}

function OpenBookLink({ id, label }: { id: string; label: string }) {
  return (
    <Link
      to={`/questions?book=${id}`}
      className={cn('flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-heading font-bold text-primary-foreground hover:bg-primary/90', focusRing)}
    >
      <BookOpen className="size-4" aria-hidden />
      {label}
    </Link>
  )
}
