import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'

// Home's body: a chibi 3D cartoon (big round head, small body) with the six "subject organs" inside.
// Cartoon look: toon shading (three flat tones instead of smooth shading), an ink outline on every shape,
// and a little face on each main organ. The organs are drawn on top of the skin, like an x-ray.
// Built from simple shapes (no model file to download), so it stays light on mobile data.
// The organ shapes below are built at adult size (about 1.75 tall, from the first 3D body); makeOrgans() fits
// them into the chibi body (PLACES). Facing the camera is +z.

/** Where an organ is on screen right now, so the page can draw a line to its card. */
export type OrganAnchor = { code: string; x: number; y: number; /** false when the organ is turned away */ facing: boolean }

export type Body3DControls = { rotateBy: (radians: number) => void }

type Props = {
  selectedCode: string | undefined
  /** how each organ looks, by subject code: grey (not started), its color, or glowing (passing) */
  looks?: Record<string, 'grey' | 'color' | 'glow'>
  onPick: (code: string) => void
  /** called every frame with the organ positions in CSS pixels, relative to the canvas */
  onFrame?: (anchors: OrganAnchor[]) => void
  /** gives the page a way to turn the body (the ‹ › buttons) */
  ref?: Ref<Body3DControls>
  /** true = do a little dance (Home sets it once a day, when the daily goal is reached) */
  celebrate?: boolean
  className?: string
  /** shown instead when the device can't draw 3D (Home passes the flat cartoon body) */
  fallback?: ReactNode
}

type OrganSpec = {
  code: string
  color: string
  build: () => THREE.Object3D
  /**
   * Where its card line ends, if not the middle of the organ. For the pairs (lungs, kidneys) the middle is the
   * empty space between them (for the lungs, that's where the heart is), so the line goes to the one on its card's side.
   */
  anchor?: [number, number, number]
}

function ellipsoid(radius: [number, number, number], position: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), material)
  mesh.scale.set(...radius)
  mesh.position.set(...position)
  return mesh
}

/** A shape turned around the up axis from a side outline of [radius, height] points (like a vase on a potter's wheel). */
function lathe(profile: [number, number][], material: THREE.Material, segments = 32) {
  return new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments), material)
}

/** A unit sphere whose points are moved by `bend`, for organ shapes a plain ball can't make (liver wedge, kidney bean). */
function bentSphere(bend: (v: THREE.Vector3) => void, widthSegments = 40, heightSegments = 28) {
  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments)
  const position = geometry.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i)
    bend(v)
    position.setXYZ(i, v.x, v.y, v.z)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** A few [radius, height] points turned into a smooth outline for `lathe` (so a drop has no corners). */
function smoothProfile(points: [number, number][], steps = 32): [number, number][] {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)))
  return curve.getPoints(steps).map((p) => [Math.max(0, p.x), p.y])
}

/**
 * Three flat tones of light (shadow, middle, lit) for the toon look, instead of a smooth gradient.
 * Made once and shared by every cartoon material.
 */
const TOON_RAMP = (() => {
  const ramp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat)
  ramp.minFilter = THREE.NearestFilter
  ramp.magFilter = THREE.NearestFilter
  ramp.generateMipmaps = false
  ramp.needsUpdate = true
  return ramp
})()

/**
 * The material of an organ part: cartoon (toon) shading.
 * The color itself is set every frame (grey until the subject is started, then the organ's color), so a part only says
 * how it differs: `tone` above 0 = lighter, below 0 = darker; `own` = its own color instead of the organ's
 * (the blue vessel on the heart, the green gallbladder, the yellow bladder).
 */
function organMaterial(tone = 0, own?: string) {
  const material = new THREE.MeshToonMaterial({ gradientMap: TOON_RAMP })
  material.userData = { tone, own: own ? new THREE.Color(own) : null }
  return material
}

/** A kidney: a sphere pressed in on one side (the hilum, toward the spine). `side` 1 = her left (viewer's right). */
function kidney(position: [number, number, number], side: 1 | -1, material: THREE.Material) {
  const mesh = new THREE.Mesh(
    bentSphere((v) => {
      if (v.x < 0) v.x *= 1 - 0.55 * Math.exp(-(v.y * v.y) / 0.12)
    }),
    material,
  )
  // Mirrored for her right kidney, so both dents face the spine.
  mesh.scale.set(0.033 * side, 0.054, 0.028)
  mesh.position.set(...position)
  mesh.rotation.z = side * 0.12 // tops lean in a little, like real ones
  return mesh
}

/**
 * One lung: narrow at the top, wide at the bottom with a flat base (it sits on the diaphragm),
 * flat on the inner side with a dip where the heart is. `side` 1 = her left (viewer's right).
 */
