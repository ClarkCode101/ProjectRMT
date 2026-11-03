import type { ReactNode } from 'react'

// What she "sees" through the microscope on the Flashcards page: a round field of view with simple
// drawings of what a slide from that subject looks like (decoration, but it also hints at the subject):
// HEMA red cells + a WBC, MICRO Gram-stained cocci and rods, BBIS agglutinated red cells,
// CM urine crystals, HTMLE an H&E tissue section, CC serum with lipid droplets, All a mix.
// Positions come from a small seeded random generator, so each subject always looks the same.

/** Seeded random numbers (same seed = same picture every time). */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

/** n random points inside the field (a circle of radius ~80 around 100,100). */
function points(n: number, seed: number, radius = 80) {
  const random = seeded(seed)
  return Array.from({ length: n }, () => {
    const angle = random() * Math.PI * 2
    const r = Math.sqrt(random()) * radius
    return { x: 100 + r * Math.cos(angle), y: 100 + r * Math.sin(angle), turn: random() * 180, size: random() }
  })
}

function RedCell({ x, y, r = 9 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#E38E99" />
      {/* the pale centre of a red cell */}
      <circle cx={x} cy={y} r={r * 0.42} fill="#F4C7CC" />
    </g>
  )
}

const PICTURES: Record<string, { background: string; cells: () => ReactNode }> = {
  HEMA: {
    background: '#FBEFF1',
    cells: () => (
      <>
        {points(34, 7).map((p, i) => (
          <RedCell key={i} x={p.x} y={p.y} />
        ))}
        {/* a neutrophil: pale cytoplasm with a lobed purple nucleus */}
        <circle cx="72" cy="88" r="15" fill="#EEDDEB" />
        <circle cx="66" cy="84" r="5" fill="#6B3FA0" />
        <circle cx="75" cy="82" r="4.5" fill="#6B3FA0" />
        <circle cx="76" cy="92" r="5" fill="#6B3FA0" />
      </>
    ),
  },
  MICRO: {
    background: '#F6F1FA',
    cells: () => (
      <>
        {/* Gram-positive cocci in clusters (purple) */}
        {points(14, 3, 78).map((c, i) => (
          <g key={`c${i}`}>
            {points(5, 100 + i, 6).map((p, j) => (
              <circle key={j} cx={c.x + p.x - 100} cy={c.y + p.y - 100} r="2.8" fill="#5E3B9C" />
            ))}
          </g>
        ))}
        {/* Gram-negative rods (pink) */}
        {points(26, 11).map((p, i) => (
          <rect key={`r${i}`} x={p.x - 5} y={p.y - 1.6} width="10" height="3.2" rx="1.6" fill="#C4467C" transform={`rotate(${p.turn} ${p.x} ${p.y})`} />
        ))}
      </>
    ),
  },
  BBIS: {
    background: '#FCF0EF',
    cells: () => (
      <>
        {/* clumps of red cells (agglutination), plus a few free ones */}
        {points(4, 5, 55).map((c, i) => (
          <g key={i}>
            {points(8, 200 + i, 12).map((p, j) => (
              <circle key={j} cx={c.x + p.x - 100} cy={c.y + p.y - 100} r="7.5" fill="#D24B5A" stroke="#A8303F" strokeWidth="1" />
            ))}
          </g>
        ))}
        {points(5, 9).map((p, i) => (
          <circle key={`f${i}`} cx={p.x} cy={p.y} r="7" fill="#E07A86" />
        ))}
      </>
    ),
  },
  CM: {
    background: '#FBF5E8',
    cells: () => (
      <>
        {/* calcium oxalate: the "envelope" crystal */}
        {points(7, 13).map((p, i) => {
          const s = 7 + p.size * 5
          return (
            <g key={`e${i}`} transform={`rotate(${p.turn} ${p.x} ${p.y})`} fill="none" stroke="#8C7A45" strokeWidth="1.3">
              <rect x={p.x - s} y={p.y - s} width={s * 2} height={s * 2} fill="#FFFDF6" />
              <line x1={p.x - s} y1={p.y - s} x2={p.x + s} y2={p.y + s} />
              <line x1={p.x + s} y1={p.y - s} x2={p.x - s} y2={p.y + s} />
            </g>
          )
        })}
        {/* cystine: hexagonal plates */}
        {points(4, 21).map((p, i) => {
          const s = 10 + p.size * 4
          const hex = Array.from({ length: 6 }, (_, k) => `${p.x + s * Math.cos((Math.PI / 3) * k)},${p.y + s * Math.sin((Math.PI / 3) * k)}`).join(' ')
          return <polygon key={`h${i}`} points={hex} fill="#FFFDF6" stroke="#8C7A45" strokeWidth="1.3" />
        })}
      </>
    ),
  },
  HTMLE: {
    background: '#F4BCD2',
    cells: () => (
      <>
        {/* H&E tissue: pink cytoplasm, purple nuclei */}
        {points(36, 17, 92).map((p, i) => (
          <g key={i} transform={`rotate(${p.turn} ${p.x} ${p.y})`}>
            <ellipse cx={p.x} cy={p.y} rx="15" ry="10" fill="#EFA6C3" stroke="#E08AAE" strokeWidth="1" />
            <ellipse cx={p.x + 2} cy={p.y} rx="5" ry="4" fill="#5B3A8C" />
          </g>
        ))}
      </>
    ),
  },
  CC: {
    background: '#FBF1CF',
    cells: () => (
      <>
        {/* serum with lipid droplets */}
        {points(18, 19).map((p, i) => {
          const r = 3 + p.size * 7
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={r} fill="#FFF9E6" stroke="#D9A933" strokeWidth="1.2" />
              <circle cx={p.x - r * 0.35} cy={p.y - r * 0.35} r={r * 0.25} fill="#FFFFFF" />
            </g>
          )
        })}
      </>
    ),
  },
  All: {
    background: '#F3F4F8',
    cells: () => (
      <>
        {points(10, 23).map((p, i) => (
          <RedCell key={`rbc${i}`} x={p.x} y={p.y} r={8} />
        ))}
        {points(10, 29).map((p, i) => (
          <rect key={`rod${i}`} x={p.x - 5} y={p.y - 1.6} width="10" height="3.2" rx="1.6" fill="#C4467C" transform={`rotate(${p.turn} ${p.x} ${p.y})`} />
        ))}
        {points(6, 31).map((p, i) => (
          <circle key={`coc${i}`} cx={p.x} cy={p.y} r="2.8" fill="#5E3B9C" />
        ))}
        <g transform="rotate(20 128 70)" fill="#FFFDF6" stroke="#8C7A45" strokeWidth="1.3">
          <rect x="118" y="60" width="20" height="20" />
          <line x1="118" y1="60" x2="138" y2="80" />
          <line x1="138" y1="60" x2="118" y2="80" />
        </g>
        <circle cx="70" cy="132" r="9" fill="#FFF9E6" stroke="#D9A933" strokeWidth="1.2" />
      </>
    ),
  },
}

