import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import * as THREE from 'three'

// A stylized see-through 3D body with the six "subject organs" inside.
// Built from simple shapes (no model file to download), so it stays light on mobile data.
// Units are roughly meters: the body is about 1.75 tall, facing the camera (+z).

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
  className?: string
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
function bentSphere(bend: (v: THREE.Vector3) => void) {
  const geometry = new THREE.SphereGeometry(1, 40, 28)
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

/** A kidney: a sphere pressed in on one side (the hilum, toward the spine). `side` 1 = her left (viewer's right). */
function kidney(position: [number, number, number], side: 1 | -1, material: THREE.Material) {
  const mesh = new THREE.Mesh(
    bentSphere((v) => {
      if (v.x < 0) v.x *= 1 - 0.5 * Math.exp(-(v.y * v.y) / 0.12)
    }),
    material,
  )
  // Mirrored for her right kidney, so both dents face the spine.
  mesh.scale.set(0.03 * side, 0.05, 0.026)
  mesh.position.set(...position)
  return mesh
}

/** One lung: narrow at the top, wide and rounded at the bottom, tilted so the tops lean in. */
function lung(x: number, material: THREE.Material) {
  const mesh = lathe(
    [[0, 0.11], [0.022, 0.1], [0.038, 0.075], [0.05, 0.035], [0.058, -0.01], [0.06, -0.05], [0.052, -0.085], [0.03, -0.1], [0, -0.103]],
    material,
  )
  mesh.scale.z = 0.8
  mesh.position.set(x, 1.31, 0)
  mesh.rotation.z = x < 0 ? -0.12 : 0.12
  return mesh
}

const ORGAN_SPECS: OrganSpec[] = [
  {
    code: 'HTMLE',
    color: '#9B7BEA',
    build: () => {
      // The brain: two hemispheres and the cerebellum tucked under the back.
      const g = new THREE.Group()
      const m = organMaterial('#9B7BEA')
      g.add(
        ellipsoid([0.043, 0.068, 0.09], [-0.044, 1.675, -0.005], m),
        ellipsoid([0.043, 0.068, 0.09], [0.044, 1.675, -0.005], m),
        ellipsoid([0.05, 0.028, 0.035], [0, 1.615, -0.055], m),
      )
      return g
    },
  },
  {
    code: 'MICRO',
    color: '#4FB6E8',
    anchor: [-0.072, 1.31, 0], // the lung on the left, where its card is
    build: () => {
      const g = new THREE.Group()
      const m = organMaterial('#4FB6E8')
      g.add(lung(-0.072, m), lung(0.072, m))
      return g
    },
  },
  {
    code: 'HEMA',
    color: '#E5484D',
    build: () => {
      // Two lobes and a point, tilted so the tip points down and to her left, like a real heart.
      const g = new THREE.Group()
      const m = organMaterial('#E5484D')
      g.add(ellipsoid([0.03, 0.03, 0.028], [-0.018, 0.012, 0], m), ellipsoid([0.03, 0.03, 0.028], [0.018, 0.012, 0], m))
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.065, 24), m)
      tip.rotation.z = Math.PI
      tip.position.set(0, -0.03, 0)
      g.add(tip)
      g.rotation.z = 0.45
      g.position.set(0.028, 1.29, 0.055)
      return g
    },
  },
  {
    code: 'CC',
    color: '#B9773F',
    build: () => {
      // The liver: a wedge, thick on her right (viewer's left) and thin toward her left.
      const liver = new THREE.Mesh(
        bentSphere((v) => {
          v.y *= 1 - 0.45 * v.x
        }),
        organMaterial('#B9773F'),
      )
      liver.scale.set(0.105, 0.045, 0.06)
      liver.position.set(-0.045, 1.175, 0.02)
      liver.rotation.z = -0.12
      return liver
    },
  },
  {
    code: 'CM',
    color: '#E8875A',
    anchor: [0.065, 1.07, -0.03], // the kidney on the right, where its card is
    build: () => {
      const g = new THREE.Group()
      const m = organMaterial('#E8875A')
      g.add(kidney([-0.065, 1.07, -0.03], -1, m), kidney([0.065, 1.07, -0.03], 1, m))
      return g
    },
  },
  {
    code: 'BBIS',
    color: '#E5484D',
    build: () => {
      // A blood drop at the inner elbow, where blood is drawn.
      const g = new THREE.Group()
      const m = organMaterial('#E5484D')
      g.add(ellipsoid([0.026, 0.026, 0.026], [-0.255, 1.12, 0.06], m))
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.023, 0.045, 24), m)
      tip.position.set(-0.255, 1.155, 0.06)
      g.add(tip)
      return g
    },
  },
]

