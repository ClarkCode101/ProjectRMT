import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useFocusMode } from '@/components/layoutContext'
import { useAuth } from '@/features/auth/authContext'
import { useTopicPerformance } from '@/features/dashboard/api'
import { attemptHistoryOptions, queueAnswer, queueSessionFinish, questionPoolOptions, type QuizQuestion } from '@/features/quiz/api'
import { rescuePool, unusedFirst, weakestTopic } from '@/lib/board'
import {
  answerDraw2,
  answerPlay,
  botTurn,
  chooseSubject,
  DRAW2_QUESTIONS,
  drawForTurn,
  newCardGame,
  passDrawn,
  pendingQuestionId,
  questionNeeded,
  setPendingQuestion,
  startPlay,
  type CardGame,
} from '@/lib/cards'
import { devAnswerLetter } from '@/lib/cardsDev'
import { clearCards, loadCards, saveCards, type SavedCards } from '@/lib/cardsSave'
import { keyToPosition } from '@/lib/choiceKeys'
import { useOnline } from '@/lib/offline/useOfflineSync'
import { latestMistakes, shuffledChoiceOrder, summarizePerformance } from '@/lib/quiz'
import { useSubjectOfTopic, useSubjects, useTopics } from '@/lib/referenceData'
import { buildHistory, pickQuestions } from '@/lib/selection'
import { queueCardsSession } from './api'
import { CardQuestionSheet, type AskPurpose } from './CardQuestionSheet'
import { CardResults } from './CardResults'
import { CardsDevPanel } from './CardsDevPanel'
import { CardsGameView } from './CardsGameView'
import { CardsIntro } from './CardsIntro'
import { SubjectPicker } from './SubjectPicker'
import { handState } from './handState'
import { HowToPlay } from './HowToPlay'

/** The question on screen right now, and what it's for. */
type Ask = {
  purpose: AskPurpose
  question: QuizQuestion
  /** order[displayPosition] = original choice index */
  order: number[]
  /** a Wild's question, when it came from her weakest topic */
  weakTopicName: string | null
  shownAt: number
  /** the original index she picked, once she answers */
  selectedIndex?: number
}

/** All questions in the subjects (built-in + hers), the same pool as Practice with "All" chosen. */
const ALL_QUESTIONS = questionPoolOptions({ source: 'all', subjectId: null, topicId: null }, [])

/** How long each computer player's turn takes on screen, so she can follow what happened. */
const BOT_MS = 1100
/** npm run dev only: "Fast computer turns" in the DEV panel. */
const DEV_FAST_BOT_MS = 150
/** A short pause before a Draw 2's questions pop up, so she sees the card land first. */
const DRAW2_PAUSE_MS = 700
/** When a computer player wins, a moment to see the last card go down before the finish screen. */
const RESULTS_PAUSE_MS = 1400

