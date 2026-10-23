import { useEffect, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useUi } from '../store/uiStore'
import { useData } from '../store/dataStore'
import { PICK_PRIORITY_KEY } from './pick'

/** 屋内階で作業中、その階の床から上をこの高さで切る */
const CLIP_OFFSET = 1.6

export function ModelLayer({ onSurfaceClick }: { onSurfaceClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const model = useUi((s) => s.model)
  const clipAbove = useUi((s) => s.clipAbove)
  const translucent = useUi((s) => s.modelTranslucent)
  const activeFp = useUi((s) => s.activeFloorplanId)
  const height = useData((s) => (activeFp != null ? s.heights[activeFp] : undefined))
  const { gl, controls, get } = useThree()
  const fitted = useRef<THREE.Object3D | null>(null)

  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), [])

  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])

  // 階より上を断面表示
  useEffect(() => {
    if (!model) return
    const enabled = clipAbove && height != null
    clipPlane.constant = (height ?? 0) + CLIP_OFFSET
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        m.clippingPlanes = enabled ? [clipPlane] : null
        m.clipShadows = true
        m.transparent = translucent
        m.opacity = translucent ? 0.35 : 1
        m.depthWrite = !translucent
        m.needsUpdate = true
      }
    })
  }, [model, clipAbove, height, translucent, clipPlane])

  // モデル読み込み時にカメラを全体へ合わせる
  // 1つのモデルにつき1回だけ（平行投影の切替でカメラが変わっても合わせ直さない）
  useEffect(() => {
    if (!model || !controls || fitted.current === model) return
    fitted.current = model
    const box = new THREE.Box3().setFromObject(model)
    if (box.isEmpty()) return
    const { camera, size: view } = get()
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3()).length()
    camera.position.set(center.x + size * 0.4, center.y + size * 0.6, center.z + size * 0.6)
    camera.near = Math.max(0.05, size / 5000)
    camera.far = size * 20
    if (camera instanceof THREE.OrthographicCamera) camera.zoom = view.height / size
    camera.updateProjectionMatrix()
    const c = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null
    c?.target?.copy(center)
    c?.update?.()
  }, [model, controls, get])

  if (!model) return null
  return <primitive object={model} userData={{ ...model.userData, [PICK_PRIORITY_KEY]: 1 }} onClick={onSurfaceClick} />
}
