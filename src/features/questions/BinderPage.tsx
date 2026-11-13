import { Bookmark, ChevronDown, Ellipsis, Microscope, Pencil, Play, Star, Timer } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { MAX_STARS, NO_CHAPTER, starsFor } from '@/lib/books'
import { formatPercent } from '@/lib/quiz'
import type { CoverageLevel, SubjectCoverage } from '@/lib/questions'
import { cn } from '@/lib/utils'

// Inside an open book (a subject, one of her books, or all questions), drawn as an open lab binder:
// the binder's cover (in the book's color) behind two white pages, with metal rings between them.
// - Left page: the book's "contents": its name, stars, score, Practice, and the list of topics.
// - Right page: search and the questions, on ruled lines.
// - The binder fills one screen (no page scroll): only the list of questions scrolls, inside the right page.
// - Phones have no room for two pages side by side, so the binder opens upright: contents on top,
//   the rings running across, the questions below.
// The pages swing open from the rings (binder-open-* in index.css), carrying on from the open-book scene.

const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40'

/** One metal binder ring, seen from above: a silver arc that joins the two pages. */
function Ring({ upright }: { upright: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 56 22" className={cn('h-[22px] w-14 shrink-0 overflow-visible drop-shadow-[0_2px_2px_rgb(0_0_0/0.3)]', upright && 'rotate-90')}>
      <defs>
        <linearGradient id="binder-ring-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F4F6F8" />
          <stop offset="0.45" stopColor="#AEB7C0" />
          <stop offset="1" stopColor="#6E7A86" />
        </linearGradient>
      </defs>
      {/* the holes it goes through, one on each page */}
      <circle cx="6" cy="15" r="3.2" fill="rgb(7 71 94 / 0.25)" />
      <circle cx="50" cy="15" r="3.2" fill="rgb(7 71 94 / 0.25)" />
      <path d="M6 15 C6 1, 50 1, 50 15" fill="none" stroke="url(#binder-ring-metal)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** The open binder: cover behind, left page, rings, right page. `color` is the book's color. */
export function OpenBinder({ color, pageKey, left, right }: { color: string; pageKey: string; left: ReactNode; right: ReactNode }) {
  const page = 'min-w-0 bg-card'
  return (
    // key: opening another book opens the pages again
    <div
      key={pageKey}
      // the cover: the book's color, showing as a rim around the pages.
      // It fills the room the page gives it (one screen, no page scroll): only the questions scroll, inside the right page.
      style={{ background: color }}
      className="flex min-h-0 flex-1 flex-col rounded-2xl p-1.5 shadow-[0_22px_40px_-26px_rgb(7_71_94/0.7)] sm:p-2 md:grid md:grid-cols-[17rem_3rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] lg:grid-cols-[19rem_3.5rem_minmax(0,1fr)]"
    >
      {/* ---------- left page: contents (a long one scrolls on its own) ---------- */}
      <div
        className={cn(
          page,
          'binder-open-left binder-scroll shrink-0 space-y-4 overflow-y-auto rounded-t-xl p-4 max-md:max-h-[45%] max-md:rounded-b-sm md:rounded-l-xl md:rounded-tr-sm md:p-5',
          // the page curves into the rings: a soft shadow along that edge
          'max-md:shadow-[inset_0_-10px_14px_-12px_rgb(7_71_94/0.35)] md:shadow-[inset_-12px_0_16px_-14px_rgb(7_71_94/0.4)]',
        )}
      >
        {left}
      </div>

      {/* ---------- the rings ---------- */}
      <div aria-hidden className="flex shrink-0 items-center justify-around py-0.5 max-md:-my-2 max-md:px-6 md:py-6">
        <div className="flex justify-around max-md:w-full md:-mx-1.5 md:h-full md:flex-col md:items-center">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="relative z-10 flex justify-center">
              <span className="max-md:hidden">
                <Ring upright={false} />
              </span>
              <span className="md:hidden">
                <Ring upright />
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ---------- right page: the questions ---------- */}
      <div
        className={cn(
          page,
          // flex column: search stays at the top, the list under it takes the rest and scrolls (see QuestionsPage)
          'binder-open-right flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-b-xl px-4 pt-4 max-md:rounded-t-sm md:rounded-tl-sm md:rounded-r-xl md:rounded-bl-sm sm:px-6 md:pt-5',
          'max-md:shadow-[inset_0_10px_14px_-12px_rgb(7_71_94/0.35)] md:shadow-[inset_12px_0_16px_-14px_rgb(7_71_94/0.4)]',
        )}
      >
        {right}
      </div>
    </div>
  )
}

/** The top of the left page: the book's name, its stars and score, how many questions, and Practice. */
export function TitlePage({
  title,
  subtitle,
  count,
  accuracy,
  study,
  onEdit,
  note,
  tag,
}: {
  title: string
  /** the full subject name (subjects only) */
  subtitle?: string
  count: number
  /** her score on this book; undefined while loading, null if not started */
  accuracy?: number | null
  /** where each way of studying this book goes; none = no Study button (e.g. an empty book) */
  study?: StudyLinks
  /** her own books: rename / recolor / move / delete */
  onEdit?: () => void
  /** a short line under the title (e.g. how to fill her book) */
  note?: ReactNode
  /** a small label after the question count (e.g. "Shared to Community") */
  tag?: ReactNode
}) {
  const stars = accuracy === undefined ? null : starsFor(accuracy)
  return (
    <div className="space-y-2.5">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="min-w-0 truncate font-heading text-3xl leading-tight font-bold">{title}</h1>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit book: ${title}`}
              title="Edit book"
              className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground', focusRing)}
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>
            {subtitle && <>{subtitle} · </>}
            <span className="tabular-nums">
              {count} question{count === 1 ? '' : 's'}
            </span>
          </span>
          {tag}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {stars !== null && (
          <p className="flex items-center gap-2 text-sm">
            <span className="flex gap-0.5" aria-hidden>
              {Array.from({ length: MAX_STARS }, (_, i) => (
                <Star key={i} className={cn('size-4', i < stars ? 'fill-highlight text-highlight' : 'text-primary/25')} strokeWidth={2.5} />
              ))}
            </span>
            <span className="sr-only">
              {stars} of {MAX_STARS} stars.
            </span>
            <span className="font-semibold text-muted-foreground">{accuracy === null || accuracy === undefined ? 'Not started' : `Score ${formatPercent(accuracy)}`}</span>
          </p>
        )}
      </div>
      {study && <StudyMenu links={study} />}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  )
}

/** Where "Study" can take her for this book. `due` = flashcards due now (shown on that option). */
/** `mock` only on her own books: a subject's mock is the Full Board on Mock exam now. */
export type StudyLinks = { practice: string; mock?: string; flashcards: string; due?: number }

/**
 * One gold "Study" button; tapping it opens the ways to study the book (Mock exam only on her own books) right under it
 * (in the page, not a floating menu, so it works the same with a finger, a mouse or the keyboard).
 */
function StudyMenu({ links }: { links: StudyLinks }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const options = [
    { to: links.practice, icon: Play, title: 'Practice', hint: 'Untimed · see why after each one' },
    ...(links.mock ? [{ to: links.mock, icon: Timer, title: 'Mock exam', hint: 'Timed, like the board' }] : []),
    { to: links.flashcards, icon: Microscope, title: 'Flashcards', hint: 'Quick review of what’s due', badge: links.due },
  ]
  return (
    <div onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn('flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-highlight px-4 font-heading text-lg font-bold text-foreground hover:brightness-105 active:translate-y-px', focusRing)}
      >
        <Play className="size-4 fill-current" aria-hidden />
        Study
        <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul id={panelId} className="animate-in fade-in slide-in-from-top-1 mt-1.5 overflow-hidden rounded-lg border border-primary/15 bg-card duration-200">
          {options.map(({ to, icon: Icon, title, hint, badge }) => (
            <li key={title} className="border-b border-primary/10 last:border-b-0">
              <Link to={to} className={cn('flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60', focusRing, 'focus-visible:ring-inset')}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading font-bold">{title}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
                {badge !== undefined && badge > 0 && (
                  <span className="shrink-0 rounded-full bg-highlight-soft px-2 py-0.5 text-xs font-bold tabular-nums">{badge} due</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The small dot beside a topic: how many questions it has (same colors as the topic bars on the covers). */
const LEVEL_DOT: Record<CoverageLevel, { className: string; label: string }> = {
  enough: { className: 'bg-correct', label: '10 or more questions' },
  few: { className: 'bg-[#9A5B00]', label: '1 to 9 questions' },
  none: { className: 'border-[1.5px] border-wrong', label: 'no questions yet' },
}

/**
 * The book's table of contents: one line per topic. Computers: a list down the left page.
 * Phones: one row to swipe through, so the questions stay high up.
 * Each line is a real radio button, so arrow keys and screen readers work like any other choice.
 */
export function Contents({
  subject,
  topicId,
  onSelect,
  myTopics = [],
  myTopic = null,
  onSelectMine,
  onTopicMenu,
}: {
  subject: SubjectCoverage
  topicId: number | null
  onSelect: (topicId: number | null) => void
  /** her own topics in this subject (migration 0019), e.g. a book she merged in */
  myTopics?: { name: string; count: number }[]
  /** the chosen one of hers, or null */
  myTopic?: string | null
  onSelectMine?: (name: string) => void
  /** the ⋯ next to her chosen topic (Rename, Move to its own book); board topics never get one */
  onTopicMenu?: (name: string) => void
}) {
  // A topic chosen from elsewhere (coming back from the editor) may be out of view: bring it in.
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.querySelector('input:checked')?.closest('label')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [topicId, myTopic])

  return (
    <fieldset className="min-w-0 border-t border-primary/10 pt-3">
      <legend className="sr-only">Topic in {subject.name}</legend>
      <p aria-hidden className="mb-2 font-heading text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase max-md:hidden">
        Contents
      </p>
      {/* The scrolling is on this div because a fieldset doesn't keep its contents inside it. */}
      <div ref={list} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        <Line checked={topicId === null && myTopic === null} onChange={() => onSelect(null)} count={subject.total}>
          All topics
        </Line>
        {/* Her own topics first (a bookmark marks them as hers), each with a ⋯ when chosen */}
        {myTopics.map((t) =>
          onTopicMenu && myTopic === t.name ? (
            <div key={`mine-${t.name}`} className="flex shrink-0 items-center gap-1">
              <div className="min-w-0 flex-1">
                <Line checked onChange={() => onSelectMine?.(t.name)} count={t.count} mine>
                  {t.name}
                </Line>
              </div>
              <button
                type="button"
                onClick={() => onTopicMenu(t.name)}
                aria-label={`Options for ${t.name}`}
                title="Topic options"
                className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground', focusRing)}
              >
                <Ellipsis className="size-5" aria-hidden />
              </button>
            </div>
          ) : (
            <Line key={`mine-${t.name}`} checked={myTopic === t.name} onChange={() => onSelectMine?.(t.name)} count={t.count} mine>
              {t.name}
            </Line>
          ),
        )}
        {/* fewest questions first (summarizeCoverage), so the gaps are easy to spot */}
        {subject.topics.map((t) => (
          <Line key={t.topicId} checked={topicId === t.topicId} onChange={() => onSelect(t.topicId)} level={t.level} count={t.count}>
            {t.name}
          </Line>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Her own book's table of contents: the chapters she named, each with its number of questions,
 * plus "No chapter" for the rest. Same look as a subject's topic list.
 */
export function ChapterContents({
  chapters,
  unfiled,
  total,
  chapter,
  onSelect,
  onTopicMenu,
}: {
  chapters: { name: string; count: number }[]
  /** questions with no chapter */
  unfiled: number
  total: number
  /** the chosen chapter, NO_CHAPTER, or null for all */
  chapter: string | null
  onSelect: (chapter: string | null) => void
  /** the ⋯ next to the chosen topic: its menu (Rename topic, Move to its own book) */
  onTopicMenu?: (chapter: string) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.querySelector('input:checked')?.closest('label')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [chapter])

  return (
    <fieldset className="min-w-0 border-t border-primary/10 pt-3">
      <legend className="sr-only">Topic</legend>
      <p aria-hidden className="mb-2 font-heading text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase max-md:hidden">
        Contents
      </p>
      <div ref={list} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        <Line checked={chapter === null} onChange={() => onSelect(null)} count={total}>
          All topics
        </Line>
        {chapters.map((c) =>
          // The chosen topic gets a small ⋯ next to it (its menu): tucked away until she needs it.
          onTopicMenu && chapter === c.name ? (
            <div key={c.name} className="flex shrink-0 items-center gap-1">
              <div className="min-w-0 flex-1">
                <Line checked onChange={() => onSelect(c.name)} count={c.count}>
                  {c.name}
                </Line>
              </div>
              <button
                type="button"
                onClick={() => onTopicMenu(c.name)}
                aria-label={`Options for ${c.name}`}
                title="Topic options"
                className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground', focusRing)}
              >
                <Ellipsis className="size-5" aria-hidden />
              </button>
            </div>
          ) : (
            <Line key={c.name} checked={chapter === c.name} onChange={() => onSelect(c.name)} count={c.count}>
              {c.name}
            </Line>
          ),
        )}
        {/* only when it helps: some questions have a chapter and some don't */}
        {unfiled > 0 && chapters.length > 0 && (
          <Line checked={chapter === NO_CHAPTER} onChange={() => onSelect(NO_CHAPTER)} count={unfiled}>
            <span className="italic">No topic</span>
          </Line>
        )}
      </div>
      {chapters.length === 0 && total > 0 && (
        <p className="mt-2 text-xs text-muted-foreground max-md:hidden">Give questions a topic (“Topic” on a question) to group them here.</p>
      )}
    </fieldset>
  )
}

function Line({
  checked,
  onChange,
  level,
  count,
  mine = false,
  children,
}: {
  checked: boolean
  onChange: () => void
  level?: CoverageLevel
  count: number
  /** her own topic in a subject: a small bookmark instead of the dot */
  mine?: boolean
  children: ReactNode
}) {
  const dot = level ? LEVEL_DOT[level] : null
  return (
    <label
      className={cn(
        // relative: keeps the hidden radio inside, or the page would scroll sideways on phones.
        'relative flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40 md:min-h-9 md:px-2.5',
        checked ? 'bg-primary text-white' : 'bg-secondary/60 text-foreground hover:bg-secondary md:bg-transparent',
      )}
    >
      <input type="radio" name="binder-topic" checked={checked} onChange={onChange} className="sr-only" />
      {mine ? (
        <Bookmark role="img" aria-label="Your topic" className={cn('size-3.5 shrink-0', checked ? 'text-white' : 'text-primary')} />
      ) : dot ? (
        <span role="img" aria-label={dot.label} className={cn('size-2 shrink-0 rounded-full', dot.className, checked && dot.className.startsWith('border') && 'border-white')} />
      ) : (
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full', checked ? 'bg-white' : 'bg-primary/40')} />
      )}
      <span className="min-w-0 flex-1 md:truncate">{children}</span>
      <span className={cn('tabular-nums', checked ? 'text-white/80' : 'text-muted-foreground')}>{count}</span>
    </label>
  )
}
