import { useQuery } from '@tanstack/react-query'
import { Check, EyeOff, Info, Pause, Play, Target, Timer, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { CountPicker } from '@/components/CountPicker'
import { Dialog } from '@/components/Dialog'
import { PageHeader } from '@/components/dashboard'
import { heroButtonClass } from '@/components/report'
import { useAuth } from '@/features/auth/authContext'
import { useTopicPerformance } from '@/features/dashboard/api'
import { DEFAULT_SOURCE, questionPoolOptions, type SourceChoice } from '@/features/quiz/api'
import { firstName } from '@/lib/profile'
import { PaperCover } from './PaperCover'
import { SUBJECT_COLOR } from '@/lib/books'
import { BOARD_ITEM_COUNTS, boardVerdict, nextPaperIndex, paperSummaries, papersDone, type BoardRun } from '@/lib/boardRun'
import { formatClock, secondsLeft, timeLimitSec, type SavedMock } from '@/lib/mockExam'
import { FLOOR_LABEL, formatPercent, PASSING_LABEL, subjectWeight, summarizePerformance, type SubjectSummary } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'

// Mock exam = the Full Board (decided 2026-11-13): like the real MTLE, six papers, one subject each,
// the same number of items in every paper. She takes one paper at a time; the run is saved on this device
// in between (lib/boardRun.ts), and after the sixth paper she gets the board's verdict (BoardResults).
// Layout (same idea as Practice and Flashcards: ONE big thing in the middle, then Start at the bottom):
// - the hero: the paper she takes next, as one big exam paper (the papers still to come peek out behind it)
// - a small strip of six chips under it for the whole run (score once taken, gold = the current one)
// Earlier tries, both dropped: a rotor (looked like it could be turned, but picked nothing) and six equal
// booklets (no focal point, read like a dashboard).

type ChipState = 'done' | 'current' | 'waiting'


/**
 * One paper in the progress strip: a check (or a cross) and its score once taken, gold when it's the current one (no ▶: it looked like a Start button).
 * A paper not taken yet is a button: tap it to take that one next (`onPick`; none while a paper is paused).
 */
function PaperChip({ paper, state, onPick }: { paper: SubjectSummary; state: ChipState; onPick?: () => void }) {
  const low = paper.accuracy !== null && paper.belowPassing
  const className = cn(
    // px-2 on a phone: all six fit on one line (from 360px wide), so the strip doesn't take two rows
    'flex h-9 items-center gap-1.5 rounded-full border px-2 text-xs sm:px-3 font-bold whitespace-nowrap tabular-nums',
    state === 'current' && 'border-highlight bg-highlight text-foreground',
    state === 'waiting' && 'border-border bg-transparent text-muted-foreground',
    state === 'done' && (low ? 'border-wrong/30 bg-wrong-soft text-wrong' : 'border-correct/30 bg-correct-soft text-correct'),
  )
  const content = (
    <>
      {state === 'done' && (low ? <X className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />)}
      <span className="font-heading text-sm">{paper.code}</span>
      {state === 'done' && paper.accuracy !== null && <span>{formatPercent(paper.accuracy)}</span>}
      <span className="sr-only">{state === 'done' ? (low ? `, below ${PASSING_LABEL}` : ', passing') : state === 'current' ? ', up next' : ', not taken yet'}</span>
    </>
  )
  return (
    <li aria-current={state === 'current' ? 'step' : undefined}>
      {onPick && state !== 'done' ? (
        <button
          type="button"
          onClick={onPick}
          aria-pressed={state === 'current'}
          aria-label={`${paper.code}: take this paper ${state === 'current' ? '(chosen)' : 'next'}`}
          className={cn(className, 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40', state === 'waiting' && 'hover:border-primary/50 hover:text-foreground')}
        >
          {content}
        </button>
      ) : (
        <span className={className}>{content}</span>
      )}
    </li>
  )
}

/** The run's rules, printed along the bottom (short, like a label on real equipment). */
const RULES = [
  { icon: Timer, text: 'Auto-submits at 0:00' },
  { icon: EyeOff, text: 'Answers after you submit' },
  { icon: Target, text: `Pass: ${PASSING_LABEL} average, no subject below ${FLOOR_LABEL}` },
]

type Props = {
  /** the run in progress (or finished), saved on this device; null = none yet */
  run: BoardRun | null
  /** a paper she left part-way (only one at a time) */
  saved: SavedMock | null
  starting: boolean
  /** a new run: these subjects (in exam order), this many items each, from all questions; starts paper `first` */
  onStartRun: (subjects: SubjectSummary[], perSubject: number, first: number) => void
  /** this paper of the run (one she hasn't taken yet: she can take them in any order) */
  onStartPaper: (index: number) => void
  onResume: () => void
  onDiscard: () => void
  onEndRun: () => void
  onSeeResult: () => void
}

export function BoardSetup({ run, saved, starting, onStartRun, onStartPaper, onResume, onDiscard, onEndRun, onSeeResult }: Props) {
  const subjects = useSubjects()
  const topics = useTopics()
  const performance = useTopicPerformance()
  // her first name from Settings, written on the booklet's NAME line
  const studentName = firstName(useAuth().session?.user)
  const [perSubject, setPerSubject] = useState<number>(25)
  const [confirmEnd, setConfirmEnd] = useState(false)

  // The six papers: from the run, or (before one starts) the subjects with nothing taken yet.
  const papers: SubjectSummary[] = run ? paperSummaries(run) : summarizePerformance([], subjects.data ?? [], [])
  const nextIndex = run ? nextPaperIndex(run) : 0
  const notTaken = (i: number) => papers[i] !== undefined && papers[i].accuracy === null

  // ---------- Which paper goes next: she can take them in any order ----------
  // `chosen` = the paper she switched to (tap the paper, or a chip); null = the first one not taken yet.
  // `leaving` = the paper going to the back of the pile while the next one comes up to the front.
  // The same move every time (decided 2026-11-13): sliding left and right in turns read as going forward and back,
  // even though a tap always goes forward (CC → MICRO → HEMA…).
  const [chosen, setChosen] = useState<number | null>(null)
  const [leaving, setLeaving] = useState<number | null>(null)
  const [entering, setEntering] = useState(false)
  // The current paper: a paused one (it has to be finished or discarded first), else her choice, else the next one.
  // null = every paper is done.
  const pausedIndex = saved?.paper && run && saved.paper.runId === run.id ? saved.paper.index : null
  const topIndex = pausedIndex ?? (chosen !== null && notTaken(chosen) ? chosen : nextIndex)
  const top = topIndex === null ? null : (papers[topIndex] ?? null)
  const done = run ? papersDone(run) : 0
  const complete = run !== null && nextIndex === null
  const verdict = run ? boardVerdict(run) : null
  const items = run?.perSubject ?? perSubject

  // How many questions the next paper can draw from (its subject; a run always uses all questions,
  // there's no ⚙ here: one of her books rarely covers all six subjects, so a paper would come up empty).
  const source: SourceChoice = run ? { ...DEFAULT_SOURCE, ...run.source, source: run.source.source as SourceChoice['source'] } : DEFAULT_SOURCE
  const topicIds = (topics.data ?? []).filter((t) => t.subject_id === top?.subjectId).map((t) => t.id)
  const pool = useQuery({
    ...questionPoolOptions({ ...source, subjectId: top?.subjectId ?? null, topicId: null }, topicIds),
    enabled: top !== null && topics.isSuccess && !complete,
  })
  const available = pool.data?.length ?? null

  // A paused paper: how far along it is. The clock is read once when the page opens.
  const [openedAt] = useState(() => Date.now())
  const savedLeft = saved ? secondsLeft(saved, openedAt) : 0
  const savedAnswered = saved ? saved.answers.filter((a) => a !== null).length : 0

  const busy = starting

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saved || busy || complete || papers.length === 0 || topIndex === null) return
    if (run) onStartPaper(topIndex)
    else onStartRun(papers, perSubject, topIndex)
  }

  // Switching is off while a paper is paused (finish or discard it first), while starting, and with one paper left.
  const waiting = papers.map((_, i) => i).filter(notTaken)
  const canSwitch = !saved && !busy && !complete && waiting.length > 1

  /**
   * Shows paper `index`: the one on top lifts aside and tucks in at the back of the pile, while the new one comes up
   * to the front. No animation if she prefers less motion.
   */
  function showPaper(index: number) {
    if (!canSwitch || index === topIndex || !notTaken(index)) return
    if (topIndex !== null && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLeaving(topIndex)
      setEntering(true)
    }
    setChosen(index)
  }

  /** Tap the paper: the next paper not taken yet, going round (HTMLE → CC). */
  function tapPaper() {
    if (topIndex === null) return
    showPaper(waiting.find((i) => i > topIndex) ?? waiting[0])
  }

  function chipState(index: number, paper: SubjectSummary): ChipState {
    if (paper.accuracy !== null) return 'done'
    return index === topIndex ? 'current' : 'waiting'
  }

  const averageText = verdict?.average != null ? formatPercent(verdict.average) : null
  const verdictColor = verdict?.passed ? 'text-correct' : 'text-wrong'

  // ---------- What the big paper says ----------
  // A paused exam that isn't a paper of this run (a mock on one of her books) is shown by its own name.
  const pausedPaper = Boolean(saved?.paper && run && saved.paper.runId === run.id)
  const pausedOther = saved !== null && !pausedPaper
  const paperColor = pausedOther || complete || !top ? '#0B6382' : (SUBJECT_COLOR[top.code] ?? '#0B6382')
  const kicker = pausedOther ? 'Paused exam' : complete ? 'Board complete' : `Paper ${(topIndex ?? 0) + 1} of ${papers.length}`
  const title = pausedOther ? saved.label : complete ? (averageText ?? '—') : (top?.code ?? '')
  const subtitle = pausedOther ? 'Not part of this board run' : complete ? 'General average' : (top?.name ?? '')
  const weight = !pausedOther && !complete && top ? Math.round(subjectWeight(top.code) * 100) : null
  // The booklet cover (PaperCover) for the paper she takes next; the plain paper only when the board is done
  // or the paused exam is a mock on one of her books.
  const showCover = !pausedOther && !complete && top !== null
  // Her scores on Practice (all her answers), so each cover shows where she starts from in that subject.
  const practice = summarizePerformance(performance.data ?? [], subjects.data ?? [], topics.data ?? [])

  /**
   * The booklet cover of paper `index` (the one on top, or the one sliding out). `footer` only when paused;
   * `tapHint` only on the one on top, when she can switch.
   */
  function cover(index: number, footer?: ReactNode, tapHint = false) {
    const p = papers[index]
    const scores = practice.find((s) => s.subjectId === p.subjectId)
    // her Practice score in each topic (only topics she has answered are in `scores.topics`)
    const topicScore = new Map((scores?.topics ?? []).map((t) => [t.topicId, t.accuracy]))
    return (
      <PaperCover
        number={index + 1}
        total={papers.length}
        code={p.code}
        name={p.name}
        color={SUBJECT_COLOR[p.code] ?? '#0B6382'}
        weight={Math.round(subjectWeight(p.code) * 100)}
        studentName={studentName}
        topics={(topics.data ?? [])
          .filter((t) => t.subject_id === p.subjectId)
          .sort((a, b) => a.id - b.id)
          .map((t) => ({ name: t.name, accuracy: topicScore.get(t.id) ?? null }))}
        practiceScore={scores?.accuracy ?? null}
        tapHint={tapHint}
        footer={footer}
      />
    )
  }
  // Papers still to come after this one: up to two sheets peek out behind the big paper.
  const sheetsBehind = pausedOther || complete ? 0 : Math.min(2, papers.length - done - 1)

  return (
    // At least one screen tall (same as Practice): the big paper takes whatever height is left.
    // Phone: minus the top bar (3.5rem), main's padding (0.5 + 1.5rem) and the bottom nav (5.5rem).
    // Tablet/computer: minus main's padding (pt-5 + pb-5 = 2.5rem).
    // min-h, not h (fixed 2026-11-13): the cover is as tall as its content, so on a short phone a fixed height made it
    // spill over the title and the paper chips. Now the page grows and scrolls a little instead; nothing overlaps.
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex min-h-[max(34rem,calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] max-w-5xl flex-col gap-3 md:min-h-[max(36rem,calc(100dvh-2.5rem))]"
    >
      <PageHeader title="Mock exam" subtitle="The full board: six papers, one subject each. Timed like the real exam." />

      {/* ---------- The hero: the paper she takes next, as one big exam paper ---------- */}
      {/* overflow-x-clip: the paper sliding out goes past the edge without making the page scroll sideways */}
      {/* No min-h-0 here: the section is never shorter than the cover, so the cover can't spill over its neighbors. */}
      <section aria-label="Next paper" aria-live="polite" className="flex flex-1 items-center justify-center overflow-x-clip px-3 py-3 sm:px-6">
        {/* The cover's height comes from its content (so nothing gets cut off); the plain paper is a fixed size. */}
        <div className={cn('relative w-full', showCover ? 'max-w-sm md:max-w-md' : 'h-80 max-w-xs md:h-104 md:max-w-sm')}>
          {/* the papers still to come, peeking out behind */}
          {sheetsBehind >= 2 && <span aria-hidden className="absolute inset-0 rotate-3 rounded-xl border border-primary/10 bg-card/70 shadow-sm" />}
          {sheetsBehind >= 1 && <span aria-hidden className="absolute inset-0 -rotate-2 rounded-xl border border-primary/15 bg-card/90 shadow-sm" />}

          {showCover && top && topIndex !== null ? (
            <>
              {/* the next paper (or the first one, before a run starts): a test booklet's cover.
                  key: a new paper comes up from the pile. z-5: above the pile, below the paper going away
                  until that one tucks in behind (paper-to-back in index.css). */}
              <div key={top.subjectId} className={cn('relative z-5', entering && 'paper-from-pile')} onAnimationEnd={() => setEntering(false)}>
                {cover(
                  topIndex,
                  // the footer only when there's something to say: where she left off
                  saved ? (
                    <>
                      <Pause className="size-4 shrink-0 fill-current text-[#9A5B00]" aria-hidden />
                      <span className="text-[#9A5B00]">Paused</span>
                      <span className="truncate font-normal text-muted-foreground">
                        · {savedAnswered}/{saved.answers.length} answered · {savedLeft > 0 ? `${formatClock(savedLeft)} left` : 'time is up'}
                      </span>
                    </>
                  ) : undefined,
                  canSwitch,
                )}
              </div>

              {/* the paper she switched away from: lifts aside, then tucks in at the back of the pile (then removed) */}
              {leaving !== null && papers[leaving] && (
                <div aria-hidden className="paper-to-back pointer-events-none absolute inset-x-0 top-0" onAnimationEnd={() => setLeaving(null)}>
                  {cover(leaving)}
                </div>
              )}

              {/* Tap the paper to switch to another subject: a real button over the whole paper, so keyboards and
                  screen readers can use it too. Only when there's another paper to switch to. */}
              {canSwitch && (
                <button
                  type="button"
                  onClick={tapPaper}
                  aria-label={`${top.code}. Tap for another subject.`}
                  className="absolute inset-0 z-20 cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              )}
            </>
          ) : (
          // the board is done, or a paused mock on one of her books: a plain paper with just the headline
          <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-primary/15 bg-card shadow-[0_22px_36px_-18px_rgb(7_71_94/0.55)]">
            {/* the paper's header band, in the subject's color */}
            <span aria-hidden className="h-2.5 shrink-0" style={{ background: paperColor }} />
            <p className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              <span>{kicker}</span>
              {weight !== null && (
                <span className="tabular-nums" title={`${weight}% of the general average`}>
                  {weight}% of average
                </span>
              )}
            </p>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 text-center">
              <p
                key={title}
                className={cn(
                  'animate-in fade-in slide-in-from-bottom-2 max-w-full font-heading leading-none font-black tracking-wide tabular-nums duration-300',
                  title.length > 6 ? 'line-clamp-2 text-3xl md:text-4xl' : 'text-6xl md:text-7xl',
                  complete && verdictColor,
                )}
                style={complete ? undefined : { color: paperColor }}
              >
                {title}
              </p>
              <p title={subtitle} className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                {subtitle}
              </p>
              {complete && (
                <p className={cn('stamp mt-4 rounded-md border-[3px] px-3 py-1.5 font-heading text-lg leading-none font-bold', verdict?.passed ? 'border-correct text-correct' : 'border-wrong text-wrong')}>
                  {verdict?.passed ? 'PASSED' : 'NOT YET'}
                </p>
              )}
            </div>

            {/* the bottom line of the paper: how long it is, or where she left off */}
            <p className="flex shrink-0 items-center justify-center gap-1.5 border-t border-dashed border-foreground/15 px-5 py-3 text-sm font-semibold tabular-nums">
              {saved ? (
                <>
                  <Pause className="size-4 fill-current text-[#9A5B00]" aria-hidden />
                  <span className="text-[#9A5B00]">Paused</span>
                  <span className="font-normal text-muted-foreground">
                    · {savedAnswered}/{saved.answers.length} answered · {savedLeft > 0 ? `${formatClock(savedLeft)} left` : 'time is up'}
                  </span>
                </>
              ) : complete ? (
                <span className="font-normal text-muted-foreground">
                  {papers.length} papers · {items} items each
                </span>
              ) : (
                <>
                  <Timer className="size-4 text-primary" aria-hidden />
                  {items} items · {formatClock(timeLimitSec(items))}
                </>
              )}
            </p>
          </div>
          )}
        </div>
      </section>

      {/* ---------- The whole run in one small strip, and the average so far ---------- */}
      <div className="shrink-0 space-y-2 text-center">
        <ol aria-label="Papers" className="flex flex-wrap justify-center gap-1 sm:gap-1.5">
          {papers.map((p, i) => (
            <PaperChip key={p.subjectId} paper={p} state={chipState(i, p)} onPick={canSwitch ? () => showPaper(i) : undefined} />
          ))}
        </ol>
        {/* the average so far, once a paper is done (the chips already show which ones) */}
        {averageText && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {complete ? 'General average' : 'Average so far'} <span className={cn('font-bold', verdictColor)}>{averageText}</span>
          </p>
        )}
      </div>

      {/* ---------- The buttons: [count chip] [Start] before a run; [End run] [Start paper N] during one ---------- */}
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
          <p className="text-xs text-muted-foreground">Finish or discard this paper first. Discarding keeps the run; you can take the paper again.</p>
        </div>
      ) : (
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {run ? (
              <button
                type="button"
                onClick={() => setConfirmEnd(true)}
                disabled={busy}
                className="flex h-12 items-center rounded-lg border bg-card px-5 font-heading font-bold outline-none hover:border-wrong/60 hover:text-wrong focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                {complete ? 'New run' : 'End run'}
              </button>
            ) : (
              <CountPicker
                value={perSubject}
                options={BOARD_ITEM_COUNTS}
                onChange={setPerSubject}
                unit="per paper"
                label="Items per paper"
                detail={(n) => formatClock(timeLimitSec(n))}
                detailIcon={Timer}
                disabled={busy}
              />
            )}
            {complete ? (
              <button type="button" onClick={onSeeResult} className={cn(heroButtonClass, 'w-auto px-7 whitespace-nowrap focus-visible:ring-ring/50')}>
                <Play className="size-5 fill-current" aria-hidden />
                See board result
              </button>
            ) : (
              <button
                type="submit"
                className={cn(heroButtonClass, 'w-auto px-7 whitespace-nowrap focus-visible:ring-ring/50')}
                disabled={busy || available === 0 || top === null}
              >
                <Play className="size-5 fill-current" aria-hidden />
                {busy ? 'Starting…' : `Start ${top?.code ?? ''}`}
              </button>
            )}
          </div>
          {/* ALWAYS one line (h-4), so the paper above doesn't move. Only what isn't shown anywhere else:
              during a run, the items and time (the chip is gone then); and a warning when a subject has too few questions. */}
          <p className="flex h-4 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            {!complete && (
              <>
                {available !== null && available < items && <Info className="size-3.5 shrink-0 text-[#9A5B00]" aria-hidden />}
                {run && `${items} items · ${formatClock(timeLimitSec(items))} each`}
                {available === 0
                  ? `${run ? ' · ' : ''}No questions in ${top?.code ?? 'this subject'} yet`
                  : available !== null && available < items
                    ? `${run ? ' · ' : ''}Only ${available} question${available === 1 ? '' : 's'} in ${top?.code}`
                    : null}
              </>
            )}
          </p>
        </div>
      )}

      {/* ---------- The run's rules: one quiet line under it all (plain text, not things to tap) ---------- */}
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

      {/* ---------- End (or restart) the run: a real choice, so it asks first ---------- */}
      <Dialog open={confirmEnd} onClose={() => setConfirmEnd(false)} labelledBy="end-run-heading">
        <div className="space-y-4">
          <h2 id="end-run-heading" className="font-heading text-lg font-bold">
            {complete ? 'Start a new board run?' : 'End this board run?'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {complete
              ? 'This run’s result will be cleared from this page. Your answers still count in your progress.'
              : `You’ve taken ${done} of ${papers.length} papers. Your answers still count in your progress, but this run won’t get a board result.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmEnd(false)}
              className="h-11 flex-1 rounded-lg border bg-card font-heading font-bold outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              {complete ? 'Cancel' : 'Keep going'}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirmEnd(false)
                onEndRun()
              }}
              className="h-11 flex-1 rounded-lg bg-wrong font-heading font-bold text-white outline-none hover:bg-wrong/90 focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              {complete ? 'New run' : 'End run'}
            </button>
          </div>
        </div>
      </Dialog>
    </form>
  )
}