function lung(side: 1 | -1, material: THREE.Material) {
  const mesh = new THREE.Mesh(
    bentSphere((v) => {
      const height = (v.y + 1) / 2 // 0 at the bottom, 1 at the top
      const taper = 1 - 0.5 * height * height
      v.x *= taper
      v.z *= taper
      if (v.y < -0.55) v.y = -0.55 + (v.y + 0.55) * 0.3
      if (v.x < 0) v.x *= 0.78 - 0.25 * Math.exp(-((v.y + 0.25) ** 2) / 0.12)
    }),
    material,
  )
  mesh.scale.set(0.075 * side, 0.115, 0.055)
  mesh.position.set(side * 0.078, 1.3, 0)
  mesh.rotation.z = side * 0.08
  return mesh
}

/** Half of the brain, with folds, flat on the inner side so the two halves leave a groove between them. */
function hemisphere(side: 1 | -1, material: THREE.Material) {
  const mesh = new THREE.Mesh(
    bentSphere(
      (v) => {
        // The folds: two wavy patterns crossing each other, pushed in and out of the surface.
        const fold = Math.sin(9 * v.y + 2.5 * Math.sin(7 * v.z + 1)) * Math.sin(8 * v.z + 2.5 * Math.sin(6 * v.y))
        v.multiplyScalar(1 + 0.07 * fold)
        if (v.x < 0) v.x *= 0.3
        if (v.y < 0) v.y *= 0.75
      },
      72,
      48,
    ),
    material,
  )
  mesh.scale.set(0.06 * side, 0.064, 0.088)
  mesh.position.set(side * 0.022, 1.68, -0.005)
  return mesh
}

const at = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z)

const ORGAN_SPECS: OrganSpec[] = [
  {
    code: 'HTMLE',
    color: '#9B7BEA',
    build: () => {
      // The brain: two folded halves, the ridged cerebellum tucked under the back, and the brainstem going down.
      const g = new THREE.Group()
      const m = organMaterial()
      g.add(hemisphere(-1, m), hemisphere(1, m))
      const cerebellum = new THREE.Mesh(
        bentSphere((v) => {
          v.multiplyScalar(1 + 0.05 * Math.sin(14 * v.y))
        }),
        organMaterial(-0.2),
      )
      cerebellum.scale.set(0.048, 0.026, 0.034)
      cerebellum.position.set(0, 1.612, -0.05)
      g.add(cerebellum)
      g.add(sweep([at(0, 1.63, -0.02), at(0, 1.59, -0.024), at(0, 1.555, -0.02)], [0.015, 0.013, 0.011], organMaterial(0.12), 12))
      return g
    },
  },
  {
    code: 'MICRO',
    color: '#4FB6E8',
    anchor: [-0.072, 1.31, 0], // the lung on the left, where its card is
    build: () => {
      // Two lungs, with the windpipe coming down between them and a branch into each.
      const g = new THREE.Group()
      const m = organMaterial()
      const airway = organMaterial(0.45)
      g.add(lung(-1, m), lung(1, m))
      g.add(sweep([at(0, 1.47), at(0, 1.42), at(0, 1.385)], [0.012, 0.012, 0.011], airway, 12))
      for (const side of [-1, 1]) {
        g.add(sweep([at(0, 1.392), at(side * 0.022, 1.366), at(side * 0.046, 1.335)], [0.0095, 0.008, 0.007], airway, 12))
      }
      return g
    },
  },
  {
    code: 'HEMA',
    color: '#E5484D',
    build: () => {
      // The heart: one smooth piece (wide on top with a dip in the middle, narrowing to the tip),
      // with the aorta arching over the top and the blue vessel to the lungs beside it.
      // Tilted so the tip points down and to her left, like a real heart.
      const g = new THREE.Group()
      const muscle = new THREE.Mesh(
        bentSphere((v) => {
          if (v.y < 0) {
            const narrow = 1 - 0.6 * Math.pow(-v.y, 1.6)
            v.x *= narrow
            v.z *= narrow
          } else {
            v.y *= 1 - 0.3 * Math.exp(-(v.x * v.x) / 0.06)
          }
        }),
        organMaterial(),
      )
      muscle.scale.set(0.043, 0.05, 0.032)
      g.add(muscle)
      const aorta = organMaterial(0.18)
      g.add(sweep([at(0.006, 0.026), at(0.004, 0.06), at(0.02, 0.077, -0.006), at(0.038, 0.064, -0.012)], [0.013, 0.012, 0.011, 0.0105], aorta, 20))
      g.add(ellipsoid([0.0105, 0.0105, 0.0105], [0.038, 0.064, -0.012], aorta))
      const toLungs = organMaterial(0, '#4FB6E8')
      g.add(sweep([at(-0.014, 0.024, 0.01), at(-0.02, 0.05, 0.008), at(-0.036, 0.06, 0.002)], [0.011, 0.0105, 0.0095], toLungs, 16))
      g.add(ellipsoid([0.0095, 0.0095, 0.0095], [-0.036, 0.06, 0.002], toLungs))
      g.rotation.z = 0.4
      g.position.set(0.028, 1.285, 0.052)
      return g
    },
  },
  {
    code: 'CC',
    color: '#B9773F',
    build: () => {
      // The liver: a wedge, thick on her right (viewer's left) and thin toward her left, with the groove
      // between its two lobes and the small green gallbladder peeking out underneath.
      const g = new THREE.Group()
      const liver = new THREE.Mesh(
        bentSphere(
          (v) => {
            v.multiplyScalar(1 - 0.1 * Math.exp(-((v.x - 0.2) ** 2) / 0.01))
            v.y *= 1 - 0.45 * v.x
            if (v.y < 0) v.y *= 0.75
          },
          56,
          32,
        ),
        organMaterial(),
      )
      liver.scale.set(0.11, 0.052, 0.062)
      liver.position.set(-0.04, 1.178, 0.02)
      liver.rotation.z = -0.12
      g.add(liver)
      const gallbladder = ellipsoid([0.013, 0.021, 0.013], [-0.062, 1.133, 0.062], organMaterial(0, '#6FA35A'))
      gallbladder.rotation.z = 0.35
      g.add(gallbladder)
      return g
    },
  },
  {
    code: 'CM',
    color: '#E8875A',
    anchor: [0.065, 1.07, -0.03], // the kidney on the right, where its card is
    build: () => {
      // The urinary system (this subject is mostly urinalysis): two kidneys, a thin tube from each, and the bladder.
      const g = new THREE.Group()
      const m = organMaterial()
      const tube = organMaterial(0.3)
      g.add(kidney([-0.065, 1.07, -0.03], -1, m), kidney([0.065, 1.07, -0.03], 1, m))
      for (const side of [-1, 1]) {
        g.add(sweep([at(side * 0.05, 1.07, -0.03), at(side * 0.03, 1.03, -0.028), at(side * 0.022, 0.97, -0.02), at(side * 0.012, 0.925, -0.005)], [0.006, 0.005, 0.005, 0.005], tube, 24, 10))
      }
      g.add(ellipsoid([0.034, 0.03, 0.03], [0, 0.912, 0], organMaterial(0, '#E9C46A')))
      return g
    },
  },
  {
    code: 'BBIS',
    color: '#E5484D',
    build: () => {
      // A blood drop at the inner elbow, where blood is drawn: one smooth piece, pointed on top.
      const drop = lathe(smoothProfile([[0, 0.058], [0.006, 0.04], [0.017, 0.012], [0.026, -0.012], [0.024, -0.03], [0.013, -0.041], [0, -0.043]]), organMaterial())
      drop.position.set(-0.255, 1.125, 0.06)
      return drop
    },
  },
]


