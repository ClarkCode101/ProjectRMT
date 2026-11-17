import type { ReactNode } from 'react'

// The drawing of Home's body (BodyCartoon.tsx puts it on screen): the body's outline and the organs inside it.
// Everything here is in the drawing's own units: 395 wide, 648 tall.

export const INK = '#0E3445'

/** The outline of the whole figure (head with the bob haircut, arms, body, legs) as one closed shape. */
export const BODY_OUTLINE =
  'M185.0 26.4C188.2 26.5 196.2 26.0 203.0 27.0C209.8 28.0 219.5 30.2 226.0 32.1C232.5 34.1 236.8 36.0 242.0 38.7C247.2 41.5 251.8 44.4 257.0 48.6C262.2 52.8 268.5 58.9 273.0 64.0C277.5 69.1 280.9 74.0 283.9 79.0C286.8 84.0 288.8 88.7 290.7 94.0C292.6 99.3 294.3 104.3 295.1 111.0C296.0 117.7 296.3 127.8 296.0 134.0C295.7 140.2 294.9 143.2 293.6 148.0C292.3 152.8 290.8 157.8 288.3 163.0C285.8 168.2 280.7 174.2 278.6 179.0C276.4 183.8 277.2 189.4 275.3 191.9C273.4 194.4 271.0 191.8 267.0 194.0C263.0 196.2 255.7 203.0 251.0 204.9C246.3 206.7 243.7 203.8 239.0 204.9C234.3 206.0 226.5 209.6 223.0 211.4C219.5 213.3 218.8 214.4 218.0 216.0C217.2 217.6 217.0 219.2 218.0 221.0C219.0 222.8 219.2 224.4 224.0 226.6C228.8 228.8 241.5 231.7 247.0 234.3C252.5 236.9 254.0 238.7 257.0 242.0C260.0 245.3 261.5 246.8 265.3 254.0C269.0 261.2 275.8 277.7 279.4 285.0C283.1 292.3 284.9 294.3 287.3 298.0C289.7 301.7 289.9 302.3 294.0 307.0C298.1 311.7 305.7 320.2 312.0 326.0C318.3 331.8 323.7 337.8 332.0 342.0C340.3 346.2 356.4 349.0 362.0 351.0C367.6 353.0 364.7 352.8 365.6 354.0C366.4 355.2 367.1 356.3 367.0 358.0C366.9 359.7 366.2 362.1 364.9 364.0C363.5 365.9 362.3 367.6 359.0 369.1C355.7 370.6 348.8 370.9 345.0 373.0C341.2 375.1 338.7 380.2 336.0 381.6C333.3 383.0 332.0 382.5 329.0 381.3C326.0 380.1 324.0 379.0 318.0 374.6C312.0 370.2 299.9 361.1 293.0 355.0C286.1 348.9 282.4 345.3 276.7 338.0C271.0 330.7 262.6 316.0 258.9 311.3C255.1 306.6 255.6 309.3 254.0 309.7C252.4 310.2 250.0 312.1 249.0 314.0C248.0 315.9 247.9 318.2 248.0 321.0C248.1 323.8 247.5 322.3 249.6 331.0C251.6 339.7 258.1 363.8 260.1 373.0C262.2 382.2 261.7 381.0 262.0 386.0C262.3 391.0 262.4 397.5 262.0 403.0C261.6 408.5 261.7 410.3 259.4 419.0C257.2 427.7 250.4 448.3 248.6 455.0C246.8 461.7 248.3 457.5 248.7 459.0C249.2 460.5 249.2 461.7 251.3 464.0C253.3 466.3 257.9 469.7 261.0 473.0C264.1 476.3 266.7 479.2 269.7 484.0C272.7 488.8 275.6 493.3 278.9 502.0C282.1 510.7 287.1 528.2 289.1 536.0C291.2 543.8 290.7 544.5 291.0 549.0C291.3 553.5 291.5 558.0 291.0 563.0C290.5 568.0 288.8 575.3 287.7 579.0C286.6 582.7 286.2 583.0 284.6 585.0C283.0 587.0 281.1 589.3 278.0 590.7C274.9 592.1 268.6 592.4 266.0 593.6C263.4 594.8 262.6 594.4 262.6 598.0C262.6 601.6 265.5 610.8 266.0 615.0C266.5 619.2 265.9 620.8 265.4 623.0C265.0 625.2 264.8 626.2 263.4 628.0C262.0 629.8 259.6 632.4 257.0 633.6C254.4 634.7 251.3 635.2 248.0 635.0C244.7 634.8 241.1 634.6 237.0 632.4C232.9 630.3 227.6 626.4 223.1 622.0C218.7 617.6 218.4 617.8 210.3 606.0C202.2 594.2 181.6 562.2 174.7 551.0C167.9 539.8 170.7 543.0 169.1 539.0C167.6 535.0 166.8 534.7 165.6 527.0C164.4 519.3 163.0 500.2 162.0 493.0C161.0 485.8 163.4 491.5 159.9 484.0C156.3 476.5 145.3 457.7 140.7 448.0C136.1 438.3 134.4 432.7 132.4 426.0C130.5 419.3 129.3 414.8 129.0 408.0C128.7 401.2 129.3 391.8 130.6 385.0C131.9 378.2 131.6 377.2 136.7 367.0C141.8 356.8 156.8 332.5 161.0 324.0C165.2 315.5 162.1 318.2 162.0 316.0C161.9 313.8 161.4 312.4 160.4 311.0C159.4 309.6 157.6 308.0 156.0 307.7C154.4 307.4 154.1 306.1 151.0 309.3C147.9 312.5 142.1 321.3 137.3 327.0C132.5 332.7 127.7 338.1 122.0 343.4C116.3 348.7 109.5 354.1 103.0 358.7C96.5 363.3 89.0 368.2 83.0 371.0C77.0 373.8 70.8 374.7 67.0 375.3C63.2 375.9 62.4 376.5 60.0 374.7C57.6 372.9 55.8 367.1 52.9 364.3C49.9 361.5 44.4 359.8 42.3 357.7C40.1 355.7 40.2 353.6 40.0 352.0C39.8 350.4 40.2 349.1 40.9 348.0C41.5 346.9 39.3 346.9 44.0 345.1C48.7 343.4 63.5 339.6 69.0 337.7C74.5 335.9 69.7 339.5 77.0 334.0C84.3 328.5 105.3 311.7 113.0 305.0C120.7 298.3 117.6 302.7 123.0 294.0C128.4 285.3 140.3 261.3 145.1 253.0C150.0 244.7 149.5 246.6 152.0 244.0C154.5 241.4 156.0 239.5 160.0 237.3C164.0 235.1 172.7 232.7 176.0 231.0C179.3 229.3 179.4 228.7 180.0 227.0C180.6 225.3 180.4 222.6 179.4 221.0C178.4 219.4 177.9 218.2 174.0 217.3C170.1 216.3 160.5 215.1 156.0 215.3C151.5 215.5 150.3 218.2 147.0 218.3C143.7 218.4 139.2 216.9 136.0 215.9C132.8 214.8 130.5 212.4 128.0 211.9C125.5 211.4 122.6 212.9 121.0 212.9C119.4 212.9 119.7 213.8 118.1 211.9C116.5 209.9 115.1 205.1 111.4 201.0C107.7 196.9 100.5 192.0 96.0 187.0C91.5 182.0 87.5 176.7 84.4 171.0C81.4 165.3 79.3 159.8 77.6 153.0C75.9 146.2 74.2 137.7 74.1 130.0C74.1 122.3 75.7 114.2 77.4 107.0C79.2 99.8 81.7 93.2 84.7 87.0C87.8 80.8 92.0 74.8 95.7 70.0C99.4 65.2 102.3 62.2 107.0 58.0C111.7 53.8 118.3 48.6 124.0 45.0C129.7 41.4 134.7 38.7 141.0 36.1C147.3 33.6 154.8 31.2 162.0 29.6C169.2 28.0 180.2 27.1 184.0 26.6C187.8 26.0 181.8 26.4 185.0 26.4Z'

