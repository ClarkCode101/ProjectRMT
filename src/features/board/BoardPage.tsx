import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, CloudOff, Dices, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { ExitButton } from '@/components/ExitButton'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useFocusMode } from '@/components/layoutContext'
import { HeroPanel, heroButtonClass } from '@/components/report'
import { useAuth } from '@/features/auth/authContext'
import { useTopicPerformance } from '@/features/dashboard/api'
import { attemptHistoryOptions, queueAnswer, queueSessionFinish, questionPoolOptions, type QuizQuestion } from '@/features/quiz/api'
import {
  answerQuestion,
  BOARD_SIZE,
  challengePool,
  layoutOf,
  newGame,
  pickLayoutId,
  rescuePool,
  rollDie,
  startTurn,
  unusedFirst,
  weakestTopic,
  ZONE_SUBJECTS,
  zoneOf,
  type BoardGame,
  type Pending,
} from '@/lib/board'
import { clearBoard, loadBoard, saveBoard, type SavedBoard } from '@/lib/boardSave'
import { keyToPosition } from '@/lib/choiceKeys'
import { useOnline } from '@/lib/offline/useOfflineSync'
import { latestMistakes, shuffledChoiceOrder, summarizePerformance } from '@/lib/quiz'
import { useSubjectOfTopic, useSubjects, useTopics } from '@/lib/referenceData'
import { buildHistory, pickQuestions } from '@/lib/selection'
import { cn } from '@/lib/utils'
import { queueBoardSession, useHardQuestionIds } from './api'
import { BoardGrid } from './BoardGrid'
import { BoardResults } from './BoardResults'
import { DieFace, TurnSheet } from './TurnSheet'

/** The question on screen right now, and what it's for. */
type Turn = {
  purpose: Pending
  question: QuizQuestion
  /** order[displayPosition] = original choice index */
  order: number[]
  /** her square when the question appeared */
  positionBefore: number
  /** shown on a snake's rescue question when it came from her weakest topic */
  weakTopicName: string | null
  shownAt: number
  /** the original index she picked, once she answers */
  selectedIndex?: number
}

/** All questions in the subjects (built-in + hers), the same pool as Practice with "All" chosen. */
const ALL_QUESTIONS = questionPoolOptions({ source: 'all', subjectId: null, topicId: null }, [])

/** How long the die tumbles in the middle of the screen, then how long the number stays up. Short on purpose: it happens every turn. */
const SPIN_MS = 700
const SHOW_MS = 850

/** The board's frame (padding around the squares), in pixels on both sides together. */
const BOARD_FRAME_PX = 18 // 8px padding + 1px border, on each side (BoardGrid)

/**
 * The board's width so it fits the space it's given, both across and down (no scrolling):
 * the squares are 10 wide by 6 tall, plus the frame.
 */
