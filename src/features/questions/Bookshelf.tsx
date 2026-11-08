import { ChevronLeft, ChevronRight, Pencil, Plus, Star } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { LabBench } from '@/components/LabBench'
import { FieldOfView } from '@/features/flashcards/FieldOfView'
import { BOOK_SPINE, LIBRARY_COUNT, LIBRARY_SLOTS, MAX_STARS, roomLeft, starsFor, SUBJECT_COLOR } from '@/lib/books'
import type { CoverageLevel, SubjectCoverage } from '@/lib/questions'
import { cn } from '@/lib/utils'
import type { Book } from './booksApi'

// The first screen of Questions, like a game's world map: three libraries (she can rename them),
// each a wall of wooden shelves with books facing out.
// - Library 1 starts with the six subject books. Their cover art is the subject's Flashcards lens, and the
//   bars at the bottom are its topics (tall = 10 or more, short = 1 to 9, hollow = none).
// - Then her own books (migration 0004), in the library she chose for each one.
// - Stars on each book are her score on it (1★ 60%, 2★ 75%, 3★ 90%). Three stars = a gold, shining book.
//   The library's total stars sit under its name, like a world's progress.
// - Every one of the library's LIBRARY_SLOTS spots is drawn: the next free one is "New book", the rest are
//   faint outlines, like empty inventory slots.
// - Swipe the wall (or ‹ ›, or the tabs) to go to another library.
// - Tapping a book pulls it off the shelf, brings it to the middle and opens its cover, then shows its questions.
// - A red ribbon on a book means some of its questions need a look.

/** One topic bar on a subject's cover (same colors as the coverage meters elsewhere). Height and fill differ too, so color is never the only signal. */
const BAR: Record<CoverageLevel, string> = {
  enough: 'h-full bg-correct',
  few: 'h-1/2 bg-[#9A5B00]',
  none: 'h-full border border-wrong/70',
}

/** How long the open-book scene plays before the list shows (keep in step with book-fly/book-cover-open in index.css). */
const OPEN_MS = 780
/** How far the wall must be dragged (px) to go to the next library. */
const SWIPE_PX = 70
/** How far a drag must go (px) before it counts as a swipe instead of a tap. */
const TAP_SLOP = 8

/** Books per shelf: 3 on phones, 6 from 640px up. Read from the screen width (and kept in step when it changes). */
const WIDE = '(min-width: 640px)'
function usePerShelf() {
  const wide = useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(WIDE).matches,
  )
  return wide ? 6 : 3
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Everything needed to draw one book (on the shelf, and again big when it opens). */
type ShelfBook = {
  key: string
  to: string
  title: string
  count: number
  color: string
  /** what a screen reader says for this book */
  label: string
  /** her score on it; undefined while scores load (no stars shown yet) */
  accuracy: number | null | undefined
  flagged: number
  art: ReactNode
  /** a subject's topic bars */
  footer?: ReactNode
}

/** The cover's size: the same for every book, so the shelves line up. */
const COVER_SIZE = 'w-[5.5rem] h-[7.5rem] sm:w-28 sm:h-[9.5rem]'

/** Three stars, earned ones gold. */
function Stars({ count, className }: { count: number; className?: string }) {
  return (
    <span aria-hidden className={cn('relative flex gap-px', className)}>
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <Star key={i} className={cn('size-3 sm:size-3.5', i < count ? 'fill-highlight text-highlight' : 'text-primary/25')} strokeWidth={2.5} />
      ))}
    </span>
  )
}

/**
 * What a book's cover looks like (used on the shelf and in the open-book scene): a white lab binder, like the
 * app's cards, with its color only on the spine strip. That keeps the page in the app's teal/white look, and
 * lets the gold of a three-star book stand out.
 */
