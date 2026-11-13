import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, MessageCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { Button } from '@/components/ui/button'
import type { RoomChat as RoomChatState } from '@/features/board/chatApi'
import { ChatSheet, PopupChatRow } from '@/features/board/RoomChat'
import { usePlayAgain } from '@/features/games/usePlayAgain'
import { GameFinish, type Standing, type StandingBadge } from '@/features/games/GameFinish'
import { playerColor, playingAgainIds, TOKEN_COLORS, type TeamRoom } from '@/lib/boardTeam'
import { CARD_SUBJECTS, movesFromLog } from '@/lib/cards'
import type { LiveReveal, LiveView } from '@/lib/cardsLive'
import { devAnswerLetter } from '@/lib/cardsDev'
import { choiceOrderFor, formatClock, purposeOf, secondsLeft, tableFromView } from '@/lib/cardsLiveTable'
import { useSubjectOfTopic, useSubjects } from '@/lib/referenceData'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { CardsGameView } from './CardsGameView'
import { handState } from './handState'
import { HowToPlay } from './HowToPlay'
import { LiveQuestionSheet, type LivePurpose } from './LiveQuestionSheet'
import { CardsLiveDevPanel } from './CardsLiveDevPanel'
import { cardsLive } from './liveApi'
import { cardsLiveDev } from './liveDevApi'
import { SubjectPicker } from './SubjectPicker'

// A Last Card game with classmates (PROJECT_PLAN.md §15 step 3): the same table as the solo game, played on the server.
// Her view (card_views: her own cards, the others as counts) comes from the database; Realtime brings each change, and
// every move she makes goes to the Edge Function `cards-game`, whose answer updates the screen at once.

/** Her own view of the game; Realtime brings each change (the database only sends her own row). */
function useMyCardView(roomId: string) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['card-view', roomId],
    queryFn: async (): Promise<LiveView | null> => {
      const { data, error } = await supabase.from('card_views').select('view').eq('room_id', roomId).maybeSingle()
      if (error) throw new Error('Couldn’t load the game. Check your internet connection.')
      return (data?.view as unknown as LiveView | undefined) ?? null
    },
    refetchInterval: 15_000, // fallback if the live connection drops
  })
  useEffect(() => {
    const channel = supabase
      .channel(`card-view-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_views', filter: `room_id=eq.${roomId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ['card-view', roomId] })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId, queryClient])
  return query
}

/** The question popup on screen: the question, what it's for, who answers, and (once in) the answer. */
type Shown = {
  question: NonNullable<LiveView['question']>
  purpose: LivePurpose
  mine: boolean
  who: string
  order: number[]
  reveal: LiveReveal | null
}

function showFor(view: LiveView): Shown | null {
  const question = view.question
  const purpose = purposeOf(view)
  if (!question || !purpose) return null
  return {
    question,
    purpose,
    mine: question.seat === view.seat,
    who: view.seats[question.seat]?.name ?? 'A classmate',
    order: choiceOrderFor(question.id, question.choices.length),
    reveal: null,
  }
}

/** When someone else won, a moment to see the last card go down before the finish screen. */
const FINISH_PAUSE_MS = 1400
/** Asks the server to pass a timed-out turn this long after the clock runs out (the server checks the time). */
const TIMEOUT_GRACE_MS = 1500

