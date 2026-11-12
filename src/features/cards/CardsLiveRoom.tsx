import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { cardLabel } from '@/lib/cards'
import type { LiveView } from '@/lib/cardsLive'
import { supabase } from '@/lib/supabase'
import { cardsLive } from './liveApi'

// A Last Card game with classmates that has started (PROJECT_PLAN.md §15 step 2).
// STEP 2 ONLY: a plain screen that reads HER view (card_views: her cards, the others as counts) to check that Start,
// the Edge Function and the privacy work. The real table (cards, clock, questions, flying cards) is step 3.

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

export function CardsLiveRoom({ roomId }: { roomId: string }) {
  const navigate = useNavigate()
  const view = useMyCardView(roomId)
  const [message, setMessage] = useState<string | null>(null)

  if (view.isPending) return <FullPageMessage>Loading the game…</FullPageMessage>
  if (view.isError || !view.data) return <FullPageMessage>{view.error?.message ?? 'This game isn’t available.'}</FullPageMessage>
  const v = view.data

  return (
    <div className="mx-auto max-w-xl space-y-4 py-8">
      <h1 className="font-heading text-2xl font-bold">Last Card with classmates</h1>
      <p className="rounded-md border border-highlight/50 bg-highlight-soft p-3 text-sm">
        The game has started. The live table is coming in the next update; this screen only checks that it works.
      </p>
      <ul className="divide-y rounded-xl border bg-card">
        {v.seats.map((s, i) => (
          <li key={i} className="flex items-center justify-between px-4 py-3">
            <span className="font-semibold">
              {i === v.seat ? 'You' : s.name}
              {s.isComputer && <span className="ml-2 text-xs text-muted-foreground">(computer)</span>}
            </span>
            <span className="tabular-nums">
              {s.cards} cards{i === v.turn && !v.finished && <span className="ml-2 font-bold text-primary">· playing now</span>}
            </span>
          </li>
        ))}
      </ul>
      <p>
        Your cards: <span className="font-semibold">{v.hand.map(cardLabel).join(', ') || '—'}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Top card: {v.discard.length ? cardLabel(v.discard[v.discard.length - 1]) : '—'} · Draw pile: {v.drawPileCount}
        {v.question && ` · Question up for ${v.seats[v.question.seat]?.name}: ${v.question.subjectCode}`}
      </p>
      {message && <p role="alert" className="rounded-md border border-wrong/40 bg-wrong-soft p-3 text-sm">{message}</p>}
      <button
        type="button"
        onClick={async () => {
          try {
            await cardsLive.leave(roomId)
            navigate('/cards')
          } catch (e) {
            setMessage(e instanceof Error ? e.message : 'Something went wrong.')
          }
        }}
        className="h-11 rounded-lg border bg-card px-5 font-semibold hover:border-wrong/60 hover:text-wrong"
      >
        Leave game
      </button>
    </div>
  )
}
