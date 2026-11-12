import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'

/** "‹ Games" above a game's start screen: back to the page where she picks a game. */
export function BackToGames() {
  return (
    <Link
      to="/games"
      className="-ml-1 inline-flex w-fit items-center gap-0.5 rounded-md px-1 py-0.5 text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <ChevronLeft className="size-4" aria-hidden />
      Games
    </Link>
  )
}