function CoverFace({ book }: { book: ShelfBook }) {
  const stars = book.accuracy === undefined ? null : starsFor(book.accuracy)
  const gold = stars === MAX_STARS
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex size-full flex-col items-center overflow-hidden rounded-l-[3px] rounded-r-lg bg-card px-2 pt-2.5 pb-2 pl-4 text-primary-deep',
        gold ? 'border-2 border-highlight shadow-[0_0_16px_-2px_rgb(233_162_59/0.7)]' : 'border border-primary/15',
      )}
    >
      {/* the binder's spine: the book's color, with a ring hole near the top and bottom */}
      <span className="pointer-events-none absolute inset-y-0 left-0 w-2.5" style={{ background: book.color }} />
      <span className="pointer-events-none absolute top-[18%] left-[3px] size-1 rounded-full bg-card/80" />
      <span className="pointer-events-none absolute bottom-[18%] left-[3px] size-1 rounded-full bg-card/80" />
      {/* three stars: a gold light sweeps across it now and then */}
      {gold && <span className="book-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-linear-to-r from-transparent via-highlight/30 to-transparent" />}

      <span className="relative line-clamp-2 w-full text-center font-heading text-xs leading-tight font-bold tracking-wide uppercase sm:text-sm">{book.title}</span>
      <span className="relative flex min-h-0 flex-1 items-center justify-center">{book.art}</span>
      {book.footer}
      <span className="relative mt-1 flex w-full items-center justify-between gap-1">
        {stars === null ? <span /> : <Stars count={stars} />}
        <span className="text-[10px] font-bold text-muted-foreground tabular-nums sm:text-xs">{book.count}</span>
      </span>

      {book.flagged > 0 && (
        // a ribbon bookmark hanging from the top edge, with a notched end
        <span className="absolute top-0 right-2 flex h-6 w-4 items-start justify-center bg-wrong pt-0.5 text-[9px] font-bold text-white tabular-nums shadow-sm [clip-path:polygon(0_0,100%_0,100%_100%,50%_78%,0_100%)]">
          {book.flagged > 9 ? '9+' : book.flagged}
        </span>
      )}
    </span>
  )
}

/** One book facing out on the shelf. A plain tap plays the open-book scene; Ctrl/⌘-click still opens normally. */
function Cover({ book, arriving, onOpen }: { book: ShelfBook; arriving: boolean; onOpen: (book: ShelfBook, rect: DOMRect) => void }) {
  const stars = book.accuracy === undefined ? null : starsFor(book.accuracy)
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    onOpen(book, event.currentTarget.getBoundingClientRect())
  }
  return (
    <Link
      to={book.to}
      onClick={handleClick}
      aria-label={`${book.label}${stars === null ? '' : `, ${stars} of ${MAX_STARS} stars`}`}
      className={cn(
        COVER_SIZE,
        'group relative block shrink-0 rounded-l-[3px] rounded-r-lg outline-none',
        // a soft shadow (the app's navy, like the other scenes), and a little hop when pointed at
        'shadow-[0_8px_16px_-10px_rgb(7_71_94/0.55)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-2 hover:-rotate-2 focus-visible:-translate-y-2 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2',
        arriving && 'book-arrive',
      )}
    >
      <CoverFace book={book} />
    </Link>
  )
}

/** The next free spot: tap to make a new book. */
function NewBookSlot({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        COVER_SIZE,
        'flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-primary/45 bg-card/60 text-primary outline-none transition-[colors,transform] hover:-translate-y-1 hover:border-primary hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/40',
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-primary/10">
        <Plus className="size-5" aria-hidden />
      </span>
      <span className="font-heading text-sm font-bold">New book</span>
    </button>
  )
}

/** A free spot further along: just a faint outline, like an empty inventory slot. */
function EmptySlot() {
  return <span aria-hidden className={cn(COVER_SIZE, 'block shrink-0 rounded-lg border-2 border-dashed border-primary/10 bg-card/40')} />
}

/**
 * One shelf: the binders standing on it, and a lab shelf under them — the same pale plate with a navy edge
 * as the old specimen rack, so it belongs with the tubes, rotor and lens on the other pages.
 */
function LabShelf({ children }: { children: ReactNode }) {
  return (
    <div>
      <div role="list" className="relative flex items-end justify-center gap-3 px-3 sm:gap-5">
        {children}
      </div>
      <div aria-hidden className="h-3 rounded-[3px] border border-primary/15 bg-secondary shadow-[inset_0_-3px_0_rgb(7_71_94/0.12),0_10px_14px_-10px_rgb(7_71_94/0.5)]" />
    </div>
  )
}

