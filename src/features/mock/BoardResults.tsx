import { Check, House, RotateCcw, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { NoteCard } from '@/components/NoteCard'
import { VerseCard } from '@/components/VerseCard'
import { HeroPanel, heroButtonClass } from '@/components/report'
import { boardVerdict, type BoardRun } from '@/lib/boardRun'
import { FAILED_WEIGHT_LIMIT, FLOOR_LABEL, formatPercent, PASSING_LABEL, subjectWeight } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import { PaperRule, ResultRow, ResultTable } from './MockResults'

// The Full Board's result, after the sixth paper: drawn as the same analyzer printout as a paper's results.
// - the general average (weighted like the board) and the PASSED / NOT YET stamp
// - the three rules of RA 5527, each with a check or a cross, so she sees exactly WHY she passed or not
// - every paper's score, with its weight

/** One of the board's three rules, with a check (met) or a cross (not met). */
function Rule({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-white', ok ? 'bg-correct' : 'bg-wrong')}>
        {ok ? <Check className="size-3.5" aria-label="Met" /> : <X className="size-3.5" aria-label="Not met" />}
      </span>
      <span className="text-sm">{children}</span>
    </li>
  )
}

export function BoardResults({ run, note, onNewRun }: { run: BoardRun; note: string | null; onNewRun: () => void }) {
  const v = boardVerdict(run)
  const passed = v.passed === true
  const failedPct = Math.round(v.failedWeight * 100)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <HeroPanel labelledBy="board-result-heading" className="relative z-10 space-y-4 rounded-2xl pb-7 sm:pb-8">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <h1 id="board-result-heading" className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase">
              <span className="size-2.5 rounded-full bg-[#5EE39A] shadow-[0_0_10px_2px_rgb(255_255_255/0.25)] ring-2 ring-white/20" aria-hidden />
              Board run complete
              <span className="font-semibold text-white/70">
                · {run.papers.length} papers · {run.perSubject} items each
              </span>
            </h1>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
              <button type="button" className={heroButtonClass} onClick={onNewRun}>
                <RotateCcw className="size-5" aria-hidden />
                New board run
              </button>
              <Link
                to="/"
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-white/10 px-5 font-heading text-base font-bold text-white outline-none hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-white/60 active:translate-y-px"
              >
                <House className="size-5" aria-hidden />
                Back to Home
              </Link>
            </div>
          </div>
          <div aria-hidden className="absolute inset-x-5 bottom-3 h-2 rounded-full bg-black/40 shadow-[inset_0_2px_3px_rgb(0_0_0/0.5)] sm:inset-x-7" />
        </HeroPanel>

        <div className="-mt-3 overflow-hidden px-6 pb-6 sm:px-9">
          <article aria-label="Printout" className="printout-feed drop-shadow-[0_14px_18px_rgb(7_71_94/0.18)]">
            <div className="space-y-4 bg-card px-4 pt-6 pb-5 sm:px-6">
              <p className="text-center font-mono text-xs tracking-widest text-muted-foreground uppercase">Full board report</p>

              {/* the general average, with the stamp like a released lab result */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">General average</p>
                  <p className={cn('font-heading text-6xl leading-none font-bold tabular-nums sm:text-7xl', !passed && 'text-wrong')}>
                    {v.average === null ? '—' : formatPercent(v.average)}
                  </p>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">weighted like the board</p>
                  <p className="mt-2 text-sm">
                    {passed ? 'If this were the real exam, you’d pass. Keep it there.' : 'Not yet. The rules below show exactly what to work on.'}
                  </p>
                </div>
                <p
                  className={cn(
                    'stamp shrink-0 rounded-md border-[3px] px-3 py-1.5 text-center font-heading text-lg leading-none font-bold sm:text-xl',
                    passed ? 'border-correct text-correct' : 'border-wrong text-wrong',
                  )}
                >
                  {passed ? 'PASSED' : 'NOT YET'}
                </p>
              </div>
              <PaperRule />

              {/* ---------- The three rules (RA 5527, Sec. 19) ---------- */}
              <div>
                <p className="pb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase">To pass the board</p>
                <ul className="space-y-2">
                  <Rule ok={v.averageOk}>
                    General average of at least <span className="font-bold">{PASSING_LABEL}</span>
                    {v.average !== null && <span className="text-muted-foreground tabular-nums"> · yours is {formatPercent(v.average)}</span>}
                  </Rule>
                  <Rule ok={v.belowFloor.length === 0}>
                    No subject below <span className="font-bold">{FLOOR_LABEL}</span>
                    {v.belowFloor.length > 0 && <span className="text-wrong"> · {v.belowFloor.join(', ')}</span>}
                  </Rule>
                  <Rule ok={v.failedWeight < FAILED_WEIGHT_LIMIT - 1e-9}>
                    Subjects below {PASSING_LABEL} weigh less than <span className="font-bold">{Math.round(FAILED_WEIGHT_LIMIT * 100)}%</span> of the exam
                    <span className="text-muted-foreground tabular-nums"> · yours: {failedPct}%</span>
                  </Rule>
                </ul>
              </div>
              <PaperRule />

              {/* ---------- Every paper, with its weight ---------- */}
              <ResultTable title="By paper">
                {run.papers.map((p) =>
                  p.result ? (
                    <ResultRow
                      key={p.subjectId}
                      code={p.code}
                      name={`${p.name} · ${Math.round(subjectWeight(p.code) * 100)}%`}
                      correct={p.result.correct}
                      total={p.result.total}
                    />
                  ) : null,
                )}
              </ResultTable>
              <p className="text-xs text-muted-foreground">
                Each paper’s missed items are in its own results, and come back in Review again on Practice.
              </p>
              <p className="text-center font-mono text-xs tracking-widest text-muted-foreground uppercase">— End of report —</p>
            </div>
            <div aria-hidden className="paper-tear" />
          </article>
        </div>
      </div>

      {note && <NoteCard message={note} />}
      <VerseCard />
    </div>
  )
}
