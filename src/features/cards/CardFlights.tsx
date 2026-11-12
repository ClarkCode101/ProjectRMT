import { useLayoutEffect, useRef } from 'react'
import { CardBack, CardFace } from './PlayingCard'
import { FLIGHT_CARD_HEIGHT, FLIGHT_CARD_WIDTH, type Flight, type FlightBox } from './useCardFlights'

/** How high above the straight line a card arcs on its way. */
const ARC_PX = 46

const place = (b: FlightBox) => `translate(${b.x}px, ${b.y}px) scale(${b.scale})`

/** One card in the air: it arcs from `from` to `to`, a little bigger at the top of the arc, and flips if needed. */
function FlyingCard({ flight, onLanded }: { flight: Flight; onLanded: (key: string) => void }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const landedRef = useRef(onLanded)
  useLayoutEffect(() => {
    landedRef.current = onLanded
  })

  useLayoutEffect(() => {
    const { from, to, delay, duration, backAtStart, backAtEnd } = flight
    const top: FlightBox = {
      x: (from.x + to.x) / 2,
      y: Math.min(from.y, to.y) - ARC_PX,
      scale: Math.max(from.scale, to.scale) * 1.06,
    }
    const timing = { duration, delay, fill: 'both' as const }
    const move = outer.current?.animate([{ transform: place(from) }, { transform: place(top), offset: 0.45 }, { transform: place(to) }], {
      ...timing,
      easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)',
    })
    // The flip happens in the second half, so a drawn card shows its face as it lands.
    const turn = (back: boolean) => `rotateY(${back ? 180 : 0}deg)`
    const flip = inner.current?.animate([{ transform: turn(backAtStart) }, { transform: turn(backAtStart), offset: 0.45 }, { transform: turn(backAtEnd) }], {
      ...timing,
      easing: 'ease-in-out',
    })
    if (move) move.onfinish = () => landedRef.current(flight.key)
    return () => {
      move?.cancel()
      flip?.cancel()
    }
  }, [flight])

  const faceDownOnly = flight.backAtStart && flight.backAtEnd
  return (
    <div ref={outer} className="absolute top-0 left-0 origin-top-left [perspective:900px]" style={{ width: FLIGHT_CARD_WIDTH, height: FLIGHT_CARD_HEIGHT }}>
      <div ref={inner} className="relative size-full [transform-style:preserve-3d]">
        {/* A computer player's drawn card stays face down the whole way, so its face isn't even drawn. */}
        {!faceDownOnly && (
          <div className="absolute inset-0 [backface-visibility:hidden]">
            <CardFace card={flight.card} size="lg" />
          </div>
        )}
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <CardBack size="lg" />
        </div>
      </div>
    </div>
  )
}

/**
 * The cards in the air, over the whole table. Nothing here can be tapped. While a popup is up (`paused`) the flights
 * wait, so she sees them when it closes (e.g. the card she drew after a wrong answer).
 */
export function CardFlights({ flights, paused, onLanded }: { flights: readonly Flight[]; paused: boolean; onLanded: (key: string) => void }) {
  if (paused || flights.length === 0) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30">
      {flights.map((flight) => (
        <FlyingCard key={flight.key} flight={flight} onLanded={onLanded} />
      ))}
    </div>
  )
}
