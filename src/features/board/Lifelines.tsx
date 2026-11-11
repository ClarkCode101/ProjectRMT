import { CircleMinus, RotateCcw, ShieldCheck, type LucideIcon } from 'lucide-react'
import { LIFELINE_IDS, LIFELINE_NAMES, lifelineBlock, type LifelineId, type Pending, type QuestionLifelines } from '@/lib/board'
import { cn } from '@/lib/utils'

// Board Review lifelines (PROJECT_PLAN.md §14, Step 2b): the row under the choices on her own turn,
// and small gold pills for classmates watching it.

const ICONS: Record<LifelineId, LucideIcon> = { rule_out: CircleMinus, second_chance: RotateCcw, shield: ShieldCheck }

/** Is this lifeline working on the question on screen? */
function isOn(id: LifelineId, current: QuestionLifelines): boolean {
  if (id === 'rule_out') return current.ruledOut.length > 0
  if (id === 'second_chance') return current.secondChance
  return current.shield
}

/** The small line under a lifeline's name. */
function hint(id: LifelineId, state: 'on' | ReturnType<typeof lifelineBlock>, ruledOutCount: number, choiceCount: number): string {
  switch (state) {
    case 'on':
      return id === 'rule_out' ? `${ruledOutCount} ruled out` : id === 'second_chance' ? 'On: one more pick if wrong' : 'On: wrong won’t slide you'
    case 'used':
      return 'Used'
    case 'snakes-only':
      return 'Snakes only'
    case 'too-few-choices':
      return 'Too few choices'
    case 'after-pick':
      return 'Before your first pick'
    default:
      return id === 'rule_out' ? `Remove ${choiceCount >= 4 ? 2 : 1} wrong` : id === 'second_chance' ? 'One more pick if wrong' : 'Wrong won’t slide you'
  }
}

type BarProps = {
  current: QuestionLifelines
  used: readonly LifelineId[]
  pendingKind: Pending['kind']
  choiceCount: number
  onUse: (id: LifelineId) => void
  /** waiting for the database (team games) */
  busy?: boolean
}

/** Her lifelines, under the choices (thumb zone). Tapping a choice sends the answer, so the label says to use them first. */
export function LifelineBar({ current, used, pendingKind, choiceCount, onUse, busy = false }: BarProps) {
  return (
    <div className="border-t-2 border-dashed pt-3">
      <p className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Lifelines</span>
        <span className="text-xs font-semibold text-muted-foreground">Use before you answer · once per game</span>
      </p>
      <div className="grid grid-cols-3 gap-2">
        {LIFELINE_IDS.map((id) => {
          const Icon = ICONS[id]
          const on = isOn(id, current)
          const block = on ? null : lifelineBlock(id, { used, pendingKind, choiceCount, current })
          const state = on ? 'on' : block
          const label = LIFELINE_NAMES[id]
          const sub = hint(id, state, current.ruledOut.length, choiceCount)
          return (
            <button
              key={id}
              type="button"
              onClick={() => onUse(id)}
              disabled={on || block !== null || busy}
              aria-label={`${label}: ${sub}`}
              className={cn(
                'flex min-h-14 items-center justify-center gap-2 rounded-xl border bg-card px-2 py-1.5 text-center leading-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                state === null && 'font-bold text-primary hover:border-primary active:bg-secondary',
                state === 'on' && 'border-2 border-highlight bg-highlight-soft font-bold text-foreground',
                state === 'used' && 'border-dashed bg-muted/50 text-muted-foreground',
                (state === 'snakes-only' || state === 'too-few-choices' || state === 'after-pick') && 'border-dashed text-muted-foreground/70',
                busy && state === null && 'opacity-60',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className={cn('block text-sm sm:text-[15px]', state === 'used' && 'line-through')}>{label}</span>
                <span className={cn('block text-xs font-semibold', state === 'on' ? 'text-foreground/75' : 'text-muted-foreground')}>{sub}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Small icons of the lifelines a player spent (team finish screen); nothing when none. */
export function LifelineIcons({ used, className }: { used: readonly LifelineId[]; className?: string }) {
  const spent = LIFELINE_IDS.filter((id) => used.includes(id))
  if (spent.length === 0) return null
  return (
    <span role="img" aria-label={`Lifelines used: ${spent.map((id) => LIFELINE_NAMES[id]).join(', ')}`} className={cn('inline-flex items-center gap-0.5', className)}>
      {spent.map((id) => {
        const Icon = ICONS[id]
        return <Icon key={id} className="size-3.5" aria-hidden />
      })}
    </span>
  )
}

/** For classmates watching: which lifelines are working on this question ("Ana used Rule out 2"). Nothing when none. */
export function LifelinePills({ current, who }: { current: QuestionLifelines; who: string }) {
  const pills = LIFELINE_IDS.filter((id) => isOn(id, current))
  if (pills.length === 0) return null
  return (
    <p className="flex flex-wrap gap-1.5" aria-label="Lifelines on this question">
      {pills.map((id) => {
        const Icon = ICONS[id]
        return (
          <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-highlight/60 bg-highlight-soft px-2.5 py-0.5 text-sm font-semibold">
            <Icon className="size-4" aria-hidden />
            {id === 'rule_out' ? `${who} used Rule out 2` : `${LIFELINE_NAMES[id]} on`}
          </span>
        )
      })}
    </p>
  )
}
