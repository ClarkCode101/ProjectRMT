import { useQuery } from '@tanstack/react-query'
import { EyeOff, Flag, Info, Play, Target, Timer } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { CountPicker } from '@/components/CountPicker'
import { PageHeader } from '@/components/dashboard'
import { heroButtonClass } from '@/components/report'
import { DEFAULT_SOURCE, questionPoolOptions, type QuizFilters } from '@/features/quiz/api'
import type { Book } from '@/features/questions/booksApi'
import { BOOK_SPINE } from '@/lib/books'
import { formatClock, MOCK_ITEM_COUNTS, secondsLeft, timeLimitSec, type SavedMock } from '@/lib/mockExam'
import { PASSING_LABEL } from '@/lib/quiz'
import { cn } from '@/lib/utils'

// A timed mock on ONE of her books (from "Study → Mock exam" inside the book on Questions).
// The Mock exam page itself is the Full Board (BoardSetup); a book isn't a board subject, so it keeps this
// simple setup: the book's cover, [count chip] [Start run], and the run's rules.

type Props = {
  book: Book
  onStart: (filters: QuizFilters, itemCount: number, label: string) => void
  starting: boolean
  /** an exam she left part-way, saved on this device */
  saved: SavedMock | null
  onResume: () => void
  onDiscard: () => void
  /** leave the book and go to the Full Board */
  onLeaveBook: () => void
}

/** The run's rules, printed along the bottom (short, like a label on real equipment). */
const RULES = [
  { icon: Timer, text: 'Auto-submits at 0:00' },
  { icon: EyeOff, text: 'Answers after you submit' },
  { icon: Flag, text: 'Flag items, come back later' },
  { icon: Target, text: `Pass: ${PASSING_LABEL} or higher` },
]

export function MockSetup({ book, onStart, starting, saved, onResume, onDiscard, onLeaveBook }: Props) {
  const [itemCount, setItemCount] = useState<number>(100)
  // Exactly the book's questions.
  const filters: QuizFilters = { ...DEFAULT_SOURCE, subjectId: null, topicId: null, questionIds: [...book.questionIds], bookId: book.id }
  const pool = useQuery({ ...questionPoolOptions(filters, []) })
  const available = pool.data?.length ?? null
  const examItems = available === null ? itemCount : Math.min(itemCount, available)

  // An exam left part-way: offer to resume it first (only one at a time). The clock is read once when the page opens.
  const [openedAt] = useState(() => Date.now())
  const savedLeft = saved ? secondsLeft(saved, openedAt) : 0
  const savedAnswered = saved ? saved.answers.filter((a) => a !== null).length : 0

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saved || starting) return // finish or discard the saved one first
    onStart(filters, itemCount, book.title)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex h-[calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-136 max-w-5xl flex-col gap-3 md:h-[calc(100dvh-2.5rem)] md:min-h-144"
    >
      <PageHeader title="Mock exam" subtitle="A timed run on your book. Answers after you submit." />

      {/* ---------- Her book's cover in the middle ---------- */}
      <section aria-label="Your book" className="flex min-h-0 flex-1 items-center justify-center">
        <span
          aria-hidden
          className="relative flex h-52 w-40 flex-col items-center justify-center gap-3 overflow-hidden rounded-l-[4px] rounded-r-xl border border-primary/15 bg-card pl-5 text-primary-deep shadow-[0_18px_30px_-16px_rgb(7_71_94/0.6)] md:h-64 md:w-48"
        >
          <span className="absolute inset-y-0 left-0 w-3.5" style={{ background: BOOK_SPINE[book.color] }} />
          <span
            className="flex size-14 items-center justify-center rounded-full border-2 bg-secondary/60 font-heading text-2xl font-black"
            style={{ borderColor: BOOK_SPINE[book.color], color: BOOK_SPINE[book.color] }}
          >
            {book.title.charAt(0).toUpperCase()}
          </span>
          <span className="line-clamp-2 px-3 text-center font-heading text-sm font-bold uppercase">{book.title}</span>
        </span>
      </section>

      {/* ---------- Name plate ---------- */}
      <div className="shrink-0 text-center" aria-live="polite">
        {saved ? (
          <>
            <p className="font-heading text-4xl leading-none font-black tracking-wide md:text-5xl">{saved.label}</p>
            <p className="mt-2 text-sm text-muted-foreground tabular-nums">
              <span className="font-bold text-[#9A5B00]">Paused</span> · {savedAnswered}/{saved.answers.length} answered ·{' '}
              {savedLeft > 0 ? `${formatClock(savedLeft)} left` : 'time is up'}
            </p>
          </>
        ) : (
          <>
            <p className="truncate px-4 font-heading text-4xl leading-none font-black tracking-wide md:text-5xl">{book.title}</p>
            <p className="mt-2 truncate px-4 text-sm text-muted-foreground">
              Your book · {book.questionIds.size} questions ·{' '}
              <button type="button" onClick={onLeaveBook} className="rounded-sm font-semibold text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
                Full Board instead
              </button>
            </p>
          </>
        )}
      </div>

      {/* ---------- Count chip + Start (or Resume / Discard) ---------- */}
      {saved ? (
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              className="flex h-12 items-center rounded-lg border bg-card px-5 font-heading font-bold outline-none hover:border-wrong/60 hover:text-wrong focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              Discard
            </button>
            <button type="button" onClick={onResume} disabled={starting} className={cn(heroButtonClass, 'w-auto px-7 focus-visible:ring-ring/50')}>
              <Play className="size-5 fill-current" aria-hidden />
              {savedLeft > 0 ? 'Resume' : 'See results'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Finish or discard it before starting a new one.</p>
        </div>
      ) : (
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <CountPicker
              value={itemCount}
              options={MOCK_ITEM_COUNTS}
              onChange={setItemCount}
              unit="items"
              label="Items"
              // fewer questions than picked: the time is for the questions she'll really get
              detail={(n) => formatClock(timeLimitSec(available === null ? n : Math.min(n, available)))}
              detailIcon={Timer}
              disabled={starting}
            />
            <button type="submit" className={cn(heroButtonClass, 'w-auto px-7 whitespace-nowrap focus-visible:ring-ring/50')} disabled={starting || available === 0}>
              <Play className="size-5 fill-current" aria-hidden />
              {/* The count is in the chip; Start shows it only when there are fewer questions than she picked. */}
              {starting ? 'Starting run…' : `Start run${examItems < itemCount ? ` · ${examItems} items` : ''}`}
            </button>
          </div>
          {/* ALWAYS one line (h-4), so the cover above doesn't move. */}
          <p className="flex h-4 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            {available !== null && available < itemCount && <Info className="size-3.5 shrink-0 text-[#9A5B00]" aria-hidden />}
            {available === null
              ? 'Counting questions…'
              : available === 0
                ? 'No questions in this book yet.'
                : available < itemCount
                  ? `Only ${available} question${available === 1 ? '' : 's'} in this book`
                  : `${available} questions available`}
          </p>
        </div>
      )}

      {/* ---------- The run's rules ---------- */}
      <div className="w-full shrink-0 border-t border-dashed pt-3">
        <h2 className="sr-only">Run protocol</h2>
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-1.5 text-xs text-muted-foreground sm:text-sm">
          {RULES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </form>
  )
}
