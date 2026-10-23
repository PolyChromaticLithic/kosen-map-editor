import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGizmoContext } from '@react-three/drei'
import * as THREE from 'three'
import { useUi } from '../store/uiStore'

type Controls = { target: THREE.Vector3; update: () => void }

const FOV = 50

/** 注視点までの距離 d の透視投影と同じ見た目の大きさになる平行投影の zoom */
const zoomForDistance = (d: number, viewHeight: number) => viewHeight / (2 * d * Math.tan(THREE.MathUtils.degToRad(FOV) / 2))
const distanceForZoom = (zoom: number, viewHeight: number) => viewHeight / (2 * zoom * Math.tan(THREE.MathUtils.degToRad(FOV) / 2))

/* ---------------- Y軸まわりの90°回転 ---------------- */

let spinRequests = 0
/** 注視点を中心に、鉛直軸まわりに視点を90°回す（アニメーション） */
export function requestSpin90() {
  spinRequests++
}

const SPIN_SECONDS = 0.25

/** 真上から見ているか（CameraRig が毎フレーム更新。ギズモ内では主カメラを直接参照できないため） */
let topView = false
/** 視線が真下から3°以内なら真上からの視点とみなす（drei の視点移動は約2°手前で止まるため） */
const TOP_VIEW_DOT = Math.cos(THREE.MathUtils.degToRad(3))

/**
 * 透視投影／平行投影のカメラを切り替える。切替時は視点・注視点・見た目の大きさを引き継ぐ。
 * Y軸まわりの90°回転のアニメーションもここで行う。
 */
export function CameraRig() {
  const ortho = useUi((s) => s.orthographic)
  const set = useThree((s) => s.set)
  const get = useThree((s) => s.get)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const cams = useMemo(
    () => ({
      persp: new THREE.PerspectiveCamera(FOV, 1, 0.1, 10000),
      ortho: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000),
    }),
    [],
  )
  /** カメラを差し替えると MapControls が作り直されるので、その後に注視点を戻す */
  const pendingTarget = useRef<THREE.Vector3 | null>(null)

  useLayoutEffect(() => {
    const { camera: prev, controls: c, size } = get()
    const next = ortho ? cams.ortho : cams.persp
    if (prev === next) return
    const target = (c as unknown as Controls | null)?.target.clone() ?? new THREE.Vector3()

    next.quaternion.copy(prev.quaternion)
    next.up.copy(prev.up)
    next.near = (prev as THREE.PerspectiveCamera).near
    next.far = (prev as THREE.PerspectiveCamera).far
    const dir = prev.position.clone().sub(target)
    const dist = dir.length() || 1
    if (next instanceof THREE.OrthographicCamera) {
      next.position.copy(prev.position)
      next.left = -size.width / 2
      next.right = size.width / 2
      next.top = size.height / 2
      next.bottom = -size.height / 2
      next.zoom = prev instanceof THREE.OrthographicCamera ? prev.zoom : zoomForDistance(dist, size.height)
    } else {
      const d = prev instanceof THREE.OrthographicCamera ? distanceForZoom(prev.zoom, size.height) : dist
      next.position.copy(target).addScaledVector(dir.normalize(), d)
      next.aspect = size.width / size.height
      // 平行投影で大きく引いていた場合でも描画範囲に収める
      next.far = Math.max(next.far, d * 20)
    }
    next.updateProjectionMatrix()
    pendingTarget.current = target
    set({ camera: next })
  }, [ortho, cams, get, set])

  useEffect(() => {
    if (!controls || !pendingTarget.current) return
    controls.target.copy(pendingTarget.current)
    controls.update()
    pendingTarget.current = null
  }, [controls])

  /* Y軸まわりの回転 */
  const handled = useRef(0)
  const spin = useRef<{ from: number; to: number; phi: number; r: number; t: number } | null>(null)
  const forward = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, delta) => {
    const { camera } = get()
    topView = -camera.getWorldDirection(forward).y >= TOP_VIEW_DOT
    const c = get().controls as unknown as Controls | null
    if (!c) return
    if (spinRequests !== handled.current && !spin.current) {
      handled.current++
      const offset = camera.position.clone().sub(c.target)
      const r = offset.length()
      // 真上から見ているときも向きが決まるよう、画面の上方向から方位角を求める
      const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
      const theta = Math.atan2(-screenUp.x, -screenUp.z)
      const phi = Math.max(1e-3, Math.acos(THREE.MathUtils.clamp(offset.y / r, -1, 1)))
      spin.current = { from: theta, to: theta + Math.PI / 2, phi, r, t: 0 }
    }
    const s = spin.current
    if (!s) return
    s.t = Math.min(1, s.t + delta / SPIN_SECONDS)
    const k = 1 - (1 - s.t) ** 3
    const th = s.from + (s.to - s.from) * k
    camera.position.set(
      c.target.x + s.r * Math.sin(s.phi) * Math.sin(th),
      c.target.y + s.r * Math.cos(s.phi),
      c.target.z + s.r * Math.sin(s.phi) * Math.cos(th),
    )
    camera.up.set(0, 1, 0)
    camera.lookAt(c.target)
    c.update()
    if (s.t >= 1) spin.current = null
  })

  return null
}