/**
 * The open-book scene: the tapped book lifts off the shelf, flies to the middle and grows, then its cover
 * swings open on a page. Drawn over everything (fixed), starting exactly where the book was.
 */
function OpeningBook({ book, rect }: { book: ShelfBook; rect: DOMRect }) {
  const scale = Math.min(2.4, (window.innerHeight * 0.5) / rect.height, (window.innerWidth * 0.6) / rect.width)
  const style = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    '--tx': `${window.innerWidth / 2 - (rect.left + rect.width / 2)}px`,
    '--ty': `${window.innerHeight / 2 - (rect.top + rect.height / 2)}px`,
    '--s': scale,
  } as CSSProperties
  return (
    <div aria-hidden className="fixed inset-0 z-50">
      <div className="animate-in fade-in absolute inset-0 bg-background/80 backdrop-blur-[2px] duration-300" />
      <div className="book-fly absolute [perspective:900px]" style={style}>
        {/* the first page, under the cover: shows once the cover swings open */}
        <div className="absolute inset-0 flex flex-col gap-1.5 rounded-r-lg border border-primary/15 bg-card px-3 pt-4 shadow-[0_10px_24px_-10px_rgb(7_71_94/0.5)]">
          <span className="font-heading text-[9px] font-bold text-foreground/70">{book.title}</span>
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="h-px bg-foreground/15" style={{ width: `${90 - (i % 3) * 18}%` }} />
          ))}
        </div>
        <div className="book-cover-open absolute inset-0">
          <CoverFace book={book} />
        </div>
      </div>
    </div>
  )
}