// /cards → Last Card (PROJECT_PLAN.md §15): match the subject or number, answer right to put a card down.
export default function CardsPage() {
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const online = useOnline()

  const subjects = useSubjects()
  const topics = useTopics()
  const subjectOf = useSubjectOfTopic()
  const pool = useQuery(ALL_QUESTIONS)
  const history = useQuery(attemptHistoryOptions)
  const performance = useTopicPerformance()

  const [saved, setSaved] = useState<SavedCards | null>(() => (userId ? loadCards(userId) : null))
  const [playing, setPlaying] = useState(false)
  const [ask, setAsk] = useState<Ask | null>(null)
  /** the card she tapped in her hand (it rises); "Answer to play" opens its question */
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showResults, setShowResults] = useState(false)
  /** bumped to re-open the question popup if the browser closes it early */
  const [dialogKey, setDialogKey] = useState(0)
  // npm run dev only (the DEV panel): show the right answer, and make the computer turns quick.
  /** How to play is open (the ? at the top right): the computer players wait */
  const [helpOpen, setHelpOpen] = useState(false)
  const [devShowAnswers, setDevShowAnswers] = useState(false)
  const [devFastBots, setDevFastBots] = useState(false)

  const game = saved?.game ?? null
  useFocusMode(playing && !showResults)

  const ready = pool.isSuccess && history.isSuccess && topics.isSuccess && subjects.isSuccess

  /** Saves the game (state + device). The first time it ends, the session gets its score. */
  function persist(next: SavedCards) {
    if (next.game.finished && saved && !saved.game.finished) {
      const seconds = Math.round((Date.now() - Date.parse(next.game.startedAt)) / 1000)
      queueSessionFinish(next.sessionId, next.game.correct, Math.max(0, seconds))
    }
    setSaved(next)
    saveCards(userId, next)
  }

  const subjectCodeOfTopic = (topicId: number) => subjectOf(topicId).code ?? '—'

  /** Picks the question her turn is waiting on. null when there are no questions at all. */
  function prepareAsk(g: CardGame): Ask | null {
    const need = questionNeeded(g)
    if (!need || !pool.data || !g.pending) return null
    const all = pool.data
    const attempts = history.data ?? []

    let candidates: QuizQuestion[]
    let weak: { topicId: number; topicName: string } | null = null
    if (need.kind === 'subject') {
      const inSubject = all.filter((q) => subjectCodeOfTopic(q.topic_id) === need.subject)
      // A subject with no questions at all: any subject, so the game never gets stuck.
      candidates = unusedFirst(inSubject.length > 0 ? inSubject : all, g.usedQuestionIds)
    } else {
      // A Wild: her weakest topic, else a past mistake, else anything (same pick as the Board Review snake).
      const mistakeIds = new Set(latestMistakes(attempts.map((a) => ({ ...a, selected_index: null }))).map((a) => a.question_id))
      weak = weakestTopic(summarizePerformance(performance.data ?? [], subjects.data ?? [], topics.data ?? []))
      const unused = unusedFirst(all, g.usedQuestionIds)
      candidates = rescuePool(unused, unused, { weakTopicId: weak?.topicId ?? null, mistakeIds })
    }

    // The question already shown for this (she left the game and came back) stays the same, so leaving
    // can't skip a hard one. Otherwise a new pick.
    const remembered = pendingQuestionId(g)
    const question = (remembered ? all.find((q) => q.id === remembered) : undefined) ?? pickQuestions(candidates, buildHistory(attempts), 1)[0]
    if (!question) return null
    // "From your weak topic" only when the question really is from it.
    const weakTopicName = weak && question.topic_id === weak.topicId ? weak.topicName : null

    let purpose: AskPurpose
    if (g.pending.kind === 'draw2') {
      purpose = { kind: 'draw2', number: DRAW2_QUESTIONS - g.pending.left + 1 }
    } else {
      const cardId = g.pending.kind === 'play' ? g.pending.cardId : ''
      const hand = g.players[0].hand
      const card = hand.find((c) => c.id === cardId)
      if (!card) return null
      purpose = { kind: 'play', card, lastCard: hand.length === 1 }
    }
    return { purpose, question, order: shuffledChoiceOrder(question.choices.length), weakTopicName, shownAt: Date.now() }
  }

  // Her turn is waiting on a question and none is showing: after "Answer to play", after a Draw 2 hit her,
  // or coming back to a saved game that was closed mid-question. Ask it.
  useEffect(() => {
    if (!playing || !ready || ask || !game || game.finished || game.turn !== 0 || !questionNeeded(game)) return
    const timer = window.setTimeout(
      () => {
        const next = prepareAsk(game)
        if (next) {
          // Saved with the game right away, so coming back after Exit shows this same question.
          if (saved && pendingQuestionId(game) !== next.question.id) persist({ ...saved, game: setPendingQuestion(game, next.question.id) })
          setAsk(next)
        } else setMessage('No questions to ask yet. Add some on the Questions page, or go online once to load them.')
      },
      game.pending?.kind === 'draw2' ? DRAW2_PAUSE_MS : 0,
    )
    return () => window.clearTimeout(timer)
    // prepareAsk reads the latest data on purpose; it only needs to run when these change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ready, ask, game])

  // A computer player's turn: wait a moment so she can follow, then play it.
  useEffect(() => {
    if (!playing || !saved || !game || game.finished || game.turn === 0 || ask || helpOpen) return
    const timer = window.setTimeout(() => persist({ ...saved, game: botTurn(game) }), devFastBots ? DEV_FAST_BOT_MS : BOT_MS)
    return () => window.clearTimeout(timer)
    // persist only changes with `saved`, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, saved, game, ask, devFastBots, helpOpen])

  // The game ended: show the finish screen (right away if she won; after a moment if someone else did).
  useEffect(() => {
    if (!playing || !game?.finished || ask) return
    const timer = window.setTimeout(() => setShowResults(true), game.winner === 0 ? 0 : RESULTS_PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [playing, game?.finished, game?.winner, ask])

  function startNewGame() {
    const next: SavedCards = { version: 1, sessionId: queueCardsSession(), game: newCardGame() }
    setSaved(next)
    saveCards(userId, next)
    setAsk(null)
    setPickedId(null)
    setMessage(null)
    setShowResults(false)
    setPlaying(true)
  }

  function playAgain() {
    clearCards(userId)
    startNewGame()
  }

  function choose(originalIndex: number) {
    if (!saved || !game || !ask || ask.selectedIndex !== undefined) return
    const isCorrect = originalIndex === ask.question.correct_index
    // Counts toward her scores and Mistake notebook like Practice (saved on the device first, works offline).
    queueAnswer({ sessionId: saved.sessionId, questionId: ask.question.id, selectedIndex: originalIndex, isCorrect, timeMs: Date.now() - ask.shownAt })
    const answer = { questionId: ask.question.id, subjectCode: subjectCodeOfTopic(ask.question.topic_id), isCorrect }
    persist({ ...saved, game: ask.purpose.kind === 'draw2' ? answerDraw2(game, answer) : answerPlay(game, answer) })
    setAsk({ ...ask, selectedIndex: originalIndex })
    setPickedId(null)
  }

  // Keyboard on a computer: A–D or 1–4 picks a choice (Enter/Space press the focused button).
  const chooseRef = useRef(choose)
  useEffect(() => {
    chooseRef.current = choose
  })
  useEffect(() => {
    if (!ask || ask.selectedIndex !== undefined) return
    const order = ask.order
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const position = keyToPosition(event.key)
      if (position === -1 || position >= order.length) return
      chooseRef.current(order[position])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ask])

  // ---------- Screens ----------

  if (playing && showResults && game?.finished) return <CardResults game={game} onPlayAgain={playAgain} />

  if (!playing) {
    return <CardsIntro inProgress={game && !game.finished ? game : null} onContinue={() => setPlaying(true)} onNewGame={startNewGame} />
  }

  if (!saved || !game || !ready) {
    if (pool.isError || history.isError) return <FullPageMessage>Couldn’t load the questions. Check your internet connection and try again.</FullPageMessage>
    return <FullPageMessage>Dealing the cards…</FullPageMessage>
  }

  const hand = handState(game, pickedId, ask !== null)
  const choosingSubject = game.pending?.kind === 'chooseSubject' && !ask && !game.finished

  function answerToPlay() {
    if (!saved || !game || !hand.picked) return
    const next = startPlay(game, hand.picked)
    if (next !== game) persist({ ...saved, game: next })
  }

  return (
    <CardsGameView
      game={game}
      hand={hand}
      online={online}
      message={message}
      onHelp={() => setHelpOpen(true)}
      onExit={() => {
        setPlaying(false)
        setAsk(null)
        setPickedId(null)
      }}
      onPick={(id) => setPickedId((current) => (current === id ? null : id))}
      onDraw={() => persist({ ...saved, game: hand.keepingDrawn ? passDrawn(game) : drawForTurn(game) })}
      onAnswerToPlay={answerToPlay}
      paused={ask !== null}
      devTools={
        import.meta.env.DEV && (
          <CardsDevPanel
            game={game}
            onApply={(change) => {
              setAsk(null)
              setPickedId(null)
              persist({ ...saved, game: change(game) })
            }}
            showAnswers={devShowAnswers}
            onShowAnswers={setDevShowAnswers}
            fastBots={devFastBots}
            onFastBots={setDevFastBots}
          />
        )
      }
    >
      {/* The question pops up from the bottom, so the choices are in thumb reach. It can't be dismissed before she
          answers; after that, Continue closes it. */}
      <Dialog
        key={dialogKey}
        open={ask !== null}
        onClose={() => {
          // Closed by the browser while it should still be up (e.g. Esc pressed twice): bring it back.
          if (ask !== null) setDialogKey((k) => k + 1)
        }}
        labelledBy="card-question-heading"
        variant="bottom"
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
        {ask && (
          <CardQuestionSheet
            headingId="card-question-heading"
            purpose={ask.purpose}
            question={ask.question}
            subjectLabel={[subjectOf(ask.question.topic_id).code, subjectOf(ask.question.topic_id).topicName].filter(Boolean).join(' · ')}
            weakTopicName={ask.weakTopicName}
            order={ask.order}
            selectedIndex={ask.selectedIndex}
            onChoose={choose}
            onContinue={() => setAsk(null)}
          />
        )}
        {/* npm run dev only: the right answer, so a test can answer right or wrong on purpose */}
        {import.meta.env.DEV && devShowAnswers && ask && ask.selectedIndex === undefined && (
          <p className="mt-3 rounded-md border border-dashed border-wrong/60 bg-wrong-soft px-3 py-2 font-mono text-xs" role="note">
            <span className="font-bold">DEV TEST ONLY · </span>
            Answer: {devAnswerLetter(ask.question.correct_index, ask.order)}. {ask.question.choices[ask.question.correct_index]}
          </p>
        )}
      </Dialog>

      {/* How to play (the ? at the top right). */}
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} labelledBy="how-to-play-heading" size="lg">
        <HowToPlay headingId="how-to-play-heading" onClose={() => setHelpOpen(false)} />
      </Dialog>

      {/* After a right Wild: she picks the next subject (from the bottom, in thumb reach, like the question). */}
      <Dialog open={choosingSubject} onClose={() => {}} labelledBy="pick-subject-heading" variant="bottom" closeOnBackdrop={false} closeOnEscape={false}>
        <SubjectPicker
          headingId="pick-subject-heading"
          onPick={(subject) => persist({ ...saved, game: chooseSubject(game, subject) })}
        />
      </Dialog>
    </CardsGameView>
  )
}