/**
 * A smooth tube along a curve whose thickness changes along the way (thick at the shoulder, thin at the wrist).
 * One piece per limb, so there are no seams at the elbow or knee like there were with joined capsules.
 * `radii` are spread evenly from the first point to the last.
 */
function sweep(points: THREE.Vector3[], radii: number[], material: THREE.Material, tubular = 48, radial = 24) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  const frames = curve.computeFrenetFrames(tubular, false)
  const radiusAt = (t: number) => {
    const f = t * (radii.length - 1)
    const i = Math.min(Math.floor(f), radii.length - 2)
    const k = f - i
    return radii[i] + (radii[i + 1] - radii[i]) * (k * k * (3 - 2 * k)) // smooth, not stepped
  }
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const n = new THREE.Vector3()
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    const p = curve.getPointAt(t)
    const r = radiusAt(t)
    for (let j = 0; j <= radial; j++) {
      const angle = (j / radial) * Math.PI * 2
      n.set(0, 0, 0).addScaledVector(frames.normals[i], Math.cos(angle)).addScaledVector(frames.binormals[i], Math.sin(angle))
      positions.push(p.x + r * n.x, p.y + r * n.y, p.z + r * n.z)
      normals.push(n.x, n.y, n.z)
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = (i + 1) * (radial + 1) + j
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setIndex(indices)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return new THREE.Mesh(geometry, material)
}

// ---------- The cartoon pieces: ink outlines and little faces ----------

const INK = '#0E3445'
const SKIN = '#BFEFF8'
const inkLine = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })

/**
 * The ink outline of one mesh ("inverted hull"): a copy pushed out along its normals, drawn inside out in ink,
 * so only a thin rim shows around the edge. `worldThickness` is how thick the line is in the finished scene;
 * the mesh's own scale and `outerScale` (how much its organ was scaled up) are divided out, so tiny parts
 * (a vessel) and big ones (the liver) get the same line.
 */
function outlineOf(mesh: THREE.Mesh, worldThickness: number, outerScale = 1) {
  const s = mesh.scale
  const t = worldThickness / outerScale / ((Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z)) / 3)
  const geometry = mesh.geometry.clone()
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(i, position.getX(i) + normal.getX(i) * t, position.getY(i) + normal.getY(i) * t, position.getZ(i) + normal.getZ(i) * t)
  }
  const hull = new THREE.Mesh(geometry, inkLine)
  hull.position.copy(mesh.position)
  hull.rotation.copy(mesh.rotation)
  hull.scale.copy(mesh.scale)
  return hull
}

