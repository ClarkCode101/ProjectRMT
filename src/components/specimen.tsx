import { cn } from '@/lib/utils'

// Tailwind only ships classes it can see written out in full, so list them here.
const CAP_BG: Record<string, string> = {
  CC: 'bg-subject-cc',
  MICRO: 'bg-subject-micro',
  HEMA: 'bg-subject-hema',
  BBIS: 'bg-subject-bbis',
  CM: 'bg-subject-cm',
  HTMLE: 'bg-subject-htmle',
}

function capClass(code: string | undefined) {
  return (code && CAP_BG[code]) || 'bg-muted-foreground'
}

/** A small tube cap in the subject's color, shown next to the subject code. */
export function SubjectCap({ code, className }: { code: string | undefined; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-2.5 w-3.5 shrink-0 rounded-t-[3px] rounded-b-[1px]', capClass(code), className)} />
}

/** Subject code with its cap, e.g. [■] HEMA */
export function SubjectTag({ code, label }: { code: string | undefined; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
      <SubjectCap code={code} />
      {label ?? code}
    </span>
  )
}

export type TubeState = 'empty' | 'current' | 'correct' | 'wrong'

/**
 * Quiz progress drawn as a rack of test tubes.
 * Each tube's cap shows the question's subject; the tube fills green or red once answered.
 */
export function TubeRack({ tubes, size = 'md' }: { tubes: { state: TubeState; subjectCode?: string }[]; size?: 'md' | 'lg' }) {
  return (
    <div aria-hidden className={cn('flex flex-wrap', size === 'lg' ? 'gap-2' : 'gap-1.5')}>
      {tubes.map((tube, i) => (
        <div key={i} className={cn('flex flex-col items-center', size === 'lg' ? 'w-4' : 'w-3')}>
          <span className={cn('h-1.5 w-full rounded-t-[2px]', capClass(tube.subjectCode))} />
          <span
            className={cn(
              'relative w-[80%] overflow-hidden rounded-b-full border border-t-0 bg-card',
              size === 'lg' ? 'h-10' : 'h-7',
              tube.state === 'current' ? 'border-foreground' : 'border-input',
            )}
          >
            <span
              className={cn(
                'absolute inset-x-0 bottom-0 transition-[height] duration-500 ease-out',
                tube.state === 'correct' && 'h-[70%] bg-correct',
                tube.state === 'wrong' && 'h-[70%] bg-wrong',
                (tube.state === 'empty' || tube.state === 'current') && 'h-0',
              )}
            />
          </span>
        </div>
      ))}
    </div>
  )
}