function organMaterial(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, emissive: color, emissiveIntensity: 0.15 })
}

/**
 * See-through "glass" skin: pale inside with soft shading from one light (so it reads as round, not flat),
 * and a teal rim at the edges (stronger where the surface turns away).
 * Both sides are drawn, so no surface can disappear because of which way its triangles face.
 */
function skinMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      fillColor: { value: new THREE.Color('#BFE6F2') },
      rimColor: { value: new THREE.Color('#0B6382') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 fillColor;
      uniform vec3 rimColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(vNormal);
        float facing = abs(dot(n, normalize(vView)));
        float rim = pow(1.0 - facing, 2.2);
        // Soft light from the upper right, so the body has a lit side and a shaded side.
        float light = 0.8 + 0.2 * max(dot(n * sign(dot(n, vView)), normalize(vec3(0.5, 0.7, 0.6))), 0.0);
        vec3 color = mix(fillColor * light, rimColor, rim);
        gl_FragColor = vec4(color, 0.12 + rim * 0.72);
      }`,
  })
}

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

function buildSkin(material: THREE.Material) {
  const body = new THREE.Group()
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z)
  const ball = (radius: [number, number, number], position: THREE.Vector3) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), material)
    mesh.scale.set(...radius)
    mesh.position.copy(position)
    return mesh
  }

  // Torso: a turned shape from hips to shoulders (hips, waist, chest, shoulders), flattened front-to-back.
  const torso = lathe(
    [[0, 0.86], [0.1, 0.865], [0.15, 0.9], [0.165, 0.96], [0.155, 1.03], [0.14, 1.1], [0.145, 1.18], [0.16, 1.27], [0.175, 1.35], [0.18, 1.4], [0.165, 1.44], [0.12, 1.475], [0.06, 1.495], [0, 1.5]],
    material,
    48,
  )
  torso.scale.set(1, 1, 0.6)
  body.add(torso)

  // Neck and head
  body.add(sweep([v(0, 1.46), v(0, 1.52), v(0, 1.59)], [0.047, 0.044, 0.046], material, 8))
  body.add(ball([0.1, 0.12, 0.11], v(0, 1.665)))

  for (const side of [-1, 1]) {
    // Arm in one piece: from inside the shoulder, over the shoulder, down to the wrist; then the hand.
    body.add(
      sweep(
        [v(side * 0.11, 1.445), v(side * 0.185, 1.425), v(side * 0.225, 1.32, 0.005), v(side * 0.248, 1.13, 0.012), v(side * 0.265, 1.0, 0.022), v(side * 0.278, 0.875, 0.03)],
        [0.05, 0.053, 0.046, 0.039, 0.035, 0.029],
        material,
      ),
    )
    body.add(ball([0.029, 0.029, 0.029], v(side * 0.278, 0.875, 0.03))) // rounds off the wrist
    const hand = ball([0.028, 0.055, 0.017], v(side * 0.284, 0.82, 0.034))
    hand.rotation.z = side * 0.06
    body.add(hand)

    // Leg in one piece: hip to ankle, thick thigh, slimmer knee, calf, thin ankle; then the foot.
    body.add(
      sweep(
        [v(side * 0.085, 0.95), v(side * 0.095, 0.72, 0.01), v(side * 0.1, 0.5, 0.015), v(side * 0.1, 0.3), v(side * 0.103, 0.08, -0.01)],
        [0.078, 0.066, 0.05, 0.047, 0.034],
        material,
      ),
    )
    body.add(ball([0.034, 0.034, 0.034], v(side * 0.103, 0.08, -0.01))) // rounds off the ankle
    body.add(ball([0.038, 0.028, 0.085], v(side * 0.105, 0.035, 0.035)))
  }
  return body
}

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
const NOT_STARTED_GREY = new THREE.Color('#B8C4CE')

export default function Body3D({ selectedCode, looks, onPick, onFrame, ref, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [supported] = useState(canUseWebGL)
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
    container.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = 'pan-y' // vertical swipes still scroll the page on phones
    renderer.domElement.style.cursor = 'grab'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20)
    camera.position.set(0, 0.95, 4.1)
    camera.lookAt(0, 0.88, 0)

    scene.add(new THREE.HemisphereLight('#ffffff', '#9FC3D1', 1.5))
    const key = new THREE.DirectionalLight('#ffffff', 1.5)
    key.position.set(1.5, 2.5, 3)
    scene.add(key)
    // A soft light from behind, so the organs get a bright edge and look round.
    const back = new THREE.DirectionalLight('#BFE6F2', 0.9)
    back.position.set(-2, 1.5, -2.5)
    scene.add(back)

    const figure = new THREE.Group()
    scene.add(figure)

    const organs = ORGAN_SPECS.map((spec) => {
      const shape = spec.build()
      // Wrap each organ in a group placed at its middle, so it can grow and pulse in place
      // (and so the card line points at the middle of the organ).
      const center = new THREE.Box3().setFromObject(shape).getCenter(new THREE.Vector3())
      shape.position.sub(center)
      const object = new THREE.Group()
      object.position.copy(center)
      object.add(shape)
      object.userData.code = spec.code
      figure.add(object)
      const anchor = spec.anchor ? new THREE.Vector3(...spec.anchor) : center
      return { code: spec.code, object, center, anchor, color: new THREE.Color(spec.color) }
    })
    // Skin is drawn after the organs so they show through it, in two passes:
    // 1) an invisible pass that only records the nearest surface, 2) the glass look on that surface only.
    // Without pass 1, every overlapping part (shoulder, elbow, hip) would show its own outline.
    const depthOnly = buildSkin(new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }))
    depthOnly.traverse((o) => (o.renderOrder = 1))
    figure.add(depthOnly)
    const skin = buildSkin(skinMaterial())
    skin.traverse((o) => (o.renderOrder = 2))
    figure.add(skin)

    // A soft shadow under the feet, so the body stands on the floor instead of floating.
    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = shadowCanvas.height = 128
    const shadowPaint = shadowCanvas.getContext('2d')
    if (shadowPaint) {
      const gradient = shadowPaint.createRadialGradient(64, 64, 0, 64, 64, 64)
      gradient.addColorStop(0, 'rgba(7, 71, 94, 0.45)')
      gradient.addColorStop(1, 'rgba(7, 71, 94, 0)')
      shadowPaint.fillStyle = gradient
      shadowPaint.fillRect(0, 0, 128, 128)
    }
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.3), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.002
    scene.add(shadow)

    // Platform rings under the feet, like the stand in the picture.
    const ringMat = new THREE.MeshBasicMaterial({ color: '#0B6382', transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    for (const [inner, outer] of [[0.3, 0.31], [0.42, 0.425]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), ringMat)
      ring.rotation.x = -Math.PI / 2
      scene.add(ring)
    }

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
      // Barely moved = a tap: select the organ under the finger.
      if (Math.abs(e.clientX - downX) < 6) {
        const code = pick(e)
        if (code) latest.current.onPick(code)
      } else if (!reduceMotion) {
        target += velocity * 8 // glide
      }
    }

    const raycaster = new THREE.Raycaster()
    function pick(e: PointerEvent): string | null {
      const rect = renderer.domElement.getBoundingClientRect()
      const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(organs.map((o) => o.object), true)[0]
      let node: THREE.Object3D | null = hit?.object ?? null
      while (node && !node.userData.code) node = node.parent
      return node ? (node.userData.code as string) : null
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)

    // ---- Size: follow the container ----
    let width = 0
    let height = 0
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width
      height = entry.contentRect.height
      renderer.setSize(width, height)
      camera.aspect = width / Math.max(height, 1)
      // Narrow boxes (phones): back the camera up so the whole body fits.
      // (The body with arms is about 0.65 wide by 1.8 tall, so it fits down to a 0.4 width-to-height box.)
      camera.position.z = camera.aspect < 0.4 ? 4.1 * (0.4 / camera.aspect) : 4.1
      camera.updateProjectionMatrix()
    })
    resize.observe(container)

    // ---- Animation loop (stops while the canvas is off screen) ----
    let visible = true
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting))
    io.observe(container)

    const clock = new THREE.Clock()
    const projected = new THREE.Vector3()
    const worldPos = new THREE.Vector3()
    let frame = 0
    function tick() {
      frame = requestAnimationFrame(tick)
      if (!visible || width === 0) return
      const t = clock.getElapsedTime()

      angle += (target - angle) * (reduceMotion ? 1 : 0.12)
      figure.rotation.y = angle

      const { selectedCode: selected, looks: organLooks, onFrame: report } = latest.current
      // A little life: slow breathing (lungs, about 4 seconds a breath) and a soft heartbeat (about 70 a minute,
      // "lub-dub"). Applied to the shape inside each organ's group, so the chosen organ's grow-and-pulse still works.
      const breath = reduceMotion ? 0 : (Math.sin((t * Math.PI * 2) / 4.2) + 1) / 2
      const phase = (t % 0.86) / 0.86
      const beat = reduceMotion ? 0 : Math.exp(-(((phase - 0.05) / 0.045) ** 2)) + 0.6 * Math.exp(-(((phase - 0.22) / 0.045) ** 2))
      for (const o of organs) {
        const inner = o.object.children[0]
        if (o.code === 'MICRO') inner.scale.set(1 + 0.035 * breath, 1 + 0.02 * breath, 1 + 0.035 * breath)
        if (o.code === 'HEMA') inner.scale.setScalar(1 + 0.06 * beat)

        const isSelected = o.code === selected
        const pulse = isSelected && !reduceMotion ? 1 + Math.sin(t * 4) * 0.06 : 1
        o.object.scale.setScalar(isSelected ? 1.12 * pulse : 1)
        // Grey until she starts the subject, then its own color; a passing subject glows a little.
        // (No look given, e.g. scores still loading: its color.)
        const look = organLooks?.[o.code] ?? 'color'
        const shown = look === 'grey' ? NOT_STARTED_GREY : o.color
        o.object.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            // Organs stay solid (see-through organs would hide behind the skin's first pass); the chosen one glows most.
            child.material.color.copy(shown)
            child.material.emissive.copy(shown)
            child.material.emissiveIntensity = isSelected ? 0.6 : look === 'glow' ? 0.35 : 0.1
          }
        })
      }

      renderer.render(scene, camera)

      if (report) {
        figure.updateMatrixWorld()
        report(
          organs.map((o) => {
            worldPos.copy(o.anchor).applyMatrix4(figure.matrixWorld)
            // Facing us when the organ is on the camera side of the body (kidneys sit a bit behind).
            const facing = worldPos.z > -0.07
            projected.copy(worldPos).project(camera)
            return { code: o.code, x: (projected.x * 0.5 + 0.5) * width, y: (-projected.y * 0.5 + 0.5) * height, facing }
          }),
        )
      }
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
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
      shadowTexture.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [supported])

  return (
    <div ref={containerRef} className={className} aria-hidden>
      {!supported && <p className="grid h-full place-items-center p-4 text-center text-sm text-muted-foreground">The 3D body can’t be shown on this device. Use the subject cards instead.</p>}
    </div>
  )
}
