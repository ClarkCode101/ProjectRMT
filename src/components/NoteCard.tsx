import { Heart } from 'lucide-react'
import { SIGNED_BY } from '@/data/encouragements'
import { cn } from '@/lib/utils'

/**
 * A short personal note (from src/data/encouragements.ts), like a sticky note left on her desk.
 * Warm and quiet: a soft paper color and a small heart, not another loud colored panel.
 */
export function NoteCard({ message, className }: { message: string; className?: string }) {
  return (
    <figure className={cn('relative rounded-xl border border-highlight/50 bg-highlight-soft px-4 py-3.5 pl-11', className)}>
      <Heart className="absolute top-4 left-4 size-4.5 fill-wrong text-wrong" aria-hidden />
      <blockquote className="leading-relaxed text-pretty">{message}</blockquote>
      {SIGNED_BY && <figcaption className="mt-1.5 text-right text-sm font-semibold text-[#8A5200]">— {SIGNED_BY}</figcaption>}
    </figure>
  )
}