/** The round view through the eyepiece. `label` sits on the bottom edge (e.g. "HEMA · 3 due"). */
export function FieldOfView({ code, label, looking }: { code: string; label: string; looking: boolean }) {
  const picture = PICTURES[code] ?? PICTURES.All
  return (
    <div className={looking ? 'view-look relative' : 'relative'}>
      <svg viewBox="0 0 200 200" className="w-full drop-shadow-[0_18px_28px_rgb(7_71_94/0.35)]" aria-hidden>
        <defs>
          <clipPath id="fov-clip">
            <circle cx="100" cy="100" r="94" />
          </clipPath>
          {/* dark edge, like looking through a real eyepiece */}
          <radialGradient id="fov-vignette">
            <stop offset="0.62" stopColor="#07222D" stopOpacity="0" />
            <stop offset="1" stopColor="#07222D" stopOpacity="0.75" />
          </radialGradient>
        </defs>
        <g clipPath="url(#fov-clip)">
          {/* key: a new slide fades in with its own picture */}
          <g key={code} className="animate-in fade-in zoom-in-95 origin-center duration-300 [transform-box:fill-box]">
            <rect width="200" height="200" fill={picture.background} />
            {picture.cells()}
          </g>
          <rect width="200" height="200" fill="url(#fov-vignette)" />
        </g>
        {/* the eyepiece rim */}
        <circle cx="100" cy="100" r="95" fill="none" stroke="var(--primary-deep)" strokeWidth="8" />
      </svg>
      <p className="absolute inset-x-0 bottom-[8%] flex justify-center">
        <span className="rounded-full bg-primary-deep px-2.5 py-0.5 text-xs font-bold whitespace-nowrap sm:px-3 sm:py-1 sm:text-sm text-white shadow-md tabular-nums">{label}</span>
      </p>
    </div>
  )
}