function useFittedBoardWidth() {
  // A callback ref (not useRef): the box only appears once the game screen shows, so the effect must rerun then.
  const [box, ref] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => {
    if (!box) return
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      const inner = Math.min(w - BOARD_FRAME_PX, ((h - BOARD_FRAME_PX) * 10) / 6)
      setWidth(Math.max(0, Math.floor(inner + BOARD_FRAME_PX)))
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [box])
  return { ref, width }
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The token's square on screen: it walks one square at a time toward where she really is,
 * and jumps straight there on a ladder or snake (or when motion is reduced).
 */
function useWalkingToken(target: number) {
  const [square, setSquare] = useState(target)
  useEffect(() => {
    if (square === target) return
    const jump = Math.abs(target - square) > 6 || prefersReducedMotion()
    const timer = window.setTimeout(() => setSquare(jump ? target : square + Math.sign(target - square)), jump ? 250 : 170)
    return () => window.clearTimeout(timer)
  }, [square, target])
  return square
}

// /board → Board Review (PROJECT_PLAN.md §14): snakes and ladders where she only moves if she answers right.
export default function BoardPage() {
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const online = useOnline()

  const subjects = useSubjects()
  const topics = useTopics()
  const subjectOf = useSubjectOfTopic()
  const pool = useQuery(ALL_QUESTIONS)
  const history = useQuery(attemptHistoryOptions)
  const performance = useTopicPerformance()
  const hardIds = useHardQuestionIds()

  const [saved, setSaved] = useState<SavedBoard | null>(() => (userId ? loadBoard(userId) : null))
  const [playing, setPlaying] = useState(false)
  const [turn, setTurn] = useState<Turn | null>(null)
  /** The die in the middle of the screen while she rolls: tumbling, then landed on her number. */
  const [dice, setDice] = useState<{ face: number; landed: boolean } | null>(null)
  const board = useFittedBoardWidth()
  const [message, setMessage] = useState<string | null>(null)
  /** bumped to re-open the question popup if the browser closes it early */
  const [dialogKey, setDialogKey] = useState(0)

  const game = saved?.game ?? null
  // While the answer shows in the popup, the token waits on its old square; it walks (or climbs, or slides)
  // after she taps Continue, so she sees it happen on the board.
  const token = useWalkingToken(turn && turn.selectedIndex !== undefined ? turn.positionBefore : (game?.position ?? 1))
  // The question pops up once the token has arrived (e.g. at the foot of a ladder), or stays up showing the answer.
  const popupOpen = turn !== null && (turn.selectedIndex !== undefined || token === turn.positionBefore)
  useFocusMode(playing && !game?.finished)

  const ready = pool.isSuccess && history.isSuccess && topics.isSuccess && subjects.isSuccess

  function persist(next: SavedBoard) {
    setSaved(next)
    saveBoard(userId, next)
  }

  /** Subject code of each topic, e.g. topic 12 → "HEMA". */
  function subjectCodeOfTopic(topicId: number): string {
    return subjectOf(topicId).code ?? '—'
  }

  /** Picks the question for what's waiting on the board. null when there are no questions at all. */
  function prepareTurn(g: BoardGame): Turn | null {
    const pending = g.pending
    if (!pending || !pool.data) return null
    const all = pool.data
    const attempts = history.data ?? []
    const questionHistory = buildHistory(attempts)
    // Questions whose LATEST answer was wrong (same rule as the Mistake notebook).
    const mistakeIds = new Set(latestMistakes(attempts.map((a) => ({ ...a, selected_index: null }))).map((a) => a.question_id))
    const zoneCode = zoneOf(g.position)
    const inZone = all.filter((q) => subjectCodeOfTopic(q.topic_id) === zoneCode)
    // A subject with no questions at all: any subject, so the game never gets stuck.
    const zone = unusedFirst(inZone.length > 0 ? inZone : all, g.usedQuestionIds)

    let candidates: QuizQuestion[] = zone
    let weakTopicName: string | null = null
    if (pending.kind === 'ladder') {
      const hard = hardIds.data ?? new Set<string>()
      candidates = challengePool(
        zone.map((q) => ({ ...q, difficulty: hard.has(q.id) ? 3 : null })),
        mistakeIds,
      )
    } else if (pending.kind === 'snake') {
      const summary = summarizePerformance(performance.data ?? [], subjects.data ?? [], topics.data ?? [])
      const weak = weakestTopic(summary)
      candidates = rescuePool(unusedFirst(all, g.usedQuestionIds), zone, { weakTopicId: weak?.topicId ?? null, mistakeIds })
      if (weak && candidates.some((q) => q.topic_id === weak.topicId)) weakTopicName = weak.topicName
    }

    const question = pickQuestions(candidates, questionHistory, 1)[0]
    if (!question) return null
    return {
      purpose: pending,
      question,
      order: shuffledChoiceOrder(question.choices.length),
      positionBefore: g.position,
      weakTopicName,
      shownAt: Date.now(),
    }
  }

  // Something is waiting on the board and no question is showing: after a roll, after landing on a ladder or snake,
  // or coming back to a saved game that was closed mid-turn. Ask the question for it.
  useEffect(() => {
    if (!playing || !ready || turn || !game?.pending || game.finished) return
    const next = prepareTurn(game)
    if (next) setTurn(next)
    else setMessage('No questions to ask yet. Add some on the Questions page, or go online once to load them.')
    // prepareTurn reads the latest data on purpose; it only needs to run when these change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ready, turn, game?.pending, game?.finished])

  function startNewGame() {
    // One of the three boards, never the same as the last one she played.
    const layoutId = pickLayoutId(saved?.game.layoutId ?? null)
    const next: SavedBoard = { version: 1, sessionId: queueBoardSession(), game: newGame(new Date(), layoutId) }
    persist(next)
    setTurn(null)
    setMessage(null)
    setPlaying(true)
  }

  /**
   * The die comes to the middle of the screen (the board blurs behind it), tumbles, then lands and its number
   * zooms in. After that the question pops up. With Reduce Motion on, the number just shows, without the tumble.
   */
  function roll() {
    if (!saved || !game || game.pending || game.finished || dice !== null) return
    const value = rollDie()
    const done = () => {
      setDice(null)
      persist({ ...saved, game: startTurn(game, value) })
    }
    if (prefersReducedMotion()) {
      setDice({ face: value, landed: true })
      window.setTimeout(done, SHOW_MS)
      return
    }
    setDice({ face: rollDie(), landed: false })
    const tumble = window.setInterval(() => setDice({ face: rollDie(), landed: false }), 110)
    window.setTimeout(() => {
      window.clearInterval(tumble)
      setDice({ face: value, landed: true })
      window.setTimeout(done, SHOW_MS)
    }, SPIN_MS)
  }

  function choose(originalIndex: number) {
    if (!saved || !game || !turn || turn.selectedIndex !== undefined) return
    const isCorrect = originalIndex === turn.question.correct_index
    // Counts toward her scores and Mistake notebook like Practice (saved on the device first, works offline).
    queueAnswer({ sessionId: saved.sessionId, questionId: turn.question.id, selectedIndex: originalIndex, isCorrect, timeMs: Date.now() - turn.shownAt })
    const next = answerQuestion(game, { questionId: turn.question.id, subjectCode: subjectCodeOfTopic(turn.question.topic_id), isCorrect })
    persist({ ...saved, game: next })
    setTurn({ ...turn, selectedIndex: originalIndex })
    if (next.finished) {
      const seconds = Math.round((Date.now() - Date.parse(next.startedAt)) / 1000)
      queueSessionFinish(saved.sessionId, next.correct, Math.max(0, seconds))
    }
  }

  function continueTurn() {
    // A ladder or snake waiting: the effect above asks its question next. Otherwise back to the Roll button.
    setTurn(null)
  }

  function playAgain() {
    clearBoard(userId)
    startNewGame()
  }

  // Keyboard on a computer: A–D or 1–4 picks a choice (Enter/Space press the focused Roll or Continue button).
  const chooseRef = useRef(choose)
  useEffect(() => {
    chooseRef.current = choose
  })
  useEffect(() => {
    if (!turn || turn.selectedIndex !== undefined) return
    const order = turn.order
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const position = keyToPosition(event.key)
      if (position === -1 || position >= order.length) return
      chooseRef.current(order[position])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [turn])

  // ---------- Screens ----------

  if (game?.finished && playing && !turn) return <BoardResults game={game} onPlayAgain={playAgain} />

  if (!playing) {
    const inProgress = game && !game.finished ? game : null
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <HeroPanel labelledBy="board-heading" className="space-y-4">
          <div className="flex items-center gap-3">
            <Dices className="size-8 text-highlight" aria-hidden />
            <h1 id="board-heading" className="font-heading text-3xl font-bold">
              Board Review
            </h1>
          </div>
          <p className="text-white/90">Roll the die, then answer right to move. Travel through all six subjects to square {BOARD_SIZE}.</p>
          {inProgress && (
            <p className="text-sm text-white/80 tabular-nums">
              Game in progress: square {inProgress.position} of {BOARD_SIZE} ({zoneOf(inProgress.position)}), {inProgress.correct} of {inProgress.answered} correct.
            </p>
          )}
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            {inProgress ? (
              <>
                <button type="button" className={heroButtonClass} onClick={() => setPlaying(true)}>
                  <Play className="size-5 fill-current" aria-hidden />
                  Continue game
                </button>
                <button
                  type="button"
                  onClick={startNewGame}
                  className="rounded-md px-2 py-2.5 text-center text-sm font-semibold text-white/85 underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-3 focus-visible:ring-white/60"
                >
                  Start a new game
                </button>
              </>
            ) : (
              <button type="button" className={heroButtonClass} onClick={startNewGame}>
                <Play className="size-5 fill-current" aria-hidden />
                Start game
              </button>
            )}
          </div>
        </HeroPanel>

        <section aria-labelledby="board-rules-heading" className="space-y-3">
          <h2 id="board-rules-heading" className="text-lg font-bold">
            How it works
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            <li className="flex gap-3 px-4 py-3">
              <DieFace value={4} className="size-6 shrink-0 text-primary-deep" />
              <span>Roll, then answer a question from the zone you’re on. Right moves you; wrong keeps you in place and shows why.</span>
            </li>
            <li className="flex gap-3 px-4 py-3">
              <ArrowUp className="size-6 shrink-0 text-correct" aria-hidden />
              <span>Land on a ladder: answer a Challenge question to climb. Wrong just keeps you at the foot.</span>
            </li>
            <li className="flex gap-3 px-4 py-3">
              <ArrowDown className="size-6 shrink-0 text-wrong" aria-hidden />
              <span>Land on a snake: answer a Rescue question from your weakest topic to stay safe, or slide down.</span>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Zones, in order: {ZONE_SUBJECTS.join(', ')}. Every answer counts toward your scores, like Practice. Your game is saved on this device.
          </p>
        </section>
      </div>
    )
  }

  if (!game || !ready) {
    if (pool.isError || history.isError) return <FullPageMessage>Couldn’t load the questions. Check your internet connection and try again.</FullPageMessage>
    return <FullPageMessage>Loading the board…</FullPageMessage>
  }

  // She can roll when nothing is waiting and the token has finished moving.
  const canRoll = !turn && !game.pending && token === game.position && dice === null

  return (
    // The whole game fits on one screen (no scrolling): top line, the board in all the space left, the Roll bar.
    <div className="fixed inset-0 z-20 flex flex-col gap-3 bg-background px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6">
      <h1 className="sr-only">Board Review</h1>
      <div className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-3 text-sm">
        <ExitButton
          onClick={() => {
            setPlaying(false)
            setTurn(null)
          }}
        />
        {/* Follows the token as it walks. */}
        <p className="font-heading font-semibold text-muted-foreground tabular-nums">
          Square <span className="text-foreground">{token}</span> of {BOARD_SIZE} · <span className="text-foreground">{zoneOf(token)}</span>
        </p>
        <p className="min-w-16 text-right text-muted-foreground tabular-nums">
          {game.correct} of {game.answered} correct
        </p>
      </div>

      {message && (
        <p role="status" className="mx-auto w-full max-w-5xl shrink-0 rounded-md border border-highlight/50 bg-highlight-soft p-3">
          {message}
        </p>
      )}

      {/* The board is the star: it takes all the space left, as big as fits both across and down, centered. */}
      <div ref={board.ref} className="flex min-h-0 flex-1 items-center justify-center">
        {board.width !== null && <BoardGrid tokenSquare={token} layout={layoutOf(game.layoutId)} className="shrink-0" style={{ width: board.width }} />}
      </div>

      {!online && (
        <p role="status" className="flex shrink-0 items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <CloudOff className="size-4 shrink-0" aria-hidden />
          Offline. Your answers are saved on this device and sync when you’re back online.
        </p>
      )}

      {/* The Roll bar at the bottom (thumb zone). */}
      <div className="mx-auto flex w-full max-w-md shrink-0 items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-card">
          <Dices className="size-9 text-primary-deep" aria-hidden />
        </div>
        {/* The gold main button, with a focus ring that shows on the light page. */}
        <button type="button" className={cn(heroButtonClass, 'flex-1 focus-visible:ring-ring/40 sm:flex sm:w-auto')} onClick={roll} disabled={!canRoll} autoFocus>
          <Dices className="size-5" aria-hidden />
          {dice !== null ? 'Rolling…' : 'Roll'}
        </button>
      </div>

      {/* The roll: the die comes to the middle, the board blurs behind it, it tumbles, then the number zooms in. */}
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
            {/* Screen readers hear the number once it lands. */}
            <p aria-live="assertive" className={cn('font-heading text-2xl font-bold text-white drop-shadow', !dice.landed && 'invisible')}>
              {dice.landed ? `You rolled ${dice.face}` : 'Rolling'}
            </p>
          </div>
        </div>
      )}

      {/* The question pops up over the board, from the bottom so the choices are in thumb reach. It can't be
          dismissed before she answers; after that, Continue closes it and the token moves. */}
      <Dialog
        key={dialogKey}
        open={popupOpen}
        onClose={() => {
          // Closed by the browser while it should still be up (e.g. Esc pressed twice): bring it back.
          if (popupOpen) setDialogKey((k) => k + 1)
        }}
        labelledBy="turn-heading"
        variant="bottom"
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
        {turn && (
          <TurnSheet
            headingId="turn-heading"
            purpose={turn.purpose}
            question={turn.question}
            subjectLabel={[subjectOf(turn.question.topic_id).code, subjectOf(turn.question.topic_id).topicName].filter(Boolean).join(' · ')}
            weakTopicName={turn.weakTopicName}
            order={turn.order}
            selectedIndex={turn.selectedIndex}
            position={turn.positionBefore}
            onChoose={choose}
            onContinue={continueTurn}
          />
        )}
      </Dialog>
    </div>
  )
}