/** A mesh with its ink outline, as one group. */
function outlined(geometry: THREE.BufferGeometry, material: THREE.Material, thickness: number) {
  const mesh = new THREE.Mesh(geometry, material)
  return new THREE.Group().add(outlineOf(mesh, thickness), mesh)
}

const faceInk = new THREE.MeshBasicMaterial({ color: INK })
const faceShine = new THREE.MeshBasicMaterial({ color: '#FFFFFF' })
/** A little face (two eyes with a shine, and a smile), `size` wide, looking out along +z. */
function face(size: number) {
  const g = new THREE.Group()
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(size * 0.15, 16, 12), faceInk)
    eye.scale.z = 0.5
    eye.position.set(side * size * 0.3, size * 0.08, 0)
    const shine = new THREE.Mesh(new THREE.SphereGeometry(size * 0.05, 10, 8), faceShine)
    shine.position.set(side * size * 0.3 + size * 0.045, size * 0.13, size * 0.05)
    g.add(eye, shine)
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(size * 0.15, size * 0.032, 8, 24, Math.PI), faceInk)
  smile.rotation.z = Math.PI
  smile.position.set(0, -size * 0.1, 0)
  g.add(smile)
  return g
}

/** A five-point gold star (a passing subject gets one by its organ), with its ink outline. */
function star() {
  const shape = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.024 : 0.055
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false })
  geometry.computeVertexNormals()
  return outlined(geometry, new THREE.MeshToonMaterial({ color: '#F7B538', gradientMap: TOON_RAMP }), 0.008)
}

// ---------- The chibi body ----------

/** Where the shoulders and hips are: the arms and legs turn around these when she dances. */
const SHOULDER = (side: number) => new THREE.Vector3(side * 0.316, 1.16, 0)
const HIP = (side: number) => new THREE.Vector3(side * 0.15, 0.4, 0)
const FLOOR_Y = 0.02
type Limbs = { armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group }

/** A big round head on a small round body, with short arms and legs; every part outlined in ink. */
function buildSkin() {
  const body = new THREE.Group()
  const material = new THREE.MeshToonMaterial({ color: SKIN, gradientMap: TOON_RAMP })
  const capsule = (r: number, length: number) => new THREE.CapsuleGeometry(r, length, 12, 32)
  const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, at: THREE.Vector3, rotZ = 0, thickness = 0.026) => {
    const part = outlined(geometry, material, thickness)
    part.position.copy(at)
    part.rotation.z = rotZ
    parent.add(part)
  }
  add(body, new THREE.SphereGeometry(0.56, 56, 42), new THREE.Vector3(0, 1.9, 0), 0, 0.028) // head
  const torso = new THREE.CapsuleGeometry(0.38, 0.3, 12, 32)
  torso.scale(1, 1, 0.68)
  torso.computeVertexNormals()
  add(body, torso, new THREE.Vector3(0, 0.9, 0))

  // Each arm and leg hangs from a pivot at its shoulder or hip, so dancing can swing it.
  const pivot = (at: THREE.Vector3) => {
    const p = new THREE.Group()
    p.position.copy(at)
    body.add(p)
    return p
  }
  const limbs: Limbs = { armL: pivot(SHOULDER(-1)), armR: pivot(SHOULDER(1)), legL: pivot(HIP(-1)), legR: pivot(HIP(1)) }
  for (const [arm, side] of [[limbs.armL, -1], [limbs.armR, 1]] as const) {
    // the arm's middle, measured from the shoulder (it hangs down and out at 0.62 radians)
    add(arm, capsule(0.1, 0.24), new THREE.Vector3(side * 0.124, -0.18, 0), side * 0.62, 0.024)
  }
  for (const leg of [limbs.legL, limbs.legR]) add(leg, capsule(0.13, 0.12), new THREE.Vector3(0, -0.12, 0), 0, 0.024)
  body.userData.limbs = limbs
  return body
}

/**
 * Where each organ goes in the chibi body, and how big (its width, or its height for the tall ones).
 * BBIS (the blood drop) is held in the hand of the left arm (viewer's left).
 */
const PLACES: Record<string, { at: [number, number, number]; width?: number; height?: number }> = {
  HTMLE: { at: [0, 1.96, 0.14], width: 0.52 },
  MICRO: { at: [0, 1.21, 0.1], width: 0.58 },
  HEMA: { at: [0.08, 1.02, 0.24], height: 0.25 },
  CC: { at: [-0.05, 0.9, 0.2], width: 0.46 },
  CM: { at: [0, 0.57, 0.14], height: 0.42 },
  BBIS: { at: [-0.6, 0.76, 0.12], height: 0.22 },
}

