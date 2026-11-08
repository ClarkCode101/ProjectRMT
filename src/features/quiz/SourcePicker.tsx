import { Library, PenLine } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Group } from '@/components/ChoiceTiles'
import { SwipeCarousel } from '@/components/SwipeCarousel'
import { useBooks } from '@/features/questions/booksApi'
import { BOOK_SPINE } from '@/lib/books'
import { cn } from '@/lib/utils'
import { useSourceCounts, type SourceChoice } from './api'

/**
 * "Where should the questions come from?" (PROJECT_PLAN.md §6), shared by every study mode (Practice, Mock exam,
 * Flashcards), so they all filter questions the same way.
 * Each source is a small lab binder, like the books on the Questions shelf, and she swipes through them like the
 * other pickers: All questions, Mine (every question she added: typed or uploaded), then each of her own books.
 * (Built-in and one upload are still understood by the quiz api, but aren't offered: her books are the way to
 * group questions now.)
 * The chosen source is combined with the chosen subject/topic (e.g. HEMA + her book = the HEMA questions in it).
 */

type SourceItem = {
  key: string
  /** the name on the plate under the covers */
  code: string
  /** what it means, after the name */
  name: string
  color: string
  emblem: ReactNode
  count: number | null
  choice: Pick<SourceChoice, 'source' | 'uploadId' | 'bookId'>
}

const PLAIN: Pick<SourceChoice, 'uploadId' | 'bookId'> = { uploadId: null, bookId: null }

/** One source as a small binder cover (same look as the shelf's covers, smaller). */
function MiniCover({ item, centered }: { item: SourceItem; centered: boolean }) {
  return (
    <span
      className={cn(
        'relative flex h-32 w-24 flex-col items-center justify-center gap-2 overflow-hidden rounded-l-[3px] rounded-r-lg bg-card pl-3 text-primary-deep shadow-[0_8px_16px_-10px_rgb(7_71_94/0.55)]',
        centered ? 'border-2 border-primary' : 'border border-primary/15',
      )}
    >
      <span className="absolute inset-y-0 left-0 w-2" style={{ background: item.color }} />
      <span className="flex size-10 items-center justify-center rounded-full border-2 bg-secondary/60 font-heading text-lg font-black" style={{ borderColor: item.color, color: item.color }}>
        {item.emblem}
      </span>
      <span className="line-clamp-2 px-1.5 text-center font-heading text-[11px] leading-tight font-bold uppercase">{item.code}</span>
    </span>
  )
}

export function SourcePicker({ value, onChange }: { value: SourceChoice; onChange: (value: SourceChoice) => void }) {
  const books = useBooks()
  const counts = useSourceCounts()

  const items: SourceItem[] = [
    {
      key: 'all',
      code: 'All questions',
      name: 'Built-in + yours',
      color: BOOK_SPINE.teal,
      emblem: <Library className="size-5" />,
      // all = built-in + hers that are in a subject; her book-only ones are in "Mine" and her books instead
      count: counts.data ? counts.data.builtin + counts.data.mineInSubjects : null,
      choice: { source: 'all', ...PLAIN },
    },
    {
      key: 'mine',
      code: 'Mine',
      name: 'Every question you added',
      color: BOOK_SPINE.green,
      emblem: <PenLine className="size-5" />,
      count: counts.data?.mine ?? null,
      choice: { source: 'mine', ...PLAIN },
    },
    // her books (none if they couldn't load, e.g. before migration 0004)
    ...(books.data ?? []).map((b) => ({
      key: `book:${b.id}`,
      code: b.title,
      name: 'Your book',
      color: BOOK_SPINE[b.color],
      emblem: b.title.charAt(0).toUpperCase(),
      count: b.questionIds.size,
      choice: { source: 'book' as const, uploadId: null, bookId: b.id },
    })),
  ]

  const currentKey = value.source === 'book' ? `book:${value.bookId}` : value.source === 'mine' ? 'mine' : 'all'
  const index = Math.max(0, items.findIndex((i) => i.key === currentKey))
  const countText = (n: number | null) => (n === null ? '…' : `${n} question${n === 1 ? '' : 's'}`)

  return (
    <Group title="Question source">
      {/* a fixed height: the carousel fits its covers, name plate and dots in it */}
      <div className="flex h-64 flex-col">
        <SwipeCarousel
          items={items}
          index={index}
          onIndexChange={(i) => onChange({ ...value, ...items[i].choice })}
          onOpen={() => {}}
          label="Question sources"
          bench={false}
          compact
          renderFigure={(item, { centered }) => <MiniCover item={item} centered={centered} />}
          renderDetail={(item) => (
            <span className="font-bold text-primary tabular-nums">{countText(item.count)}</span>
          )}
        />
      </div>
      {/* No books yet: how to get more covers here */}
      {(books.data ?? []).length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          To practice just some questions, put them in a book on the{' '}
          <Link to="/questions" className="rounded-sm font-semibold text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
            Questions
          </Link>{' '}
          shelf.
        </p>
      )}
      {/* No "skip questions that need a look" switch: every question is used (verifiedOnly stays false).
          The ones that need a look are fixed on the Questions page (red ribbon, Needs a look filter). */}
    </Group>
  )
}