/* ---------------- 右下の軸ギズモ ---------------- */

const AXES = [
  { dir: [1, 0, 0], color: '#ff2060', label: 'X' },
  { dir: [0, 1, 0], color: '#20df80', label: 'Y' },
  { dir: [0, 0, 1], color: '#2080ff', label: 'Z' },
  { dir: [-1, 0, 0], color: '#ff2060' },
  { dir: [0, -1, 0], color: '#20df80' },
  { dir: [0, 0, -1], color: '#2080ff' },
] as const

function headTexture(color: string, label?: string) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const g = canvas.getContext('2d')!
  g.beginPath()
  g.arc(32, 32, 16, 0, Math.PI * 2)
  g.fillStyle = color
  g.fill()
  if (label) {
    g.font = '18px Arial, sans-serif'
    g.textAlign = 'center'
    g.fillStyle = '#fff'
    g.fillText(label, 32, 39)
  }
  return new THREE.CanvasTexture(canvas)
}

/**
 * drei の GizmoViewport 相当。X/Z（と負方向）はその軸方向からの視点へ、
 * +Y は真上からの視点へ。既に真上からなら、押すたびに鉛直軸まわりに90°回す。
 * -Y（下から見上げる視点）は使わないので、これも真上からの視点にする。GizmoHelper の中に置く。
 */
export function ViewGizmo() {
  const { tweenCamera } = useGizmoContext()
  const textures = useMemo(() => AXES.map((a) => headTexture(a.color, 'label' in a ? a.label : undefined)), [])
  return (
    <group scale={40}>
      {AXES.slice(0, 3).map((a, i) => (
        <mesh key={i} position={[a.dir[0] * 0.4, a.dir[1] * 0.4, a.dir[2] * 0.4]} rotation={i === 1 ? [0, 0, Math.PI / 2] : i === 2 ? [0, -Math.PI / 2, 0] : [0, 0, 0]}>
          <boxGeometry args={[0.8, 0.05, 0.05]} />
          <meshBasicMaterial color={a.color} toneMapped={false} />
        </mesh>
      ))}
      {AXES.map((a, i) => (
        <sprite
          key={i}
          position={a.dir as unknown as [number, number, number]}
          scale={'label' in a ? 0.9 : 0.6}
          onPointerDown={(e) => {
            e.stopPropagation()
            if (a.dir[1] === 1 && topView) requestSpin90()
            else if (a.dir[1] !== 0) tweenCamera(new THREE.Vector3(0, 1, 0))
            else tweenCamera(new THREE.Vector3(...a.dir))
          }}
        >
          <spriteMaterial map={textures[i]} alphaTest={0.3} opacity={'label' in a ? 1 : 0.75} toneMapped={false} />
        </sprite>
      ))}
    </group>
  )
}
