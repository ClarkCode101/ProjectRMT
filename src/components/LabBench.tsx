import { cn } from '@/lib/utils'

/**
 * The soft "lab bench" surface that the page's scene stands on (the Practice rack, the Mock exam rotor),
 * so those scenes read as objects on a table instead of boxes of data.
 * It fades out at the sides and has a soft shadow right under the object.
 * Put it inside a `relative` box, behind the object; set its height with className.
 */
export function LabBench({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 rounded-b-3xl border-t border-primary/15 bg-linear-to-b from-primary/[0.09] to-transparent [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]',
        className,
      )}
    >
      <div className="absolute inset-x-[20%] -top-2.5 h-5 rounded-[50%] bg-primary-deep/20 blur-md" />
    </div>
  )
}
