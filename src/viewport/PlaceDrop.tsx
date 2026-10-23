import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useData } from '../store/dataStore'
import { useUi } from '../store/uiStore'
import { primaryFloorplanOfFloor } from '../domain/lookup'
import { placeShortLabel } from '../domain/labels'
import { placePlaceAt } from './actions'

/** 場所一覧からドラッグするときの dataTransfer の型 */
export const PLACE_MIME = 'application/x-kosen-place'

type Probe = (clientX: number, clientY: number, planeY: number | null) => THREE.Vector3 | null
let probe: Probe | null = null

/**
 * Canvas 内に置き、画面座標 → 3D座標の変換を Canvas 外（ドロップ処理）から使えるようにする。
 * planeY があればその高さの水平面、なければモデル表面（無ければ y=0 の面）と交差させる。
 */
export function DropProbe() {
  const get = useThree((s) => s.get)
  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    probe = (clientX, clientY, planeY) => {
      const { camera, gl } = get()
      const r = gl.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const plane = (y: number) => raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3())
      if (planeY != null) return plane(planeY)
      const model = useUi.getState().model
      const hit = model ? raycaster.intersectObject(model, true)[0] : undefined
      return hit ? hit.point.clone() : plane(0)
    }
    return () => {
      probe = null
    }
  }, [get])
  return null
}

/** 3Dビューへのドロップ: その場所の階の高さ（屋外ならモデル表面）に配置する */
export function dropPlaceAt(placeId: number, clientX: number, clientY: number) {
  const data = useData.getState()
  const place = data.lookup.places.get(placeId)
  if (!place || !probe) return
  const fp = primaryFloorplanOfFloor(data.lookup, place.floor_id)
  const p = probe(clientX, clientY, fp ? data.heights[fp.id] ?? null : null)
  if (!p) {
    useUi.getState().notify('配置できる位置ではありません（地平線より上など）', 'warn')
    return
  }
  // 配置した場所の階を作業階にして、結果が見えるようにする
  useUi.setState({ activeFloorplanId: fp?.id ?? null })
  placePlaceAt(placeId, p)
  useUi.getState().notify(`「${placeShortLabel(data.lookup, place)}」を配置しました`)
}