/** The blood drop's outline, bottom to top (top to bottom faced it inward, and its ink outline covered it). */
const DROP_PROFILE: [number, number][] = [[0, -0.043], [0.013, -0.041], [0.024, -0.03], [0.026, -0.012], [0.017, 0.012], [0.006, 0.04], [0, 0.058]]

type Organ = {
  code: string
  color: THREE.Color
  /** placed in the body; grows a little when chosen */
  object: THREE.Group
  /** inside it: breathes (lungs) or beats (heart) */
  life: THREE.Group
  /** where its card line ends */
  anchor: THREE.Object3D
  /** the gold star shown while the subject is passing */
  star: THREE.Group
  /** about how big it is, for the gold ring around the chosen one */
  size: number
}

/** The six organs, made cartoon and fitted into the chibi body. */
function makeOrgans(): Organ[] {
  return ORGAN_SPECS.map((spec) => {
    const made = spec.build()
    if (spec.code === 'BBIS' && made instanceof THREE.Mesh) {
      made.geometry.dispose()
      made.geometry = new THREE.LatheGeometry(smoothProfile(DROP_PROFILE).map(([r, y]) => new THREE.Vector2(r, y)), 32)
    }
    // An empty group around it first, so every organ (even a bare mesh with its own position) moves the same way.
    const shape = new THREE.Group().add(made)
    shape.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(shape)
    const center = box.getCenter(new THREE.Vector3())
    const dims = box.getSize(new THREE.Vector3())
    const place = PLACES[spec.code]
    const fit = place.width ? place.width / dims.x : (place.height ?? 0.3) / dims.y

    // An ink outline on every part, and a face on the main ones (not on vessels, the airway, the gallbladder
    // or the bladder: those are lighter or have their own color). The brain gets one face for both halves.
    const meshes: THREE.Mesh[] = []
    made.traverse((o) => o instanceof THREE.Mesh && meshes.push(o))
    const faceSpots: THREE.Box3[] = []
    for (const mesh of meshes) {
      ;(mesh.parent ?? shape).add(outlineOf(mesh, 0.014, fit))
      const { tone, own } = (mesh.material as THREE.Material).userData as { tone: number; own: THREE.Color | null }
      if (tone === 0 && !own) faceSpots.push(new THREE.Box3().setFromObject(mesh))
    }
    shape.position.sub(center) // its middle at 0,0,0

    const fitted = new THREE.Group()
    fitted.scale.setScalar(fit)
    fitted.add(shape)
    for (const spot of spec.code === 'HTMLE' ? [box] : faceSpots) {
      const c = spot.getCenter(new THREE.Vector3()).sub(center)
      const size = spot.getSize(new THREE.Vector3())
      const f = face(Math.min(size.x, size.y) * (spec.code === 'HTMLE' ? 0.5 : 0.62))
      f.position.set(c.x, c.y - size.y * (spec.code === 'HTMLE' ? 0.12 : 0.02), spot.max.z - center.z + size.z * 0.02)
      fitted.add(f)
    }

    const life = new THREE.Group().add(fitted)
    const object = new THREE.Group().add(life)
    object.position.set(...place.at)
    object.userData.code = spec.code
    // The card line ends at the given spot (one lung, one kidney: on its card's side), else at the organ's middle.
    let anchor: THREE.Object3D = object
    if (spec.anchor) {
      anchor = new THREE.Object3D()
      anchor.position.set(...spec.anchor) // in the organ's own (adult-size) units, like its parts
      shape.add(anchor)
    }
    const goldStar = star()
    goldStar.position.set(dims.x * fit * 0.5, dims.y * fit * 0.45, 0.08)
    goldStar.visible = false
    object.add(goldStar)
    return { code: spec.code, color: new THREE.Color(spec.color), object, life, anchor, star: goldStar, size: Math.max(dims.x, dims.y) * fit }
  })
}

/** What the body says when she pokes it (not an organ). */
const POKE_WORDS = ['Ouch!', 'Hey!', 'That tickles!', 'Easy there!']
const DANCE_SECONDS = 3.4

/** True when the browser can draw 3D (WebGL). Some old phones or locked-down browsers can't. */
function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Not started: the organ shows in this grey until she answers something in its subject. */
const NOT_STARTED_GREY = new THREE.Color('#C5D3DA')
const WHITE = new THREE.Color('#FFFFFF')
const BLACK = new THREE.Color('#000000')
const GOLD = new THREE.Color('#F7B538')

/** Two layers, drawn one after the other: the skin first, then the organs on top of it (like an x-ray). */
const SKIN_LAYER = 1
const ORGAN_LAYER = 2
function putOnLayer(object: THREE.Object3D, layer: number) {
  object.traverse((o) => o.layers.set(layer))
}

