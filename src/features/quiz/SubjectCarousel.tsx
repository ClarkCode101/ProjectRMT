import { SwipeCarousel } from '@/components/SwipeCarousel'
import { formatPercent } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import { liquidBackground, tubeStatus } from './tube'
import { TubeFigure } from './TubeFigure'

// The subject picker on Practice: a swipeable row of specimen tubes (the swiping itself is SwipeCarousel,
// shared with Flashcards). Each tube's liquid is the subject's color, filled to her score; it rises again when the
// tube lands in the middle.

export type CarouselItem = { key: string; code: string; name: string; accuracy: number | null; belowPassing: boolean }

export function SubjectCarousel({
  items,
  index,
  onIndexChange,
  onOpen,
}: {
  items: CarouselItem[]
  index: number
  onIndexChange: (index: number) => void
  onOpen: () => void
}) {
  return (
    <SwipeCarousel
      items={items}
      index={index}
      onIndexChange={onIndexChange}
      onOpen={onOpen}
      label="Subjects"
      // The dot under the name takes the subject's color too (Mix: its six layers, side by side).
      dotColor={(it) => liquidBackground(it.code, 'right')}
      renderFigure={(it, { centered }) => (
        // Remounted when it lands in the middle, so its liquid rises again (side tubes stay still).
        <TubeFigure key={centered ? `${it.key}-center` : it.key} code={it.code} accuracy={it.accuracy} status={tubeStatus(it.accuracy, it.belowPassing)} animateFill={centered} />
      )}
      renderDetail={(it) => {
        const status = tubeStatus(it.accuracy, it.belowPassing)
        return (
          <span className={cn('font-bold tabular-nums', status === 'low' ? 'text-wrong' : status === 'passing' ? 'text-correct' : 'text-muted-foreground')}>
            {it.accuracy === null ? 'Not started' : `Score ${formatPercent(it.accuracy)}`}
          </span>
        )
      }}
    />
  )
}