export function CardsLiveRoom({ room, chat }: { room: TeamRoom; chat: RoomChatState }) {
  const roomId = room.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const view = useMyCardView(roomId)
  const subjects = useSubjects()
  const subjectOf = useSubjectOfTopic()

  const [pickedId, setPickedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [shown, setShown] = useState<Shown | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [showFinish, setShowFinish] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // npm run dev only (the DEV panel): show the answer of the question up now (asked from the server with the dev key)
  const [devShowAnswers, setDevShowAnswers] = useState(false)
  const [devAnswer, setDevAnswer] = useState<{ questionId: string; correctIndex: number } | null>(null)

  const v = view.data ?? null
  const table = useMemo(() => (v ? tableFromView(v, roomId) : null), [v, roomId])
  const colorOf = (userId: string) => playerColor(room.players, userId)

  // The clock ticks every second.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // The question popup follows the game: a new question comes up; her (or their) answer turns it into the reveal; a
  // question that ended without an answer (time ran out, they left) closes. A reveal still on screen is never
  // replaced: the next question waits until it's closed.
  // It's state (not worked out during render) because the popup has to REMEMBER the question and what it was for after
  // the server has moved on, to show the reveal; each update from the server is the outside change it follows.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!v) return
    if (!shown) {
      if (v.question && !v.finished) setShown(showFor(v))
      return
    }
    if (shown.reveal) return
    if (v.reveal && v.reveal.question.id === shown.question.id) setShown({ ...shown, reveal: v.reveal })
    else if (!v.question || v.question.id !== shown.question.id) setShown(v.question ? showFor(v) : null)
  }, [v, shown])
  /* eslint-enable react-hooks/set-state-in-effect */

  // npm run dev only: "Show answers" asks the server (dev key) for the answer of each new question.
  const devQuestionId = import.meta.env.DEV && devShowAnswers && shown && !shown.reveal ? shown.question.id : null
  useEffect(() => {
    if (!import.meta.env.DEV || !devQuestionId || devAnswer?.questionId === devQuestionId) return
    cardsLiveDev
      .answer(roomId)
      .then(setDevAnswer)
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message : 'DEV: couldn’t get the answer.'))
  }, [devQuestionId, devAnswer?.questionId, roomId])

  // Anyone may ask the server to pass a turn once its clock has run out (the server checks the time itself).
  const deadline = v?.deadline ?? null
  const finished = v?.finished ?? false
  useEffect(() => {
    if (!deadline || finished) return
    const timer = window.setTimeout(
      () => {
        cardsLive
          .timeout(roomId)
          .then((next) => queryClient.setQueryData(['card-view', roomId], next))
          .catch(() => {}) // someone else passed it on first, or offline: the next update brings it
      },
      Math.max(0, Date.parse(deadline) - Date.now() + TIMEOUT_GRACE_MS),
    )
    return () => window.clearTimeout(timer)
  }, [deadline, finished, roomId, queryClient])

  // The game ended: the finish screen (right away if she won; after a moment otherwise).
  useEffect(() => {
    if (!finished || shown) return
    const timer = window.setTimeout(() => setShowFinish(true), v && v.winner === v.seat ? 300 : FINISH_PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [finished, shown, v])

  /** Sends a move; the server's answer (her new view) shows at once. A refused move shows its reason. */
  async function run(action: () => Promise<LiveView>) {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      queryClient.setQueryData(['card-view', roomId], await action())
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    setConfirmLeave(false)
    try {
      await cardsLive.leave(roomId)
    } catch {
      // offline: the 90-second clock moves on without her, and a computer player takes over after 3 missed turns
    }
    navigate('/cards')
  }

  if (view.isPending) return <FullPageMessage>Loading the game…</FullPageMessage>
  if (view.isError || !v || !table) return <FullPageMessage>{view.error?.message ?? 'This game isn’t available.'}</FullPageMessage>

  if (finished && showFinish) {
    return (
      <LiveFinish
        view={v}
        room={room}
        practiceHref={(code) => {
          const id = subjects.data?.find((s) => s.code === code)?.id
          return id ? `/practice?subject=${id}` : '/practice'
        }}
      />
    )
  }

  const hand = handState(table.game, pickedId, shown !== null)
  const seconds = secondsLeft(deadline, now)
  const clock = deadline && !finished ? { text: formatClock(seconds), low: seconds <= 15 } : undefined
  const choosingSubject = v.pending?.kind === 'chooseSubject' && v.turn === v.seat && !shown && !finished
  const watchingOnly = v.seat === -1 && !finished

  const chatButton = (
    <button
      type="button"
      onClick={() => {
        setChatOpen(true)
        chat.markRead()
      }}
      aria-label={chat.unread > 0 ? `Chat, ${chat.unread} new` : 'Chat'}
      title="Chat"
      className="relative flex size-10 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-[0_1px_3px_rgb(23_34_44/0.08)] outline-none hover:border-primary/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <MessageCircle className="size-5" aria-hidden />
      {chat.unread > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-wrong px-1 text-[11px] font-bold text-white tabular-nums" aria-hidden>
          {chat.unread}
        </span>
      )}
    </button>
  )

  return (
    <CardsGameView
      game={table.game}
      hand={hand}
      online
      message={watchingOnly ? 'A computer player took your seat (3 missed turns in a row). You can watch the rest of the game.' : message}
      onHelp={() => setHelpOpen(true)}
      onExit={() => (watchingOnly ? navigate('/cards') : setConfirmLeave(true))}
      onPick={(id) => setPickedId((current) => (current === id ? null : id))}
      onDraw={() => run(() => (hand.keepingDrawn ? cardsLive.keep(roomId) : cardsLive.draw(roomId)))}
      onAnswerToPlay={() => {
        const cardId = hand.picked
        if (!cardId) return
        setPickedId(null)
        void run(() => cardsLive.play(roomId, cardId))
      }}
      paused={shown !== null}
      movesOf={movesFromLog}
      clock={clock}
      topRight={chatButton}
      devTools={
        import.meta.env.DEV && (
          <CardsLiveDevPanel
            onRun={(op) => run(() => cardsLiveDev.run(roomId, op))}
            showAnswers={devShowAnswers}
            onShowAnswers={setDevShowAnswers}
            nextName={v.seats[(((v.seat + v.direction) % v.seats.length) + v.seats.length) % v.seats.length]?.name ?? 'Next player'}
            drawPileCount={v.drawPileCount}
          />
        )
      }
    >
      {/* The question: hers to answer, or someone else's to watch; then the reveal for everyone. */}
      <Dialog open={shown !== null} onClose={() => {}} labelledBy="live-question-heading" variant="bottom" closeOnBackdrop={false} closeOnEscape={false}>
        {shown && (
          <LiveQuestionSheet
            headingId="live-question-heading"
            mine={shown.mine}
            who={shown.who}
            purpose={shown.purpose}
            question={shown.question}
            reveal={shown.reveal}
            order={shown.order}
            subjectLabel={[shown.question.subjectCode, subjectOf(shown.question.topicId).topicName].filter(Boolean).join(' · ')}
            sending={busy}
            onChoose={(index) => run(() => cardsLive.answer(roomId, index))}
            onContinue={() => setShown(null)}
            clock={clock}
            footer={<PopupChatRow chat={chat} me={room.me} watching={!shown.mine} colorOf={colorOf} />}
          />
        )}
        {/* npm run dev only: the right answer (from the server, dev key), to answer right or wrong on purpose */}
        {import.meta.env.DEV && devShowAnswers && shown && !shown.reveal && devAnswer?.questionId === shown.question.id && (
          <p className="mt-3 rounded-md border border-dashed border-wrong/60 bg-wrong-soft px-3 py-2 font-mono text-xs" role="note">
            <span className="font-bold">DEV TEST ONLY · </span>
            Answer: {devAnswerLetter(devAnswer.correctIndex, shown.order)}. {shown.question.choices[devAnswer.correctIndex]}
          </p>
        )}
        {message && shown && (
          <p role="alert" className="mt-3 rounded-md border border-wrong/40 bg-wrong-soft p-3 text-sm">
            {message}
          </p>
        )}
      </Dialog>

      {/* After a right Wild: she picks the next subject. */}
      <Dialog open={choosingSubject} onClose={() => {}} labelledBy="live-pick-subject-heading" variant="bottom" closeOnBackdrop={false} closeOnEscape={false}>
        <SubjectPicker headingId="live-pick-subject-heading" onPick={(subject) => run(() => cardsLive.choose(roomId, subject))} />
      </Dialog>

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} labelledBy="live-how-to-play-heading" size="lg">
        <HowToPlay headingId="live-how-to-play-heading" onClose={() => setHelpOpen(false)} />
      </Dialog>

      {/* Leaving is for good in a live game: a computer player takes her seat and cards. */}
      <Dialog open={confirmLeave} onClose={() => setConfirmLeave(false)} labelledBy="live-leave-heading">
        <div className="space-y-4">
          <h2 id="live-leave-heading" className="font-heading text-xl font-bold">
            Leave the game?
          </h2>
          <p className="text-muted-foreground">A computer player takes your seat and your cards. Your answers so far count in your scores.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11" onClick={() => setConfirmLeave(false)} autoFocus>
              Stay
            </Button>
            <Button className={cn('h-11 bg-wrong text-white hover:bg-wrong/90')} onClick={leave}>
              <LogOut className="size-4" aria-hidden />
              Leave game
            </Button>
          </div>
        </div>
      </Dialog>

      <ChatSheet open={chatOpen} onClose={() => setChatOpen(false)} chat={chat} me={room.me} moment="game" colorOf={colorOf} headingId="live-chat-heading" />
    </CardsGameView>
  )
}

