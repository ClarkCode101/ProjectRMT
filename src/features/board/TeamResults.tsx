import { Check, Play, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { HeroPanel, heroButtonClass, RangeBar, REFERENCE_RANGE } from '@/components/report'
import { ZONE_SUBJECTS } from '@/lib/board'
import { finishOrder, playAgainLine, playerColor, playingAgainIds, rematchChoice, type TeamRoom } from '@/lib/boardTeam'
import { formatPercent, PASSING_RATE } from '@/lib/quiz'
import { useSubjects } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { teamActions, useMyGameAnswers, useRefreshTeam } from './teamApi'

const PLACES = ['1st', '2nd', '3rd', '4th']

/**
 * Play again: tapping it is the vote. The first to tap makes the next lobby; the others tap the same button to join it.
 * Who already tapped shows live ("Ana wants to play again", and a badge in the standings). No code needed.
 * "Back to Board Review" stays for whoever is done.
 */
function PlayAgain({ room }: { room: TeamRoom }) {
  const navigate = useNavigate()
  const refresh = useRefreshTeam()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choice = rematchChoice(room.rematch, room.me)
  const wantsLine = playAgainLine(room.rematch, room.me)

  async function playAgain() {
    setBusy(true)
    setError(null)
    try {
      const nextRoomId = await teamActions.rematch(room.id)
      refresh()
      navigate(`/board/team/${nextRoomId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      refresh(room.id)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Back to Board Review = "no" to Play again: saved first, so a later Play again doesn't invite her, an invite
   * already sent is taken back, and the others see "Done". The invites are read again right away, so the red dot
   * goes at once. If she's already in the next game, there's nothing to say no to. A failure never keeps her here.
   */
  async function imDone() {
    setBusy(true)
    if (choice.kind !== 'back') await teamActions.rematchDone(room.id).catch(() => undefined)
    refresh()
    navigate('/board')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {choice.kind === 'back' ? (
          <Link to={`/board/team/${choice.roomId}`} className={heroButtonClass}>
            <Play className="size-5 fill-current" aria-hidden />
            Back to the next game
          </Link>
        ) : choice.kind !== 'started' ? (
          <button type="button" onClick={playAgain} disabled={busy} className={heroButtonClass}>
            <Play className="size-5 fill-current" aria-hidden />
            {busy ? 'One moment…' : 'Play again'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={imDone}
          disabled={busy}
          className="rounded-md px-3 py-2 text-center font-semibold text-white/85 outline-none hover:text-white focus-visible:ring-3 focus-visible:ring-white/60 disabled:opacity-60"
        >
          Back to Board Review
        </button>
      </div>
      <p className={cn('text-sm', wantsLine ? 'font-semibold text-highlight' : 'text-white/75')} aria-live="polite">
        {choice.kind === 'started'
          ? `${choice.hostName}’s next game already started.`
          : wantsLine
            ? `${wantsLine}.`
            : choice.kind === 'start'
              ? // the first to tap makes the next lobby, so say who'll be in charge of Start
                'You’ll host the next game. Everyone here gets an invite.'
              : choice.kind === 'join'
                ? `${choice.hostName} is hosting the next game.`
                : null}
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-white/10 px-3 py-2 text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The race at the end: one bar per player, filled to their square out of 60, in finish order.
 * Seeing how far everyone got reads faster than a table of numbers. Badges: Playing again / Done / left / timed out.
 */
function Race({ room }: { room: TeamRoom }) {
  const order = finishOrder(room.players, room.winnerId)
  const again = playingAgainIds(room.rematch)
  return (
    <section aria-labelledby="team-race-heading" className="space-y-2.5">
      <h2 id="team-race-heading" className="text-[11px] font-bold tracking-widest text-white/70 uppercase">
        The race
      </h2>
      <ol className="space-y-3">
        {order.map((p, i) => {
          const name = p.userId === room.me ? 'You' : p.name
          const won = p.userId === room.winnerId
          return (
            <li key={p.userId} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="size-3.5 shrink-0 rounded-full border-2 border-white/80" style={{ backgroundColor: playerColor(room.players, p.userId) }} aria-hidden />
                  <span className="truncate font-semibold">
                    <span className="sr-only">{PLACES[i]}, </span>
                    {name}
                  </span>
                </span>
                {/* one badge at most, under the name */}
                {again.has(p.userId) ? (
                  <span className="mt-0.5 ml-5.5 flex w-fit items-center gap-1 rounded-full bg-correct px-2 py-0.5 text-[11px] font-bold text-white">
                    <Check className="size-3" aria-hidden />
                    Playing again
                  </span>
                ) : p.rematchDone ? (
                  <span className="mt-0.5 ml-5.5 block w-fit rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold text-white/80">Done</span>
                ) : (
                  p.status !== 'joined' &&
                  !won && <span className="mt-0.5 ml-5.5 block text-xs text-white/60">{p.status === 'removed' ? 'Timed out' : 'Left'}</span>
                )}
              </span>
              {/* the track: how far along the 60 squares */}
              <span
                className="relative h-3 overflow-hidden rounded-full bg-white/15"
                role="img"
                aria-label={`${name}: square ${p.position} of 60`}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.max(3, (p.position / 60) * 100)}%`, backgroundColor: playerColor(room.players, p.userId) }}
                />
              </span>
              <span className="flex items-center gap-2 text-right text-sm tabular-nums">
                {won ? <Trophy className="size-4 text-highlight" aria-label="Winner" /> : null}
                <span className="font-heading font-bold">{p.position}</span>
                <span className="w-10 text-white/70">
                  {p.correct}/{p.answered}
                  <span className="sr-only"> correct</span>
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Her answers in this game by subject, and the subjects to practice next (under 60%). Like the solo finish screen. */
function YourAnswers({ roomId }: { roomId: string }) {
  const answers = useMyGameAnswers(roomId)
  const subjects = useSubjects()
  if (answers.isPending) return <p className="text-sm text-muted-foreground">Loading your answers…</p>
  if (answers.isError) return null // the race above still says how she did; no need for an error here
  const bySubject = answers.data
  // exam order first, then any other subject a snake's rescue question came from
  const codes = [...ZONE_SUBJECTS, ...Object.keys(bySubject).filter((c) => !(ZONE_SUBJECTS as readonly string[]).includes(c))].filter((c) => bySubject[c])
  if (codes.length === 0) return null
  const rateOf = (code: string) => bySubject[code].correct / bySubject[code].answered
  const toReview = codes.filter((c) => rateOf(c) < PASSING_RATE)
  const subjectId = (code: string) => subjects.data?.find((s) => s.code === code)?.id

  return (
    <>
      <section aria-labelledby="team-answers-heading" className="space-y-3">
        <h2 id="team-answers-heading" className="text-lg font-bold">
          Your answers
        </h2>
        <ul className="divide-y rounded-xl border bg-card">
          {codes.map((code) => {
            const tally = bySubject[code]
            const rate = rateOf(code)
            return (
              <li key={code} className="grid grid-cols-[4rem_minmax(0,1fr)_3.5rem] items-center gap-3 px-4 py-3">
                <span className="font-heading font-bold">{code}</span>
                <RangeBar rate={rate} label={`${code}: ${tally.correct} of ${tally.answered} correct`} />
                <span className={cn('text-right font-semibold tabular-nums', rate < PASSING_RATE && 'text-wrong')}>
                  {tally.correct}/{tally.answered}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          The tick on each bar marks 60%, the start of the passing range ({REFERENCE_RANGE}). These answers count in your scores, like Practice.
        </p>
      </section>

      {toReview.length > 0 && (
        <section aria-labelledby="team-review-heading" className="space-y-3">
          <h2 id="team-review-heading" className="text-lg font-bold">
            Review next
          </h2>
          <div className="flex flex-wrap gap-2">
            {toReview.map((code) => {
              const id = subjectId(code)
              return (
                <Link
                  key={code}
                  to={id ? `/practice?subject=${id}` : '/practice'}
                  className="inline-flex h-11 items-center rounded-lg border bg-card px-4 font-heading font-bold outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  Practice {code}
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

/**
 * The finish screen of a team game: the winner and the race (with Play again) in the hero, then her own answers
 * by subject and what to practice next. No chat here: Play again already shows who wants another game.
 */
export function TeamResults({ room }: { room: TeamRoom }) {
  const winner = room.players.find((p) => p.userId === room.winnerId)
  const me = room.players.find((p) => p.userId === room.me)
  const iWon = room.winnerId === room.me

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <HeroPanel labelledBy="team-result-heading" className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 id="team-result-heading" className="text-sm font-semibold text-white/70">
              Team game over
            </h1>
            <p className="font-heading text-4xl leading-tight font-bold sm:text-5xl">
              {iWon ? 'You win!' : winner ? `${winner.name} wins!` : 'Game over'}
            </p>
            {me && (
              <p className="mt-1.5 text-white/85 tabular-nums">
                {me.answered > 0
                  ? `You: ${me.correct} of ${me.answered} correct (${formatPercent(me.correct / me.answered)})`
                  : 'You didn’t get a turn to answer this time. Next game!'}
              </p>
            )}
          </div>
          {winner && <Trophy className="mt-1 size-12 shrink-0 text-highlight" aria-hidden />}
        </div>
        <Race room={room} />
        <PlayAgain room={room} />
      </HeroPanel>

      {me && me.answered > 0 && <YourAnswers roomId={room.id} />}
    </div>
  )
}
