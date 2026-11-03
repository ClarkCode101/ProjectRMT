import { LabBench } from '@/components/LabBench'
import { cn } from '@/lib/utils'
import { FieldOfView } from './FieldOfView'

// The subject picker on Flashcards: a microscope on the lab bench, what it shows, and glass slides in front of it.
// (Practice has the specimen rack, Mock exam the analyzer; Flashcards is where she reads slides.)
// - Each subject (plus All) is a glass slide: a frosted label end (code + cards due) and a stained smear.
// - The chosen slide lifts up and is "on the stage": the microscope holds it, and the round field of view
//   beside it shows what that subject looks like under the lens (FieldOfView), with its card counts.
// - When she presses Look, the lamp turns on, the view brightens and the microscope zooms into the eyepiece
//   (.microscope-look / .view-look in index.css), then the session starts. Skipped with reduced motion.
// - Slides show only their DUE cards. New cards share one daily limit across all subjects, so they're shown
//   once, for the chosen slide (on the view and in the start bar), and the numbers always add up.
// Every slide is a real radio button, so keyboard and screen readers work like any other choice.

export type TraySlide = {
  key: string
  code: string
  name: string
  due: number
}

/** The smear on each slide, tinted like a typical stain for that subject (decoration only). */
const SMEAR: Record<string, string> = {
  All: 'rgb(11 99 130 / 0.35)', // the app's blue
  CC: 'rgb(214 160 40 / 0.4)', // serum, straw yellow
  MICRO: 'rgb(110 70 170 / 0.4)', // Gram stain, crystal violet
  HEMA: 'rgb(190 80 150 / 0.4)', // Wright stain, pink-purple
  BBIS: 'rgb(200 40 60 / 0.4)', // red cells
  CM: 'rgb(220 150 40 / 0.4)', // urine sediment, amber
  HTMLE: 'rgb(220 110 160 / 0.4)', // H&E, pink
}

/** The microscope drawing. `code` is the slide on the stage; `looking` turns the lamp on. */
function Microscope({ code, looking }: { code: string; looking: boolean }) {
  return (
    <svg viewBox="0 0 200 240" className={cn('w-full overflow-visible', looking && 'microscope-look')} aria-hidden>
      {/* light beam from the lamp up through the slide to the eyepiece, only while looking */}
      {looking && <path d="M98 194 L108 194 L80 20 L70 22 Z" fill="var(--highlight)" className="microscope-beam" />}

      {/* base and pillar */}
      <rect x="34" y="212" width="138" height="18" rx="9" fill="var(--primary-deep)" />
      <rect x="136" y="112" width="20" height="104" rx="7" fill="var(--primary-deep)" />
      {/* the arm curving over to the head */}
      <path d="M146 120 C146 74 128 58 104 58" fill="none" stroke="var(--primary-deep)" strokeWidth="18" strokeLinecap="round" />
      {/* body tube and eyepiece (angled toward her) */}
      <line x1="102" y1="80" x2="78" y2="32" stroke="var(--primary-deep)" strokeWidth="20" strokeLinecap="round" />
      <line x1="78" y1="32" x2="70" y2="14" stroke="var(--primary)" strokeWidth="14" strokeLinecap="round" />
      {/* nosepiece and objective, pointing down at the slide */}
      <rect x="90" y="80" width="26" height="12" rx="4" fill="var(--primary)" />
      <rect x="96" y="92" width="14" height="24" rx="3" fill="var(--primary)" />
      <rect x="98" y="114" width="10" height="5" rx="1.5" fill="var(--primary-deep)" />
      {/* focus knob on the pillar */}
      <circle cx="146" cy="152" r="11" fill="var(--primary)" stroke="var(--primary-deep)" strokeWidth="3" />
      <circle cx="146" cy="152" r="4" fill="var(--primary-deep)" />

      {/* stage, held by the pillar */}
      <rect x="120" y="128" width="20" height="8" fill="var(--primary-deep)" />
      <rect x="46" y="126" width="104" height="10" rx="3" fill="var(--secondary)" stroke="var(--primary-deep)" strokeOpacity="0.35" />
      {/* callout from the eyepiece to the field of view beside it ("this is what you see inside").
          It reaches past the drawing (overflow-visible) to the view's left edge; that works because the
          scene keeps the view ≈1.15× the microscope's width and the gap ≈30 drawing units at every size. */}
      {!looking && (
        <g fill="none" stroke="var(--primary)" strokeOpacity="0.45" strokeWidth="1.5">
          <circle cx="72" cy="12" r="2.5" fill="var(--primary)" fillOpacity="0.45" stroke="none" />
          <path d="M75 12 Q170 18 231 113" strokeDasharray="4 4" />
        </g>
      )}

      {/* the slide on the stage (slides in again whenever she picks another one) */}
      <g key={code} className="slide-load">
        <rect x="56" y="120" width="84" height="7" rx="1.5" fill="var(--card)" stroke="var(--primary)" strokeOpacity="0.5" />
        <rect x="56" y="120" width="24" height="7" rx="1.5" fill="var(--primary)" fillOpacity="0.35" />
        <ellipse cx="108" cy="123.5" rx="14" ry="2.2" fill={SMEAR[code] ?? SMEAR.All} />
      </g>

      {/* condenser under the stage, and the lamp in its housing on the base */}
      <rect x="96" y="138" width="14" height="10" rx="2" fill="var(--primary-deep)" />
      <rect x="84" y="190" width="38" height="24" rx="5" fill="var(--primary-deep)" />
      <circle cx="103" cy="198" r="6" fill="var(--highlight)" className={cn('transition-opacity duration-300', looking ? 'opacity-100' : 'opacity-30')} />
    </svg>
  )
}