export default function Body3D({ selectedCode, looks, onPick, onFrame, ref, className, celebrate = false, fallback }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [supported] = useState(canUseWebGL)
  // The little speech bubble when she pokes the body ("Ouch!"); id restarts its pop-in animation.
  const [bubble, setBubble] = useState<{ x: number; y: number; text: string; id: number } | null>(null)
  // The scene puts its "start dancing" function here, so the celebrate prop can reach it.
  const danceRef = useRef<(() => void) | null>(null)
  // The scene puts its turn function here; the page reaches it through `ref`.
  const rotateRef = useRef<((radians: number) => void) | null>(null)
  useImperativeHandle(ref, () => ({ rotateBy: (radians) => rotateRef.current?.(radians) }), [])
  // Latest props, read inside the animation loop without restarting the scene.
  const latest = useRef({ selectedCode, looks, onPick, onFrame })
  useEffect(() => {
    latest.current = { selectedCode, looks, onPick, onFrame }
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container || !supported) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return // WebGL said yes but still failed; the cards still work
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.autoClear = false // two passes per frame (skin, then organs), cleared by hand
    container.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = 'pan-y' // vertical swipes still scroll the page on phones
    renderer.domElement.style.cursor = 'grab'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20)
    // Flat, even light: the toon ramp turns it into the three tones.
    const ambient = new THREE.AmbientLight('#ffffff', 1.1)
    const key = new THREE.DirectionalLight('#ffffff', 2.2)
    key.position.set(-1.5, 2.5, 3)
    for (const light of [ambient, key]) {
      light.layers.enableAll()
      scene.add(light)
    }

    const figure = new THREE.Group()
    scene.add(figure)
    const skin = buildSkin()
    putOnLayer(skin, SKIN_LAYER)
    figure.add(skin)
    const limbs = skin.userData.limbs as Limbs

    const organs = makeOrgans()
    for (const o of organs) {
      // The blood drop is held in the left hand: it rides on that arm (so it swings when she dances).
      if (o.code === 'BBIS') {
        o.object.position.sub(SHOULDER(-1))
        limbs.armL.add(o.object)
      } else {
        figure.add(o.object)
      }
      putOnLayer(o.object, ORGAN_LAYER)
    }

    // A flat cartoon shadow under the feet.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.13, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2
    shadow.scale.set(1, 0.32, 1)
    shadow.position.y = FLOOR_Y
    shadow.layers.set(SKIN_LAYER)
    scene.add(shadow)

    // The chosen organ: a gold ring around it, always facing the camera.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 12, 48), new THREE.MeshBasicMaterial({ color: '#F7B538' }))
    ring.layers.set(ORGAN_LAYER)
    scene.add(ring)

    // ---- Rotation: drag to turn, with a little glide after letting go ----
    let angle = 0
    let target = 0
    let dragging = false
    let lastX = 0
    let downX = 0
    let velocity = 0
    rotateRef.current = (r) => (target += r)

    function onPointerDown(e: PointerEvent) {
      dragging = true
      lastX = downX = e.clientX
      velocity = 0
      renderer.domElement.setPointerCapture(e.pointerId)
      renderer.domElement.style.cursor = 'grabbing'
    }
    function onPointerMove(e: PointerEvent) {
      if (dragging) {
        const dx = e.clientX - lastX
        lastX = e.clientX
        velocity = dx * 0.012
        target += velocity
        angle = target
      } else {
        renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab'
      }
    }
    function onPointerUp(e: PointerEvent) {
      if (!dragging) return
      dragging = false
      renderer.domElement.style.cursor = 'grab'
      // Barely moved = a tap: select the organ under the finger, or else poke the body.
      if (Math.abs(e.clientX - downX) < 6) {
        const code = pick(e)
        if (code) latest.current.onPick(code)
        else poke()
      } else if (!reduceMotion) {
        target += velocity * 8 // glide
      }
    }

    // ---- Play: poke the body (not an organ) and it flinches and says "Ouch!"; three quick pokes and it dances ----
    let danceStart: number | null = null
    let flinchStart: number | null = null
    let pokeTimes: number[] = []
    let bubbleTimer = 0
    let bubbleId = 0
    const ripples: { mesh: THREE.Mesh; start: number }[] = []

    function startDance() {
      if (reduceMotion) return
      danceStart = clock.getElapsedTime()
    }
    danceRef.current = startDance

    function poke() {
      // (pick() just aimed the raycaster at the same spot)
      const hit = raycaster.intersectObject(skin, true)[0]
      if (!hit) return
      const now = performance.now()
      pokeTimes = [...pokeTimes.filter((when) => now - when < 900), now]
      if (pokeTimes.length >= 3) {
        pokeTimes = []
        startDance()
        return
      }
      if (!reduceMotion) {
        flinchStart = clock.getElapsedTime()
        // A small ink ring that spreads out from the spot she touched.
        const ripple = new THREE.Mesh(
          new THREE.RingGeometry(0.02, 0.032, 32),
          new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.7, depthTest: false, side: THREE.DoubleSide }),
        )
        ripple.layers.set(ORGAN_LAYER)
        ripple.position.copy(hit.point)
        ripple.lookAt(camera.position)
        scene.add(ripple)
        ripples.push({ mesh: ripple, start: clock.getElapsedTime() })
      }
      // The speech bubble, just above the spot (in the container's pixels).
      const onScreen = hit.point.clone().project(camera)
      setBubble({
        x: (onScreen.x * 0.5 + 0.5) * width,
        y: (-onScreen.y * 0.5 + 0.5) * height,
        text: POKE_WORDS[Math.floor(Math.random() * POKE_WORDS.length)],
        id: ++bubbleId,
      })
      window.clearTimeout(bubbleTimer)
      bubbleTimer = window.setTimeout(() => setBubble(null), 1100)
    }

    const raycaster = new THREE.Raycaster()
    raycaster.layers.enableAll() // it looks at both layers
    function pick(e: PointerEvent): string | null {
      const rect = renderer.domElement.getBoundingClientRect()
      const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      // Organs are drawn on top of the skin, so they win even when the skin is nearer.
      const hit = raycaster.intersectObjects(organs.map((o) => o.object), true)[0]
      let node: THREE.Object3D | null = hit?.object ?? null
      while (node && !node.userData.code) node = node.parent
      return node ? (node.userData.code as string) : null
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)

    // ---- Size: follow the container, and back the camera up until the whole body fits (tall or wide boxes) ----
    let width = 0
    let height = 0
    const bodyBox = new THREE.Box3().setFromObject(skin)
    function frameCamera() {
      const middle = (bodyBox.max.y + FLOOR_Y) / 2
      const tall = bodyBox.max.y - FLOOR_Y
      const wide = Math.max(bodyBox.max.x, -bodyBox.min.x, 0.75) * 2 // 0.75: the drop in the hand sticks out
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const distance = Math.max(tall / 2 / tanHalf, wide / 2 / (tanHalf * camera.aspect)) * 1.12
      camera.position.set(0, middle + 0.05, distance)
      camera.lookAt(0, middle - 0.02, 0)
    }
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width
      height = entry.contentRect.height
      renderer.setSize(width, height)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      frameCamera()
    })
    resize.observe(container)

    // ---- Animation loop (stops while the canvas is off screen) ----
    let visible = true
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting))
    io.observe(container)

    const clock = new THREE.Clock()
    const projected = new THREE.Vector3()
    const worldPos = new THREE.Vector3()
    const figurePos = new THREE.Vector3()
    const tint = new THREE.Color()
    let frame = 0
    function tick() {
      frame = requestAnimationFrame(tick)
      if (!visible || width === 0) return
      const t = clock.getElapsedTime()

      angle += (target - angle) * (reduceMotion ? 1 : 0.12)
      figure.rotation.y = angle

      // Dance and flinch: a pose for the joints and the whole figure, back to standing when done.
      let armL = 0
      let armR = 0
      let legL = 0
      let legR = 0
      let bounce = 0
      let sway = 0
      let tilt = 0
      let squash = 0
      if (danceStart !== null) {
        const u = t - danceStart
        if (u > DANCE_SECONDS) danceStart = null
        else {
          const ease = Math.min(1, u / 0.3, (DANCE_SECONDS - u) / 0.3) // fade in and out of the moves
          const beatPhase = u * Math.PI * 2 * 1.8 // about 108 beats a minute
          bounce = ease * 0.06 * Math.abs(Math.sin(beatPhase))
          sway = ease * 0.05 * Math.sin(beatPhase / 2)
          tilt = ease * 0.07 * Math.sin(beatPhase / 2)
          // Arms take turns going up; legs take turns with a small kick forward.
          armL = -ease * (0.6 + 0.6 * Math.sin(beatPhase))
          armR = ease * (0.6 - 0.6 * Math.sin(beatPhase))
          legL = -ease * 0.3 * Math.max(0, Math.sin(beatPhase / 2))
          legR = -ease * 0.3 * Math.max(0, -Math.sin(beatPhase / 2))
        }
      }
      if (flinchStart !== null) {
        const u = t - flinchStart
        if (u > 0.45) flinchStart = null
        else {
          const k = 1 - u / 0.45
          tilt += Math.sin(u * 60) * 0.035 * k // a quick shake
          squash = 0.03 * k // and a little "oof"
        }
      }
      // A slow breath for the whole body (about 4 seconds a breath), on top of any dance.
      const breathe = reduceMotion ? 0 : Math.sin((t * Math.PI * 2) / 4.2)
      figure.position.set(sway, bounce, 0)
      figure.rotation.z = tilt
      figure.scale.set(1 + squash * 0.6, 1 - squash + breathe * 0.008, 1 + squash * 0.6)
      limbs.armL.rotation.z = armL
      limbs.armR.rotation.z = armR
      limbs.legL.rotation.x = legL
      limbs.legR.rotation.x = legR

      // Poke ripples: spread out and fade, then go away.
      for (let i = ripples.length - 1; i >= 0; i--) {
        const { mesh, start } = ripples[i]
        const u = (t - start) / 0.55
        if (u >= 1) {
          scene.remove(mesh)
          mesh.geometry.dispose()
          ;(mesh.material as THREE.Material).dispose()
          ripples.splice(i, 1)
        } else {
          mesh.scale.setScalar(1 + 3 * u)
          ;(mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - u)
        }
      }

      const { selectedCode: selected, looks: organLooks, onFrame: report } = latest.current
      // A little life: the lungs breathe and the heart beats (about 70 a minute, "lub-dub").
      const breath = reduceMotion ? 0 : (breathe + 1) / 2
      const phase = (t % 0.86) / 0.86
      const beat = reduceMotion ? 0 : Math.exp(-(((phase - 0.05) / 0.045) ** 2)) + 0.6 * Math.exp(-(((phase - 0.22) / 0.045) ** 2))
      for (const o of organs) {
        if (o.code === 'MICRO') o.life.scale.set(1 + 0.04 * breath, 1 + 0.025 * breath, 1 + 0.04 * breath)
        if (o.code === 'HEMA') o.life.scale.setScalar(1 + 0.09 * beat)

        const isSelected = o.code === selected
        const pulse = isSelected && !reduceMotion ? 1 + Math.sin(t * 4) * 0.05 : 1
        o.object.scale.setScalar(isSelected ? 1.1 * pulse : 1)
        // Grey until she starts the subject, then its own color; a passing subject gets a gold star and a warm glow.
        // (No look given, e.g. scores still loading: its color.)
        const look = organLooks?.[o.code] ?? 'color'
        o.star.visible = look === 'glow'
        if (o.star.visible && !reduceMotion) o.star.rotation.y = Math.sin(t * 2) * 0.5
        o.object.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshToonMaterial && child.material.userData.tone !== undefined) {
            // Each part starts from grey (not started), its own color, or the organ's color,
            // then goes a little lighter or darker (its tone).
            const { tone, own } = child.material.userData as { tone: number; own: THREE.Color | null }
            tint.copy(look === 'grey' ? NOT_STARTED_GREY : (own ?? o.color))
            if (tone > 0) tint.lerp(WHITE, tone * 0.8)
            else if (tone < 0) tint.lerp(BLACK, -tone)
            child.material.color.copy(tint)
            child.material.emissive.copy(GOLD)
            child.material.emissiveIntensity = look === 'glow' ? 0.12 : 0
          }
        })
      }

      // The gold ring around the chosen organ.
      const chosen = organs.find((o) => o.code === selected)
      ring.visible = chosen !== undefined
      figure.updateMatrixWorld()
      if (chosen) {
        chosen.object.getWorldPosition(worldPos)
        ring.position.copy(worldPos)
        ring.scale.setScalar(chosen.size * 0.62 * (reduceMotion ? 1 : 1 + Math.sin(t * 4) * 0.05))
        ring.quaternion.copy(camera.quaternion)
      }

      // Two passes: the skin, then the organs on top of it.
      renderer.clear()
      camera.layers.set(SKIN_LAYER)
      renderer.render(scene, camera)
      renderer.clearDepth()
      camera.layers.set(ORGAN_LAYER)
      renderer.render(scene, camera)

      if (report) {
        figure.getWorldPosition(figurePos)
        report(
          organs.map((o) => {
            o.anchor.getWorldPosition(worldPos)
            // Facing us when the organ is on the camera side of the body (kidneys sit a bit behind).
            const facing = worldPos.z - figurePos.z > -0.05
            projected.copy(worldPos).project(camera)
            return { code: o.code, x: (projected.x * 0.5 + 0.5) * width, y: (-projected.y * 0.5 + 0.5) * height, facing }
          }),
        )
      }
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(bubbleTimer)
      danceRef.current = null
      resize.disconnect()
      io.disconnect()
      rotateRef.current = null
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          const materials = Array.isArray(o.material) ? o.material : [o.material]
          materials.forEach((m) => m.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [supported])

  // Daily goal reached: a little dance, shortly after Home opens (Home makes sure it's once a day).
  useEffect(() => {
    if (!celebrate) return
    const id = window.setTimeout(() => danceRef.current?.(), 700)
    return () => window.clearTimeout(id)
  }, [celebrate])

  // No 3D on this device: the flat cartoon body instead (the page passes it in).
  if (!supported) return <>{fallback}</>
  return (
    // relative by default (for the "Ouch!" bubble); the page may make it absolute to fill its box (cn keeps the later one)
    <div ref={containerRef} className={cn('relative', className)} aria-hidden>
      {/* "Ouch!": pops up just above where she poked */}
      {bubble && (
        <span
          key={bubble.id}
          className="animate-in fade-in zoom-in-75 pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-full border-2 border-ink bg-card px-3 py-1 font-heading text-sm font-bold whitespace-nowrap text-primary-deep shadow-toon-sm duration-150"
          style={{ left: bubble.x, top: bubble.y - 10 }}
        >
          {bubble.text}
        </span>
      )}
    </div>
  )
}
