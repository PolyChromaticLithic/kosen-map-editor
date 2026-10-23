import { create } from 'zustand'
import * as THREE from 'three'
import { useData, findRow } from '../store/dataStore'
import { useUi, type SnapRef } from '../store/uiStore'
import { placeShortLabel } from '../domain/labels'

export type Axis = 'x' | 'y' | 'z'

/** 動かしている行（スナップ対象かどうかの判定用） */
export type SnapTarget = { table: 'route_nodes' | 'place_locations'; id: number }

/** スナップ中のガイド表示用（ドラッグ中だけ値が入る） */
export const useSnapGuide = create<{ from: THREE.Vector3 | null; to: THREE.Vector3 | null; axes: Axis[] }>(() => ({
  from: null,
  to: null,
  axes: [],
}))

/** Alt の押下状態（ギズモのイベントには修飾キーが無いため自前で追う） */
export let altDown = false
if (typeof window !== 'undefined') {
  const track = (e: KeyboardEvent | PointerEvent) => (altDown = e.altKey)
  window.addEventListener('keydown', track)
  window.addEventListener('keyup', track)
  window.addEventListener('pointermove', track)
}

/** 画面上でこの距離 (px) 以内なら基準の座標に吸着する */
const SNAP_PX = 12

/** 点 p 付近で 1px が何 m に当たるか */
function worldPerPixel(camera: THREE.Camera, p: THREE.Vector3, viewportHeight: number) {
  if (camera instanceof THREE.PerspectiveCamera) {
    const dist = camera.position.distanceTo(p)
    return (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / viewportHeight
  }
  if (camera instanceof THREE.OrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / viewportHeight
  return 0.05
}

const refTable = (r: NonNullable<SnapRef>) => (r.kind === 'node' ? 'route_nodes' : 'place_locations')

/** 基準の位置（行が消えていれば null） */
export function snapRefPosition(r: SnapRef | null): THREE.Vector3 | null {
  if (!r) return null
  const row = findRow(useData.getState().tables, refTable(r), r.id)
  return row ? new THREE.Vector3(row.world_x, row.world_y, row.world_z) : null
}

/**
 * 移動中の位置 p を、基準（ノード／場所）の X/Y/Z のうち近い軸に揃える（p を書き換える）。
 * Y が階の高さに固定されているものは Y を対象にしない。Alt を押している間は無効。
 */
export function snapToRef(
  p: THREE.Vector3,
  opts: { moving: SnapTarget; lockedY: boolean; camera: THREE.Camera; viewportHeight: number; disabled?: boolean },
) {
  const ref = useUi.getState().snapRef
  const self = ref && refTable(ref) === opts.moving.table && ref.id === opts.moving.id
  const r = self || opts.disabled ? null : snapRefPosition(ref)
  if (!r) {
    clearSnapGuide()
    return
  }
  const tol = SNAP_PX * worldPerPixel(opts.camera, p, opts.viewportHeight)
  const axes: Axis[] = []
  for (const a of ['x', 'y', 'z'] as const) {
    if (a === 'y' && opts.lockedY) continue
    if (Math.abs(p[a] - r[a]) <= tol) {
      p[a] = r[a]
      axes.push(a)
    }
  }
  useSnapGuide.setState(axes.length ? { from: r, to: p.clone(), axes } : { from: null, to: null, axes: [] })
}

export function clearSnapGuide() {
  if (useSnapGuide.getState().from) useSnapGuide.setState({ from: null, to: null, axes: [] })
}

/** 右クリック: 基準の設定／解除（同じものをもう一度で解除） */
export function toggleSnapRef(ref: NonNullable<SnapRef>) {
  const ui = useUi.getState()
  const cur = ui.snapRef
  const next = cur && cur.kind === ref.kind && cur.id === ref.id ? null : ref
  useUi.setState({ snapRef: next })
  if (!next) return ui.notify('基準を解除しました')
  let name = `ノード #${next.id}`
  if (next.kind === 'location') {
    const { tables, lookup } = useData.getState()
    const loc = findRow(tables, 'place_locations', next.id)
    const place = loc && lookup.places.get(loc.place_id)
    name = place ? `「${placeShortLabel(lookup, place)}」` : `表示位置 #${next.id}`
  }
  ui.notify(`${name} を基準にしました（移動時にX/Y/Zへスナップ、Altで無効）`)
}
