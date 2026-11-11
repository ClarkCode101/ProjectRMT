import { CloudOff, Dices } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { ExitButton } from '@/components/ExitButton'
import { heroButtonClass } from '@/components/report'
import { Button } from '@/components/ui/button'
import { layoutOf, rollDie, zoneOf } from '@/lib/board'
import { eventLine, formatTurnClock, playerColor, turnExpired, turnOrder, turnSecondsLeft, type TeamRoom } from '@/lib/boardTeam'
import { keyToPosition } from '@/lib/choiceKeys'
import { useOnline } from '@/lib/offline/useOfflineSync'
import { shuffledChoiceOrder } from '@/lib/quiz'
import { useSubjectOfTopic } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import type { QuizQuestion } from '@/features/quiz/api'
import { BoardGrid, type BoardToken } from './BoardGrid'
import { DevAnswerHint } from './DevAnswerHint'
import { teamActions } from './teamApi'
import { DieFace, TurnSheet } from './TurnSheet'
import { useFittedBoardWidth } from './useFittedBoardWidth'

/** Same timing as the solo roll (BoardPage): the die tumbles, then its number shows. */
const SPIN_MS = 700
const SHOW_MS = 850

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const ORDINALS = ['1st', '2nd', '3rd', '4th']

type Props = {
  room: TeamRoom
  /** when this copy of the room was read (for the turn clock) */
  fetchedAt: number
  act: (action: () => Promise<unknown>) => Promise<boolean>
  message: string | null
  onLeft: () => void
}

/**
 * The live team game. Everyone sees the same board; the player whose turn it is rolls and answers, the others
 * watch the question and the answer reveal. The database decides everything (roll, question, right or wrong);
 * this screen only shows it, with the same die and popup as the solo game.
 */