/** The finish screen of a live game: who won, everyone's cards left, her own answers, and Play again. */
function LiveFinish({ view, room, practiceHref }: { view: LiveView; room: TeamRoom; practiceHref: (code: string) => string }) {
  const playAgain = usePlayAgain(room, 'cards')
  const me = view.seat
  const winnerName = view.winner === null ? null : view.winner === me ? 'You' : view.seats[view.winner]?.name
  const headline =
    view.endReason === 'everyoneLeft' ? 'Game over' : view.winner === null ? 'It’s a tie' : view.winner === me ? 'You won!' : `${winnerName} won`
  const subline =
    view.endReason === 'everyoneLeft'
      ? 'Everyone left the game.'
      : view.endReason === 'outOfCards'
        ? 'No cards were left to draw, so the fewest cards wins.'
        : view.winner === me
          ? 'You ran out of cards first.'
          : `${winnerName} ran out of cards first.`
  // Her score: her own seat's (if she left, the seat she had: the stats still hold it).
  const mySeat = view.playedSeat ?? me
  const stats = mySeat >= 0 ? view.stats[mySeat] : undefined
  // The winner first, then fewest cards left. People who left keep their name (a computer played on for them).
  const again = playingAgainIds(room.rematch)
  const standings: Standing[] = view.seats
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => Number(b.i === view.winner) - Number(a.i === view.winner) || a.cards - b.cards)
    .map((s) => {
      const person = s.userId ? room.players.find((p) => p.userId === s.userId) : undefined
      const badge: StandingBadge | null = !s.userId
        ? null
        : again.has(s.userId)
          ? 'again'
          : person?.rematchDone
            ? 'done'
            : s.gone
              ? person?.status === 'removed'
                ? 'timedOut'
                : 'left'
              : null
      return {
        key: String(s.i),
        name: s.name,
        isMe: s.i === mySeat,
        won: s.i === view.winner,
        color: TOKEN_COLORS[s.i % TOKEN_COLORS.length],
        isComputer: !s.userId,
        badge,
        metric: `${s.cards} ${s.cards === 1 ? 'card' : 'cards'}`,
        score: s.userId ? { correct: view.stats[s.i].correct, answered: view.stats[s.i].answered } : undefined,
      }
    })
  const codes = [...CARD_SUBJECTS, ...Object.keys(stats?.bySubject ?? {}).filter((c) => !(CARD_SUBJECTS as readonly string[]).includes(c))].filter((c) => stats?.bySubject[c])

  return (
    <GameFinish
      won={view.winner !== null && view.winner === me}
      headline={headline}
      subline={subline}
      standings={standings}
      correct={stats?.correct ?? 0}
      answered={stats?.answered ?? 0}
      notes={stats && stats.drawnForMistakes > 0 ? [`${stats.drawnForMistakes} ${stats.drawnForMistakes === 1 ? 'card' : 'cards'} drawn for wrong answers`] : []}
      bySubject={codes.map((code) => ({ code, ...stats!.bySubject[code], practiceHref: practiceHref(code) }))}
      playAgain={playAgain.gold}
      onBack={playAgain.onBack}
      below={playAgain.below}
    />
  )
}