/**
 * One glass slide standing in the slide rack: frosted label on top (the code, written lengthwise like on a
 * real slide) and a stained smear below. The count of cards due is shown under the rack (see MicroscopeScene).
 * The chosen one is pulled up out of the rack (like a tube on the Practice rack): it's the one on the stage.
 */
function Slide({ slide, checked, onChange }: { slide: TraySlide; checked: boolean; onChange: () => void }) {
  const empty = slide.due === 0
  return (
    <label className="group relative flex w-10 cursor-pointer flex-col items-center rounded-md outline-none has-focus-visible:ring-3 has-focus-visible:ring-ring/40 @md:w-12">
      <input type="radio" name="flashcard-subject" checked={checked} onChange={onChange} className="sr-only" />
      <span className="sr-only">
        {slide.name}: {empty ? 'no cards due' : `${slide.due} due`}
        {checked && ', on the stage'}
      </span>
      <span
        aria-hidden
        className={cn(
          'flex h-28 w-8 flex-col overflow-hidden rounded-[3px] border bg-linear-to-b from-white to-secondary/50 transition-[translate,box-shadow,border-color] duration-300 ease-out @md:h-32 @md:w-10',
          checked
            ? '-translate-y-4 border-primary shadow-[0_14px_20px_-10px_rgb(7_71_94/0.6)] ring-1 ring-primary'
            : 'border-primary/25 shadow-[0_6px_12px_-10px_rgb(7_71_94/0.6)] group-hover:-translate-y-1.5',
          empty && !checked && 'opacity-55',
        )}
      >
        {/* frosted label end with the code, written along the slide */}
        <span className={cn('flex h-[45%] items-center justify-center border-b', checked ? 'border-primary/20 bg-primary/15' : 'border-primary/15 bg-secondary')}>
          <span className="font-heading text-xs font-bold text-primary [writing-mode:vertical-rl] @md:text-sm">{slide.code}</span>
        </span>
        {/* the glass with a stained smear (and a glint) */}
        <span className="relative flex-1">
          <span className="absolute top-[38%] left-1/2 h-1/2 w-3/5 -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-[1px]" style={{ background: SMEAR[slide.code] ?? SMEAR.All }} />
          <span className="absolute inset-y-2 left-1 w-0.5 rounded-full bg-white/80" />
        </span>
      </span>
    </label>
  )
}

export function MicroscopeScene({
  slides,
  selectedKey,
  onSelect,
  viewLabel,
  looking,
}: {
  slides: TraySlide[]
  selectedKey: string
  onSelect: (key: string) => void
  /** shown on the field of view, e.g. "HEMA · 3 due · 2 new" */
  viewLabel: string
  /** true while the "look into the eyepiece" scene plays */
  looking: boolean
}) {
  const onStage = slides.find((s) => s.key === selectedKey) ?? slides[0]
  return (
    <div className="@container">
      {/* ---------- the microscope and what it shows (the focal point) ---------- */}
      {/* Sizes go together (the callout line depends on them): view ≈ 1.15 × microscope width, gap ≈ 15% of it.
          Phone 112 / 128 px · tablet 160 / 184 · laptop 208 / 240. */}
      <div className="flex items-end justify-center gap-4 @md:gap-6 @2xl:gap-8">
        <div className="w-28 shrink-0 @md:w-40 @2xl:w-52">
          <Microscope code={onStage.code} looking={looking} />
        </div>
        <div className="mb-2 w-32 @md:mb-3 @md:w-46 @2xl:w-60">
          <FieldOfView code={onStage.code} label={viewLabel} looking={looking} />
        </div>
      </div>

      {/* ---------- the slide rack on the bench in front of it: slides stand up, so the row stays about as
          wide as the microscope + view (one centered column), and all seven fit on a phone. ---------- */}
      <fieldset disabled={looking} className="relative min-w-0">
        <legend className="sr-only">Slide to study</legend>
        <LabBench className="h-full" />
        <div className="relative flex justify-center pt-6 pb-3">
          <div className="relative">
            <div className="flex gap-1.5 px-3 @md:gap-2.5 @md:px-4">
              {slides.map((slide) => (
                <Slide key={slide.key} slide={slide} checked={slide.key === selectedKey} onChange={() => onSelect(slide.key)} />
              ))}
            </div>
            {/* the rack's front bar: it covers the slides' lower ends, so they look like they stand in it */}
            <div
              aria-hidden
              className="pointer-events-none relative -mt-7 h-7 rounded-md border border-primary/15 bg-secondary shadow-[inset_0_-3px_0_rgb(7_71_94/0.12),0_6px_10px_-8px_rgb(7_71_94/0.5)]"
            />
            {/* cards due, under each slide (like the % under each tube on Practice); each slide's label already says it */}
            <div aria-hidden className="mt-2 flex gap-1.5 px-3 @md:gap-2.5 @md:px-4">
              {slides.map((slide) => (
                <span
                  key={slide.key}
                  className={cn(
                    'w-10 text-center text-xs font-bold tabular-nums @md:w-12',
                    slide.key === selectedKey ? 'text-primary' : slide.due === 0 ? 'text-muted-foreground/60' : 'text-muted-foreground',
                  )}
                >
                  {slide.due === 0 ? '–' : slide.due}
                </span>
              ))}
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  )
}