export function Bookshelf({
  libraryNames,
  library,
  onLibraryChange,
  onRenameLibrary,
  coverage,
  flaggedBySubject,
  books,
  subjectAccuracy,
  bookAccuracy,
  arrivingId,
  onNewBook,
}: {
  libraryNames: string[]
  /** the library on screen (1–3) */
  library: number
  onLibraryChange: (slot: number) => void
  onRenameLibrary: () => void
  coverage: SubjectCoverage[]
  /** how many questions need a look, per subject */
  flaggedBySubject: Map<number, number>
  books: Book[]
  /** her score per subject and per book; undefined while loading */
  subjectAccuracy: Map<number, number | null> | undefined
  bookAccuracy: Map<string, number | null> | undefined
  /** the book she just made, so it drops onto the shelf */
  arrivingId: string | null
  onNewBook: () => void
}) {
  const perShelf = usePerShelf()
  const navigate = useNavigate()
  const booksHere = books.filter((b) => b.library === library)
  const room = roomLeft(library, booksHere.length, coverage.length)
  const name = libraryNames[library - 1]

  // ---------- The books on this library's shelves, in order: subjects (Library 1 only), then hers ----------
  const shelfBooks: ShelfBook[] = []
  if (library === 1) {
    for (const s of coverage) {
      const flagged = flaggedBySubject.get(s.subjectId) ?? 0
      const none = s.topics.filter((t) => t.level === 'none').length
      const few = s.topics.filter((t) => t.level === 'few').length
      shelfBooks.push({
        key: `s${s.subjectId}`,
        to: `/questions?subject=${s.subjectId}`,
        title: s.code,
        count: s.total,
        color: SUBJECT_COLOR[s.code] ?? BOOK_SPINE.teal,
        flagged,
        accuracy: subjectAccuracy ? (subjectAccuracy.get(s.subjectId) ?? null) : undefined,
        label: `${s.name}: ${plural(s.total, 'question')}${none > 0 ? `, ${plural(none, 'topic')} with none` : ''}${few > 0 ? `, ${plural(few, 'topic')} with few` : ''}${flagged > 0 ? `, ${flagged} need a look` : ''}`,
        art: (
          <span className="block w-12 sm:w-16">
            <FieldOfView code={s.code} />
          </span>
        ),
        footer: (
          // one bar per topic, fullest first, like a gauge filling up
          <span className="relative flex h-2 w-full items-end gap-px">
            {[...s.topics].reverse().map((t) => (
              <span key={t.topicId} className={cn('min-w-0 flex-1 rounded-[1px]', BAR[t.level])} />
            ))}
          </span>
        ),
      })
    }
  }
  for (const b of booksHere) {
    shelfBooks.push({
      key: b.id,
      to: `/questions?book=${b.id}`,
      title: b.title,
      count: b.questionIds.size,
      color: BOOK_SPINE[b.color],
      flagged: 0,
      accuracy: bookAccuracy ? (bookAccuracy.get(b.id) ?? null) : undefined,
      label: `${b.title}: ${plural(b.questionIds.size, 'question')}`,
      art: (
        // her book's emblem: its first letter in a ring
        <span
          className="flex size-10 items-center justify-center rounded-full border-2 bg-secondary/60 font-heading text-xl font-black sm:size-12 sm:text-2xl"
          style={{ borderColor: BOOK_SPINE[b.color], color: BOOK_SPINE[b.color] }}
        >
          {b.title.charAt(0).toUpperCase()}
        </span>
      ),
    })
  }

  // The library's progress: stars earned out of all it could have.
  const earned = shelfBooks.reduce((sum, b) => sum + (b.accuracy === undefined ? 0 : starsFor(b.accuracy)), 0)
  const possible = shelfBooks.length * MAX_STARS
  const scoresLoaded = subjectAccuracy !== undefined && bookAccuracy !== undefined

  // Every spot is drawn: books, then "New book" (if there's room), then faint empty slots.
  const slots: { key: string; node: ReactNode }[] = shelfBooks.map((b) => ({
    key: b.key,
    node: <Cover book={b} arriving={b.key === arrivingId} onOpen={openBook} />,
  }))
  if (room > 0) slots.push({ key: 'new', node: <NewBookSlot onClick={onNewBook} /> })
  while (slots.length < LIBRARY_SLOTS) slots.push({ key: `empty${slots.length}`, node: <EmptySlot /> })
  const shelves = Array.from({ length: Math.ceil(LIBRARY_SLOTS / perShelf) }, (_, i) => slots.slice(i * perShelf, (i + 1) * perShelf))

  // ---------- Open a book: the scene, then the list ----------
  const [opening, setOpening] = useState<{ book: ShelfBook; rect: DOMRect } | null>(null)
  const openTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(openTimer.current), [])

  function openBook(book: ShelfBook, rect: DOMRect) {
    const go = () => {
      window.scrollTo({ top: 0 })
      navigate(book.to)
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return go()
    setOpening({ book, rect })
    openTimer.current = window.setTimeout(go, OPEN_MS)
  }

  // ---------- Changing library: arrows, tabs, or swiping the wall ----------
  // Which side the new library slides in from.
  const [enterFrom, setEnterFrom] = useState<'left' | 'right' | null>(null)
  function goTo(slot: number, from: 'left' | 'right') {
    if (slot === library) return
    setEnterFrom(from)
    onLibraryChange(slot)
  }
  const next = (library % LIBRARY_COUNT) + 1
  const prev = ((library + LIBRARY_COUNT - 2) % LIBRARY_COUNT) + 1

  const drag = useRef<{ x: number; active: boolean } | null>(null)
  const [dragPx, setDragPx] = useState(0)
  const justDragged = useRef(false)

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, active: false }
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    if (!drag.current.active) {
      if (Math.abs(dx) < TAP_SLOP) return
      // Only now take over the pointer: a plain tap still reaches the book under the finger.
      drag.current.active = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setDragPx(dx * 0.6) // a little resistance, like pulling something heavy
  }
  function onPointerUp(e: PointerEvent) {
    const d = drag.current
    drag.current = null
    if (!d?.active) return
    justDragged.current = true // so the click that follows doesn't also open the book under the finger
    const dx = e.clientX - d.x
    setDragPx(0)
    if (dx <= -SWIPE_PX) goTo(next, 'right')
    else if (dx >= SWIPE_PX) goTo(prev, 'left')
  }
  function onClickCapture(e: MouseEvent) {
    if (!justDragged.current) return
    justDragged.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  const arrowClass =
    'flex size-10 shrink-0 items-center justify-center rounded-full border bg-card shadow-sm outline-none transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40'

  return (
    <section aria-labelledby="library-name" className="space-y-3">
      {/* ---------- Which library: ‹ name ✎ ›, its stars, then one tab per library ---------- */}
      <div className="flex items-center justify-center gap-2">
        <button type="button" onClick={() => goTo(prev, 'left')} aria-label="Previous library" className={arrowClass}>
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <h2 id="library-name" key={library} className="animate-in fade-in min-w-0 truncate px-2 text-center font-heading text-2xl tracking-wide duration-300 sm:text-3xl">
          {name}
        </h2>
        <button type="button" onClick={onRenameLibrary} aria-label={`Rename ${name}`} title="Rename library" className={cn(arrowClass, 'size-9 border-transparent bg-transparent shadow-none hover:bg-card')}>
          <Pencil className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={() => goTo(next, 'right')} aria-label="Next library" className={arrowClass}>
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <div className="flex flex-col items-center gap-2">
        {scoresLoaded && possible > 0 && (
          <p className="flex items-center gap-1.5 rounded-full bg-highlight-soft px-3 py-0.5 text-sm font-bold tabular-nums">
            <Star className="size-4 fill-highlight text-highlight" aria-hidden />
            {earned} / {possible}
            <span className="sr-only">stars in {name}</span>
          </p>
        )}
        <div role="tablist" aria-label="Libraries" className="flex justify-center gap-1.5">
          {libraryNames.map((n, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={library === i + 1}
              onClick={() => goTo(i + 1, i + 1 > library ? 'right' : 'left')}
              className={cn(
                'max-w-36 truncate rounded-full px-3 py-1 text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                library === i + 1 ? 'bg-primary text-white' : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- The wall and its shelves: drag it sideways to change library ---------- */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null
          setDragPx(0)
        }}
        onClickCapture={onClickCapture}
        className="touch-pan-y overflow-hidden rounded-2xl select-none"
      >
        <div
          style={{ transform: dragPx ? `translateX(${dragPx}px)` : undefined }}
          className={cn(!dragPx && 'transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]')}
        >
          {/* key: a new library slides in from the side she swiped toward */}
          <div
            key={library}
            className={cn(
              // No box around the shelves: they stand on the page itself, like the rack, rotor and lens on the other pages.
              // pt: room for a binder's hop and the gold glow of a three-star one.
              'animate-in fade-in relative space-y-8 px-1 pt-4 duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] sm:px-6',
              enterFrom === 'right' && 'slide-in-from-right-24',
              enterFrom === 'left' && 'slide-in-from-left-24',
            )}
          >
            {shelves.map((shelf, i) => (
              <LabShelf key={i}>
                {shelf.map((slot) => (
                  <div role="listitem" key={slot.key} className="flex items-end">
                    {slot.node}
                  </div>
                ))}
              </LabShelf>
            ))}
            {/* the same soft bench surface as the other pages, under the last shelf */}
            <div className="relative -mt-4 pt-6 pb-3">
              <LabBench className="h-full" />
              <p className="relative text-center text-xs text-muted-foreground" aria-live="polite">
                {room === 0 ? `${name} is full. Put new books in another library.` : `${plural(room, 'free slot')} · swipe for your other libraries`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <CoverKey />

      {opening && <OpeningBook book={opening.book} rect={opening.rect} />}
    </section>
  )
}

/** How to read the covers, in one quiet line. Hidden from screen readers: each book already says its numbers. */
function CoverKey() {
  const item = 'inline-flex items-center gap-1.5'
  const box = 'flex h-3 w-2 items-end'
  return (
    <p aria-hidden className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className={item}>
        <Star className="size-3.5 fill-highlight text-highlight" /> 60% · 75% · 90% score
      </span>
      <span className={item}>
        Topic bars:
        <span className={box}><span className={cn('w-full rounded-[1px]', BAR.enough)} /></span> 10+
        <span className={box}><span className={cn('w-full rounded-[1px]', BAR.few)} /></span> 1–9
        <span className={box}><span className={cn('w-full rounded-[1px]', BAR.none)} /></span> none
      </span>
      <span className={item}>
        <span className="h-3 w-2 bg-wrong [clip-path:polygon(0_0,100%_0,100%_100%,50%_75%,0_100%)]" /> needs a look
      </span>
    </p>
  )
}