// How the organs are drawn:
// - Each main shape is filled with var(--organ-fill, its color): the body sets --organ-fill to grey
//   for a subject she hasn't started yet, so the organ "gets its color" once she answers something.
const outline = { stroke: INK, strokeWidth: 3.2, strokeLinejoin: 'round', strokeLinecap: 'round' } as const
const fillOf = (color: string) => ({ fill: `var(--organ-fill, ${color})` })

/** A round eye with a small white sparkle. */
function Eye({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={INK} />
      <circle cx={x + r * 0.3} cy={y - r * 0.35} r={r * 0.36} fill="#FFFFFF" />
    </>
  )
}

/** A smile, `w` wide, with its middle at x. */
function Smile({ x, y, w }: { x: number; y: number; w: number }) {
  return <path d={`M${x - w / 2} ${y}q${w / 2} ${w * 0.55} ${w} 0`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
}

/** A white shine line, so the organ looks soft and round. */
function Shine({ d, w = 3 }: { d: string; w?: number }) {
  return <path d={d} fill="none" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={w} strokeLinecap="round" />
}

/** A tube (blood vessel, ureter): an ink line underneath and the color on top. */
function Tube({ d, color, w }: { d: string; color: string; w: number }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={w + 5} strokeLinecap="round" />
      <path d={d} fill="none" style={{ stroke: `var(--organ-fill, ${color})` }} strokeWidth={w} strokeLinecap="round" />
    </>
  )
}

