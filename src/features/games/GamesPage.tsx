import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/dashboard'
import { useAuth } from '@/features/auth/authContext'
import { useMyInvites, useMyTeamRoom } from '@/features/board/teamApi'
import { loadBoard } from '@/lib/boardSave'
import { loadCards } from '@/lib/cardsSave'
import { GamePicker, type GameSlide } from './GamePicker'
import { boardStatus, cardsStatus, GAME_PATH, readLastGame, saveLastGame } from './games'

// /games → every game in one place (PROJECT_PLAN.md §16): swipe to pick Board Review or Last Card,
// then tap its card to open it (its start screen has Continue, New game and, for Board Review, the team games).
export default function GamesPage() {
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const navigate = useNavigate()

  // Where she left off in each game (saved on this device).
  const board = userId ? (loadBoard(userId)?.game ?? null) : null
  const cards = userId ? (loadCards(userId)?.game ?? null) : null
  // A team game invite or her turn is waiting (the same check as the red dot on the Games nav icon).
  const invites = useMyInvites()
  const room = useMyTeamRoom()
  const teamWaiting = (invites.data?.length ?? 0) > 0 || room.data?.myTurn === true

  const games: GameSlide[] = [
    {
      id: 'board',
      title: 'Board Review',
      blurb: 'Snakes and ladders through the six subjects. Answer right to move.',
      status: boardStatus(board),
      alert: teamWaiting ? 'Team game waiting' : null,
      art: { kind: 'board', layoutId: board?.layoutId ?? 0, token: board && !board.finished ? board.position : 1 },
    },
    {
      id: 'cards',
      title: 'Last Card',
      blurb: 'Match the subject or the number. Answer right to put a card down.',
      status: cardsStatus(cards),
      alert: null,
      art: { kind: 'cards' },
    },
  ]

  return (
    // Tablets and computers: one screen tall, no scrolling (like the game start screens), the cards in the middle.
    // Phones: a game card is taller than what's left of the screen, so the page simply scrolls.
    <div className="mx-auto flex max-w-5xl flex-col gap-4 md:h-[calc(100dvh-2.5rem)] md:min-h-150">
      <PageHeader title="Games" subtitle="Learn while you play. Every answer counts in your scores." />
      <GamePicker
        games={games}
        initial={readLastGame()}
        onShow={saveLastGame}
        onOpen={(id) => {
          saveLastGame(id)
          navigate(GAME_PATH[id])
        }}
      />
    </div>
  )
}
