import { BookOpen } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { verseOfTheDay } from '@/lib/verses'

/**
 * The verse of the day, shown after a finished session (Practice and Mock exam results).
 * It used to sit on Home, where it competed with everything else; here it lands at a quiet moment, after the work.
 * Quiet like the NoteCard beside it: white paper, a thin blue quote line, no loud colors.
 */
export function VerseCard({ className }: { className?: string }) {
  // Read the date once, so the verse doesn't change if she keeps the page open past midnight.
  const [verse] = useState(() => verseOfTheDay(new Date()))
  return (
    <figure className={cn('rounded-xl border bg-card px-4 py-3.5', className)}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <BookOpen className="size-3.5" aria-hidden />
        Verse of the day
      </p>
      <blockquote className="border-l-[3px] border-primary/70 pl-3.5 leading-relaxed text-pretty">{verse.text}</blockquote>
      <figcaption className="mt-1.5 pl-[17px] text-sm font-bold text-primary">
        {verse.reference} <span className="font-normal text-muted-foreground">(WEB)</span>
      </figcaption>
    </figure>
  )
}