export type BodyOrgan = {
  /** the middle of the organ and its size: the gold ring, the glow and the tap area are circles around it */
  middle: { x: number; y: number }
  r: number
  /** where its card's line ends: the organ's edge on its card's side */
  lineEnd: { x: number; y: number }
  art: ReactNode
}

/** The organ of each subject (by subject code), already in its place in the body. */
export const BODY_ORGANS: Record<string, BodyOrgan> = {
  // Brain: two halves, the cerebellum under them and the brain stem
  HTMLE: {
    middle: { x: 189, y: 92 },
    r: 62,
    lineEnd: { x: 244, y: 70 },
    art: (
      <>
        <path d="M185 110C172 107 162 111 160 118C154 122 156 131 164 132C169 136 179 135 185 132Z" style={fillOf('#9B7BEA')} {...outline} />
        <path d="M199 109C212 106 221 111 223 118C228 123 225 131 217 132C211 136 204 135 199 132Z" style={fillOf('#9B7BEA')} {...outline} />
        <path d="M183 106H201L200 146Q192 150 184 146Z" style={fillOf('#B195F2')} {...outline} />
        <path d="M170 46C182 49 188 70 186 93C185 104 175 110 160 109C150 110 142 106 139 100C131 96 129 86 133 80C131 70 137 62 145 60C150 50 160 44 170 46Z" style={fillOf('#9B7BEA')} {...outline} />
        <path d="M198 43C210 40 222 44 228 52C238 56 244 64 243 74C248 80 246 90 240 94C238 102 228 106 216 105C204 107 192 102 189 92C186 72 188 50 198 43Z" style={fillOf('#9B7BEA')} {...outline} />
        <path d="M181 106Q191 98 202 106Q192 117 181 106Z" style={fillOf('#B195F2')} {...outline} />
        <path d="M140 84Q156 78 178 82M196 80Q216 74 240 80" fill="none" stroke={INK} strokeOpacity={0.18} strokeWidth={3} strokeLinecap="round" />
        <Shine d="M148 66L155 60" w={4} />
        <Shine d="M196 56L199 49" w={4} />
        <Eye x={170} y={96} r={8} />
        <Eye x={205} y={94} r={8.5} />
      </>
    ),
  },
  // Lungs: two drops; the ring goes around the left one (the heart sits on the right one)
  MICRO: {
    middle: { x: 178, y: 266 },
    r: 30,
    lineEnd: { x: 160, y: 272 },
    art: (
      <>
        <path d="M184 234C192 244 198 262 197 284C197 292 190 297 180 296C168 296 158 290 158 278C158 262 172 246 184 234Z" style={fillOf('#4FB6E8')} {...outline} />
        <path d="M224 233C236 244 246 262 246 280C246 292 238 298 228 298C216 298 208 292 208 282C208 262 214 246 224 233Z" style={fillOf('#4FB6E8')} {...outline} />
        <Shine d="M178 246Q172 254 169 262" />
        <Shine d="M228 242Q232 248 234 254" />
        <Eye x={171} y={258} r={3.2} />
        <Eye x={187} y={258} r={3.2} />
        <Smile x={179} y={264} w={8} />
      </>
    ),
  },
  // Heart, with a vein (blue) and the aorta (red) on top
  HEMA: {
    middle: { x: 227, y: 276 },
    r: 24,
    lineEnd: { x: 241, y: 276 },
    art: (
      <>
        <Tube d="M207 272Q213 269 217 278" color="#4FA3E0" w={5} />
        <Tube d="M224 270C218 262 222 254 231 258" color="#E5484D" w={6} />
        <path d="M214 280C212 270 220 266 228 268C238 268 242 278 240 286C238 294 228 296 222 292C216 290 214 286 214 280Z" style={fillOf('#E5484D')} {...outline} />
        <Shine d="M219 276Q221 272 225 271" w={2.2} />
        <Eye x={222} y={281} r={2.6} />
        <Eye x={233} y={281} r={2.6} />
        <Smile x={227.5} y={286} w={6} />
      </>
    ),
  },
  // Liver, with the small green gallbladder under it
  CC: {
    middle: { x: 203, y: 299 },
    r: 36,
    lineEnd: { x: 171, y: 300 },
    art: (
      <>
        <path d="M172 296C174 286 196 282 212 285C226 288 238 292 237 300C236 308 222 311 210 312C200 316 186 313 178 309C170 306 168 302 172 296Z" style={fillOf('#B9773F')} {...outline} />
        <ellipse cx="193" cy="317" rx="5" ry="7" style={fillOf('#7FB069')} {...outline} strokeWidth={2.6} />
        <Shine d="M180 293Q188 289 198 288" />
        <Eye x={193} y={298} r={4} />
        <Eye x={211} y={298} r={4} />
        <Smile x={202} y={304} w={9} />
      </>
    ),
  },
  // Kidneys, their two tubes (ureters) and the bladder
  CM: {
    middle: { x: 207, y: 350 },
    r: 38,
    lineEnd: { x: 239, y: 336 },
    art: (
      <>
        <Tube d="M196 338C203 346 200 358 204 370" color="#E8875A" w={3.5} />
        <Tube d="M218 338C211 346 214 358 210 370" color="#E8875A" w={3.5} />
        <path d="M188 322C196 322 200 332 198 342C196 350 188 353 182 351C176 348 174 340 176 332C178 326 182 322 188 322Z" style={fillOf('#E8875A')} {...outline} />
        <path d="M226 322C218 322 214 332 216 342C218 350 226 353 232 351C238 348 240 340 238 332C236 326 232 322 226 322Z" style={fillOf('#E8875A')} {...outline} />
        <circle cx="207" cy="379" r="9.5" style={fillOf('#F7C948')} {...outline} />
        <Shine d="M181 330Q182 327 185 326" w={2.2} />
        <Shine d="M221 330Q222 327 225 326" w={2.2} />
        <Shine d="M202 376Q203 373 206 372" w={2.2} />
        <Eye x={183} y={336} r={2.3} />
        <Eye x={192} y={336} r={2.3} />
        <Smile x={187.5} y={341} w={5} />
        <Eye x={222} y={336} r={2.3} />
        <Eye x={231} y={336} r={2.3} />
        <Smile x={226.5} y={341} w={5} />
      </>
    ),
  },
  // The blood drop, held in the left hand
  BBIS: {
    middle: { x: 67, y: 353 },
    r: 20,
    lineEnd: { x: 59, y: 354 },
    art: (
      <>
        <path d="M67 340C70.5 347 76 351 76 356C76 361 72 364 67 364C62 364 58 361 58 356C58 351 63.5 347 67 340Z" style={fillOf('#E5484D')} {...outline} strokeWidth={2.4} />
        <Shine d="M61.5 355Q62 351.5 64.5 349" w={2} />
        <Eye x={64} y={357} r={1.6} />
        <Eye x={70} y={357} r={1.6} />
        <Smile x={67} y={360} w={3.4} />
      </>
    ),
  },
}