export function TeamGame({ room, fetchedAt, act, message, onLeft }: Props) {
  const online = useOnline()
  const subjectOf = useSubjectOfTopic()
  const { measure, width } = useFittedBoardWidth()

  const me = room.players.find((p) => p.userId === room.me)
  const myTurn = room.turnUser === room.me
  const turnPlayer = room.players.find((p) => p.userId === room.turnUser)
  const order = turnOrder(room.players)

  // ---------- The clock (ticks 4 times a second) ----------
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])
  const secondsLeft = turnSecondsLeft(room.deadline, room.serverNow, fetchedAt, now)

  // The clock ran out: anyone in the room passes the turn on (the database checks it really is over). Once per deadline.
  const skippedFor = useRef<string | null>(null)
  useEffect(() => {
    if (room.status !== 'playing' || !room.deadline || skippedFor.current === room.deadline) return
    if (turnExpired(room.deadline, room.serverNow, fetchedAt, now)) {
      skippedFor.current = room.deadline
      void act(() => teamActions.skip(room.id))
    }
  }, [now, room.status, room.deadline, room.serverNow, room.id, fetchedAt, act])

  // ---------- What's been shown already (the turn order, each roll, each answer reveal) ----------
  // Something that happened more than 8 seconds before she opened the screen isn't replayed.
  const [seen, setSeen] = useState<Set<string>>(() => {
    const e = room.lastEvent
    const age = e ? Date.parse(room.serverNow) - Date.parse(e.at) : 0
    return new Set(e && age > 8000 ? [e.at] : [])
  })
  const markSeen = (at: string) => setSeen((s) => new Set(s).add(at))
  const event = room.lastEvent
  const unseen = event && !seen.has(event.at) ? event : null

  // ---------- The die in the middle of the screen ----------
  const [dice, setDice] = useState<{ face: number; landed: boolean; who: string } | null>(null)
  const rollingMine = useRef(false)

  const tumbleTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (tumbleTimer.current !== null) window.clearInterval(tumbleTimer.current)
  }, [])

  /** The die comes to the middle and tumbles (random faces) until landDie. With Reduce Motion: no tumble. */
  function startTumble(who: string) {
    if (prefersReducedMotion()) return
    setDice({ face: rollDie(), landed: false, who })
    tumbleTimer.current = window.setInterval(() => setDice((d) => (d && !d.landed ? { ...d, face: rollDie() } : d)), 110)
  }
  function stopTumble() {
    if (tumbleTimer.current !== null) window.clearInterval(tumbleTimer.current)
    tumbleTimer.current = null
  }
  /** It lands on the real number (after at least SPIN_MS of tumbling), shows it, then goes away. */
  function landDie(value: number, who: string, startedAt: number) {
    const wait = prefersReducedMotion() ? 0 : Math.max(0, SPIN_MS - (Date.now() - startedAt))
    window.setTimeout(() => {
      stopTumble()
      setDice({ face: value, landed: true, who })
      window.setTimeout(() => setDice(null), SHOW_MS)
    }, wait)
  }

  // My roll: the die starts tumbling right away and lands on the number the database rolled.
  async function roll() {
    if (!myTurn || room.phase !== 'roll' || dice || rollingMine.current) return
    rollingMine.current = true
    const startedAt = Date.now()
    startTumble('You')
    let value: number | null = null
    const ok = await act(async () => {
      value = await teamActions.roll(room.id)
    })
    if (ok && value !== null) {
      landDie(value, 'You', startedAt)
    } else {
      stopTumble()
      setDice(null)
    }
    rollingMine.current = false
  }

  // Someone else rolled: everyone sees the die land on their number. (Her own roll is already animating.)
  useEffect(() => {
    if (unseen?.kind !== 'roll') return
    markSeen(unseen.at)
    if (unseen.userId !== room.me) {
      const startedAt = Date.now()
      startTumble(unseen.name)
      landDie(unseen.roll, unseen.name, startedAt)
    }
    // only when a new roll arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen?.at])

  // Timeouts and leaves need no popup: the line at the bottom says it.
  useEffect(() => {
    if (unseen && (unseen.kind === 'timeout' || unseen.kind === 'left')) markSeen(unseen.at)
  }, [unseen])

  // ---------- The question popup ----------
  const [checking, setChecking] = useState(false)
  // Each question's choices are shuffled once per screen (what she picks is saved in the original order).
  const orders = useRef(new Map<string, number[]>())
  function orderFor(id: string, count: number) {
    if (!orders.current.has(id)) orders.current.set(id, shuffledChoiceOrder(count))
    return orders.current.get(id)!
  }

  // An answer reveal stays up until she taps Continue, even if the next player rolls meanwhile
  // (the database only keeps the latest event, so it's copied here).
  type Reveal = { event: Extract<NonNullable<TeamRoom['lastEvent']>, { kind: 'answer' }>; question: NonNullable<TeamRoom['lastQuestion']> }
  const [shownReveal, setShownReveal] = useState<Reveal | null>(null)
  useEffect(() => {
    if (unseen?.kind !== 'answer' || room.lastQuestion?.id !== unseen.questionId) return
    markSeen(unseen.at)
    setShownReveal({ event: unseen, question: room.lastQuestion })
    // only when a new answer arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen?.at, room.lastQuestion?.id])
  const reveal = shownReveal?.event ?? null
  const showOrder = unseen?.kind === 'order'
  const current = room.status === 'playing' && room.phase === 'answer' && room.pending && room.question ? room.question : null

  async function choose(originalIndex: number) {
    if (!myTurn || !current || checking) return
    setChecking(true)
    await act(() => teamActions.answer(room.id, originalIndex))
    setChecking(false)
  }

  // Keyboard on a computer: A–D or 1–4 answers her own question.
  const chooseRef = useRef(choose)
  useEffect(() => {
    chooseRef.current = choose
  })
  useEffect(() => {
    if (!myTurn || !current || reveal) return
    const choiceOrder = orderFor(current.id, current.choices.length)
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const position = keyToPosition(e.key)
      if (position === -1 || position >= choiceOrder.length) return
      void chooseRef.current(choiceOrder[position])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [myTurn, current, reveal])

  const subjectLabel = (topicId: number) => {
    const s = subjectOf(topicId)
    return [s.code, s.topicName].filter(Boolean).join(' · ')
  }

  // ---------- Tokens: while a reveal is up, the answering player's token waits on its old square ----------
  const tokens: BoardToken[] = useMemo(
    () =>
      room.players
        .filter((p) => p.status === 'joined' || p.userId === room.winnerId)
        .map((p) => ({
          id: p.userId,
          square: reveal && reveal.userId === p.userId ? reveal.from : p.position,
          color: playerColor(room.players, p.userId),
          label: p.userId === room.me ? 'You' : p.name,
          isMe: p.userId === room.me,
        })),
    [room.players, room.me, room.winnerId, reveal],
  )

  const [confirmLeave, setConfirmLeave] = useState(false)
  const out = me && me.status !== 'joined'
  const canRoll = myTurn && room.phase === 'roll' && !dice && !reveal && !showOrder && room.status === 'playing'
  const line = eventLine(event, room.me)

  const popup = !dice && (showOrder || reveal || current)

  return (
    <div className="fixed inset-0 z-20 flex flex-col gap-3 bg-background px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6">
      <h1 className="sr-only">Board Review team game</h1>

      {/* ---------- Top: Exit, and the players in turn order (whose turn it is, with the clock) ---------- */}
      <div className="mx-auto flex w-full max-w-5xl shrink-0 items-center gap-3">
        <ExitButton onClick={() => (out ? onLeft() : setConfirmLeave(true))} />
        <ol className="flex min-w-0 flex-1 flex-wrap justify-end gap-1.5" aria-label="Players in turn order">
          {order.map((p) => {
            const isTurn = p.userId === room.turnUser
            return (
              <li
                key={p.userId}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border bg-card py-1 pr-2.5 pl-1 text-sm tabular-nums',
                  isTurn && 'border-primary ring-2 ring-primary/30',
                )}
              >
                <span className="size-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: playerColor(room.players, p.userId) }} aria-hidden />
                <span className="max-w-24 truncate font-semibold">{p.userId === room.me ? 'You' : p.name}</span>
                <span className="text-muted-foreground">{p.position}</span>
                {isTurn && (
                  <span className={cn('rounded-full bg-secondary px-1.5 font-heading text-xs font-bold', secondsLeft <= 15 && 'bg-wrong-soft text-wrong')}>
                    <span className="sr-only">, their turn, time left </span>
                    {formatTurnClock(secondsLeft)}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      {message && (
        <p role="alert" className="mx-auto w-full max-w-5xl shrink-0 rounded-md border border-wrong/40 bg-wrong-soft p-3 text-sm">
          {message}
        </p>
      )}
      {out && (
        <p role="status" className="mx-auto w-full max-w-5xl shrink-0 rounded-md border border-highlight/50 bg-highlight-soft p-3 text-sm">
          {me?.status === 'removed' ? 'You missed 2 turns, so you’re out of this game.' : 'You left this game.'} You can keep watching, or tap Exit.
        </p>
      )}

      {/* ---------- The board ---------- */}
      <div ref={measure} className="flex min-h-0 flex-1 items-center justify-center">
        {width !== null && <BoardGrid tokens={tokens} layout={layoutOf(room.layoutId)} className="shrink-0" style={{ width }} />}
      </div>

      {!online && (
        <p role="status" className="flex shrink-0 items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <CloudOff className="size-4 shrink-0" aria-hidden />
          Offline. Team games need the internet; reconnecting…
        </p>
      )}

      {/* ---------- Bottom: Roll when it's her turn; otherwise what's happening ---------- */}
      <div className="mx-auto flex w-full max-w-md shrink-0 flex-col items-center gap-1.5">
        <p className="h-5 truncate text-center text-sm text-muted-foreground" aria-live="polite">
          {myTurn && room.phase === 'roll'
            ? `Your turn! You’re in the ${zoneOf(me?.position ?? 1)} zone.`
            : turnPlayer && room.phase === 'roll'
              ? `${turnPlayer.name}’s turn to roll.`
              : (line ?? '')}
        </p>
        <div className="flex w-full items-center gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-card">
            <Dices className="size-9 text-primary-deep" aria-hidden />
          </div>
          <button type="button" className={cn(heroButtonClass, 'flex-1 focus-visible:ring-ring/40 sm:flex sm:w-auto')} onClick={roll} disabled={!canRoll}>
            <Dices className="size-5" aria-hidden />
            {canRoll ? `Roll · ${formatTurnClock(secondsLeft)}` : myTurn ? 'Your turn' : turnPlayer ? `${turnPlayer.name}’s turn` : 'Waiting…'}
          </button>
        </div>
      </div>

      {/* ---------- The die, for every roll (hers and everyone else's) ---------- */}
      {dice && (
        <div className="animate-in fade-in fixed inset-0 z-30 flex items-center justify-center bg-[#0B2F4A]/25 backdrop-blur-md duration-200">
          <div className="flex flex-col items-center gap-3">
            <div
              key={dice.landed ? 'landed' : 'tumbling'}
              className={cn(
                'flex size-36 items-center justify-center rounded-[2rem] border border-white/80 bg-white shadow-[0_24px_60px_-20px_rgb(7_54_74/0.6)] sm:size-44',
                dice.landed ? 'die-land' : 'die-tumble',
              )}
            >
              <DieFace value={dice.face} className="size-28 text-primary-deep sm:size-36" />
            </div>
            <p aria-live="assertive" className={cn('font-heading text-2xl font-bold text-white drop-shadow', !dice.landed && 'invisible')}>
              {dice.landed ? `${dice.who} rolled ${dice.face}` : 'Rolling'}
            </p>
          </div>
        </div>
      )}

      {/* ---------- The popup: the turn order, an answer reveal, or the question on screen ---------- */}
      <Dialog
        open={Boolean(popup)}
        onClose={() => {
          // Esc only closes the turn order or a reveal (a question stays up).
          if (showOrder && event) markSeen(event.at)
          else if (reveal) setShownReveal(null)
        }}
        labelledBy="team-popup-heading"
        variant="bottom"
        closeOnBackdrop={false}
        closeOnEscape={Boolean(showOrder || reveal)}
      >
        {showOrder && unseen?.kind === 'order' ? (
          <div className="space-y-4">
            <h2 id="team-popup-heading" className="font-heading text-xl font-bold">
              Turn order
            </h2>
            <p className="text-sm text-muted-foreground">Everyone rolled once. Highest goes first.</p>
            <ol className="divide-y rounded-lg border bg-card">
              {unseen.order.map((o) => (
                <li key={o.userId} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-9 font-heading font-bold text-muted-foreground">{ORDINALS[o.seat] ?? `${o.seat + 1}th`}</span>
                  <span className="size-4 rounded-full" style={{ backgroundColor: playerColor(room.players, o.userId) }} aria-hidden />
                  <span className="flex-1 font-semibold">{o.userId === room.me ? 'You' : o.name}</span>
                  <DieFace value={o.roll} className="size-7 text-primary-deep" />
                </li>
              ))}
            </ol>
            <Button className="h-12 w-full rounded-xl font-heading text-lg font-bold" onClick={() => markSeen(unseen.at)} autoFocus>
              {unseen.order[0]?.userId === room.me ? 'You go first. Let’s go!' : `${unseen.order[0]?.name ?? 'They'} goes first. Let’s go!`}
            </Button>
          </div>
        ) : reveal && shownReveal ? (
          <TurnSheet
            headingId="team-popup-heading"
            purpose={reveal.purpose}
            question={toQuiz(shownReveal.question, true)}
            subjectLabel={subjectLabel(shownReveal.question.topicId)}
            weakTopicName={null}
            order={orderFor(shownReveal.question.id, shownReveal.question.choices.length)}
            selectedIndex={reveal.selected}
            position={reveal.from}
            onChoose={() => {}}
            onContinue={() => setShownReveal(null)}
            watching={reveal.userId === room.me ? undefined : reveal.name}
          />
        ) : current && room.pending ? (
          <TurnSheet
            headingId="team-popup-heading"
            purpose={room.pending}
            question={toQuiz(current, false)}
            subjectLabel={subjectLabel(current.topicId)}
            weakTopicName={null}
            order={orderFor(current.id, current.choices.length)}
            selectedIndex={undefined}
            position={turnPlayer?.position ?? 1}
            onChoose={(i) => void choose(i)}
            onContinue={() => {}}
            watching={myTurn ? undefined : (turnPlayer?.name ?? 'A classmate')}
            clockSeconds={secondsLeft}
            checking={checking}
          />
        ) : null}
        {/* npm run dev only: the right answer, for live testing (removed from the deployed build) */}
        {import.meta.env.DEV && current && room.pending && !reveal && !showOrder && (
          <DevAnswerHint questionId={current.id} order={orderFor(current.id, current.choices.length)} />
        )}
      </Dialog>

      <Dialog open={confirmLeave} onClose={() => setConfirmLeave(false)} labelledBy="team-leave-heading">
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 id="team-leave-heading" className="text-xl font-bold">
              Leave the game?
            </h2>
            <p className="text-muted-foreground">You’ll be out of the turns and can’t come back to this game. Your answers so far still count in your scores.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="h-11 rounded-lg text-base font-bold sm:order-2" onClick={() => setConfirmLeave(false)}>
              Keep playing
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-lg text-base sm:order-1"
              onClick={async () => {
                setConfirmLeave(false)
                if (await act(() => teamActions.leave(room.id))) onLeft()
              }}
            >
              Leave game
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

/** A team question in the shape the popup uses. Before the reveal its answer isn't known (correct_index -1). */
function toQuiz(q: TeamRoom['question'] & object, withAnswer: boolean): QuizQuestion {
  const reveal = withAnswer ? (q as Partial<NonNullable<TeamRoom['lastQuestion']>>) : null
  return {
    id: q.id,
    topic_id: q.topicId,
    source: 'builtin',
    stem: q.stem,
    choices: q.choices,
    correct_index: reveal?.correctIndex ?? -1,
    explanation: reveal?.explanation ?? null,
    choice_notes: reveal?.choiceNotes ?? null,
  }
}
