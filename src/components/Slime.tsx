import { cn } from '@/lib/utils'

// The ProjectRMT mascot on its own (no blue tile): the cyan slime from the logo, with its lab goggles and coat,
// drawn with the cartoon ink outline. It reacts to how she is doing:
// - happy: the normal face (guide, Next up)
// - cheer: eyes closed in a smile, mouth open (a correct answer, a good result)
// - oops:  worried brows and a sweat drop (a wrong answer; kind, never angry)
// Same drawing as Logo in report.tsx, so keep the two in step if the logo changes.

export type SlimeMood = 'happy' | 'cheer' | 'oops'

const INK = '#0E3445'

export function Slime({ mood = 'happy', className }: { mood?: SlimeMood; className?: string }) {
  return (
    <svg viewBox="26 120 460 392" aria-hidden className={cn('shrink-0 overflow-visible', className)}>
      {/* body + right-side shade */}
      <path d="M92 540C70 360 130 140 256 136C382 140 442 360 420 540Z" fill="#4FC1D6" stroke={INK} strokeWidth="11" strokeLinejoin="round" />
      <path d="M364 214C404 280 426 400 420 540H384C392 420 386 300 364 214Z" fill="#3AA8BF" />
      {/* safety goggles on the forehead */}
      <path d="M104 236C170 206 342 206 408 236L404 262C340 236 172 236 108 262Z" fill={INK} />
      <rect x="160" y="196" width="84" height="64" rx="26" fill={INK} />
      <rect x="268" y="196" width="84" height="64" rx="26" fill={INK} />
      <rect x="170" y="206" width="64" height="44" rx="18" fill="#BFEFF8" />
      <rect x="278" y="206" width="64" height="44" rx="18" fill="#BFEFF8" />
      <path d="M184 220L198 212M292 220L306 212" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" />
      <rect x="240" y="218" width="32" height="14" rx="5" fill={INK} />
      {/* lab coat with folded collar */}
      <path d="M40 540C48 450 104 404 184 392L236 460L230 540Z" fill="#FFFFFF" stroke={INK} strokeWidth="11" strokeLinejoin="round" />
      <path d="M472 540C464 450 408 404 328 392L276 460L282 540Z" fill="#FFFFFF" stroke={INK} strokeWidth="11" strokeLinejoin="round" />
      <path d="M184 392L160 356L234 424L236 460Z" fill="#DCE6EC" />
      <path d="M328 392L352 356L278 424L276 460Z" fill="#DCE6EC" />
      {/* gold RMT ID badge */}
      <rect x="330" y="440" width="62" height="40" rx="7" fill="#F7B538" stroke={INK} strokeWidth="6" />
      <rect x="338" y="450" width="22" height="20" rx="3" fill="#FFFFFF" />
      <rect x="366" y="452" width="18" height="5" rx="2.5" fill="#FFFFFF" />
      <rect x="366" y="463" width="12" height="5" rx="2.5" fill="#FFFFFF" />
      {/* the face */}
      {mood === 'happy' && (
        <>
          <ellipse cx="220" cy="314" rx="16" ry="21" fill={INK} />
          <ellipse cx="292" cy="314" rx="16" ry="21" fill={INK} />
          <circle cx="225" cy="306" r="5.5" fill="#FFFFFF" />
          <circle cx="297" cy="306" r="5.5" fill="#FFFFFF" />
          <path d="M240 350Q256 364 272 350" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
          <ellipse cx="190" cy="346" rx="14" ry="8" fill="#FF9FB0" opacity="0.7" />
          <ellipse cx="322" cy="346" rx="14" ry="8" fill="#FF9FB0" opacity="0.7" />
        </>
      )}
      {mood === 'cheer' && (
        <>
          <path d="M202 322q18-26 36 0M274 322q18-26 36 0" fill="none" stroke={INK} strokeWidth="10" strokeLinecap="round" />
          <path d="M232 342h48q-2 34-24 34t-24-34z" fill={INK} />
          <path d="M243 366q13-10 26 0q-5 10-13 10t-13-10z" fill="#FF7C93" />
          <ellipse cx="188" cy="348" rx="14" ry="8" fill="#FF9FB0" opacity="0.8" />
          <ellipse cx="324" cy="348" rx="14" ry="8" fill="#FF9FB0" opacity="0.8" />
        </>
      )}
      {mood === 'oops' && (
        <>
          <ellipse cx="220" cy="316" rx="15" ry="19" fill={INK} />
          <ellipse cx="292" cy="316" rx="15" ry="19" fill={INK} />
          <circle cx="216" cy="310" r="5" fill="#FFFFFF" />
          <circle cx="288" cy="310" r="5" fill="#FFFFFF" />
          <path d="M200 288l34 8M312 288l-34 8" stroke={INK} strokeWidth="8" strokeLinecap="round" />
          <path d="M238 358q9-10 18 0t18 0" fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
          <path d="M372 280c10 14 16 22 16 30a16 16 0 0 1-32 0c0-8 6-16 16-30z" fill="#BFEFF8" stroke={INK} strokeWidth="6" />
        </>
      )}
    </svg>
  )
}
