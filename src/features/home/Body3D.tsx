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
  onPick: (code: string) => void
  /** called every frame with the organ positions in CSS pixels, relative to the canvas */
  onFrame?: (anchors: OrganAnchor[]) => void
  /** gives the page a way to turn the body (the ‹ › buttons) */
  ref?: Ref<Body3DControls>
  className?: string
}

type OrganSpec = { code: string; color: string; build: () => THREE.Object3D }

function ellipsoid(radius: [number, number, number], position: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), material)
  mesh.scale.set(...radius)
  mesh.position.set(...position)
  return mesh
}

const ORGAN_SPECS: OrganSpec[] = [
  {
    code: 'HTMLE',
    color: '#9B7BEA',
    build: () => ellipsoid([0.085, 0.07, 0.095], [0, 1.66, -0.005], organMaterial('#9B7BEA')),
  },
  {
    code: 'MICRO',
    color: '#4FB6E8',
    build: () => {
      const g = new THREE.Group()
      const m = organMaterial('#4FB6E8')
      g.add(ellipsoid([0.058, 0.1, 0.055], [-0.07, 1.31, 0], m), ellipsoid([0.058, 0.1, 0.055], [0.07, 1.31, 0], m))
      return g
    },
  },
  {
    code: 'HEMA',
    color: '#E5484D',
    build: () => {
      const g = new THREE.Group()
      const m = organMaterial('#E5484D')
      // Two lobes and a point: a simple heart.
      g.add(ellipsoid([0.032, 0.032, 0.03], [0.012, 1.3, 0.05], m), ellipsoid([0.032, 0.032, 0.03], [0.05, 1.3, 0.05], m))
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.044, 0.07, 24), m)
      tip.rotation.z = Math.PI
      tip.position.set(0.031, 1.26, 0.05)
      g.add(tip)
      return g
    },
  },
  {
    code: 'CC',
    color: '#B9773F',
    build: () => {
      const liver = ellipsoid([0.1, 0.042, 0.06], [-0.055, 1.17, 0.02], organMaterial('#B9773F'))
      liver.rotation.z = -0.25
      return liver
    },
  },
  {
    code: 'CM',
    color: '#E8875A',
    build: () => {
      const g = new THREE.Group()
      const m = organMaterial('#E8875A')
      g.add(ellipsoid([0.03, 0.05, 0.028], [-0.065, 1.07, -0.03], m), ellipsoid([0.03, 0.05, 0.028], [0.065, 1.07, -0.03], m))
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

/** See-through "glass" skin: pale inside, a teal rim at the edges (stronger where the surface turns away). */
function skinMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
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
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
        vec3 color = mix(fillColor, rimColor, rim);
        gl_FragColor = vec4(color, 0.16 + rim * 0.7);
      }`,
  })
}

/** A capsule (rounded tube) from point a to point b. */
function limb(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, dir.length(), 8, 24), material)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return mesh
}

function buildSkin(material: THREE.Material) {
  const body = new THREE.Group()
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z)

  // Torso: a lathe (turned shape) from hips to shoulders, flattened front-to-back.
  const profile = [
    [0.0, 0.86], [0.12, 0.87], [0.165, 0.92], [0.17, 0.98], [0.155, 1.06], [0.145, 1.12],
    [0.155, 1.2], [0.172, 1.3], [0.19, 1.39], [0.18, 1.45], [0.12, 1.49], [0.05, 1.5], [0.0, 1.5],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), material)
  torso.scale.set(1, 1, 0.62)
  body.add(torso)

  // Neck and head
  body.add(limb(v(0, 1.47), v(0, 1.57), 0.05, material))
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 32), material)
  head.scale.set(0.105, 0.125, 0.115)
  head.position.set(0, 1.66, 0)
  body.add(head)

  for (const side of [-1, 1]) {
    // Shoulder, arm, hand
    body.add(limb(v(side * 0.16, 1.43), v(side * 0.205, 1.4), 0.05, material))
    body.add(limb(v(side * 0.215, 1.39), v(side * 0.25, 1.13, 0.01), 0.046, material))
    body.add(limb(v(side * 0.25, 1.13, 0.01), v(side * 0.28, 0.88, 0.03), 0.037, material))
    const hand = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material)
    hand.scale.set(0.03, 0.06, 0.018)
    hand.position.set(side * 0.29, 0.81, 0.035)
    body.add(hand)
    // Leg and foot
    body.add(limb(v(side * 0.085, 0.9), v(side * 0.095, 0.5, 0.01), 0.072, material))
    body.add(limb(v(side * 0.095, 0.5, 0.01), v(side * 0.1, 0.09, -0.01), 0.05, material))
    body.add(limb(v(side * 0.1, 0.04, -0.01), v(side * 0.105, 0.035, 0.09), 0.034, material))
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

export default function Body3D({ selectedCode, onPick, onFrame, ref, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [supported] = useState(canUseWebGL)
  // The scene puts its turn function here; the page reaches it through `ref`.
  const rotateRef = useRef<((radians: number) => void) | null>(null)
  useImperativeHandle(ref, () => ({ rotateBy: (radians) => rotateRef.current?.(radians) }), [])
  // Latest props, read inside the animation loop without restarting the scene.
  const latest = useRef({ selectedCode, onPick, onFrame })
  useEffect(() => {
    latest.current = { selectedCode, onPick, onFrame }
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

    scene.add(new THREE.HemisphereLight('#ffffff', '#9FC3D1', 1.6))
    const key = new THREE.DirectionalLight('#ffffff', 1.4)
    key.position.set(1.5, 2.5, 3)
    scene.add(key)

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
      return { code: spec.code, object, center }
    })
    // Skin is drawn after the organs so they show through it, in two passes:
    // 1) an invisible pass that only records the nearest surface, 2) the glass look on that surface only.
    // Without pass 1, every overlapping part (shoulder, elbow, hip) would show its own outline.
    const depthOnly = buildSkin(new THREE.MeshBasicMaterial({ colorWrite: false }))
    depthOnly.traverse((o) => (o.renderOrder = 1))
    figure.add(depthOnly)
    const skin = buildSkin(skinMaterial())
    skin.traverse((o) => (o.renderOrder = 2))
    figure.add(skin)

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

      const { selectedCode: selected, onFrame: report } = latest.current
      for (const o of organs) {
        const isSelected = o.code === selected
        const pulse = isSelected && !reduceMotion ? 1 + Math.sin(t * 4) * 0.06 : 1
        o.object.scale.setScalar(isSelected ? 1.12 * pulse : 1)
        o.object.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            // Organs stay solid (see-through organs would hide behind the skin's first pass); the chosen one glows.
            child.material.emissiveIntensity = isSelected ? 0.6 : 0.1
          }
        })
      }

      renderer.render(scene, camera)

      if (report) {
        figure.updateMatrixWorld()
        report(
          organs.map((o) => {
            worldPos.copy(o.center).applyMatrix4(figure.matrixWorld)
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
