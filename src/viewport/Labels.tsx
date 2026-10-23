import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useData } from '../store/dataStore'
import { useUi } from '../store/uiStore'
import { locationVisibility, nodeVisibility } from '../domain/visibility'
import { floorColors, floorLabel, sortedFloors } from '../domain/labels'
import type { Lookup } from '../domain/lookup'

interface Label {
  key: string
  text: string
  pos: THREE.Vector3
  cls: string
  /** true: pos の位置に点を打ち、ラベルは引き出し線で上に出す */
  anchored?: boolean
  /** 階の色（場所ラベルのみ） */
  color?: { bg: string; accent: string }
}

/** この距離 (m) までは等倍、それより遠いと距離に反比例して小さくする */
const FULL_SIZE_DIST = 40
const MIN_SCALE = 0.45

/** 表示中の場所ラベルが属する階（凡例用） */
function visibleLabelFloors(
  lk: Lookup,
  locations: ReturnType<typeof useData.getState>['tables']['place_locations'],
  active: number | null,
  other: 'show' | 'dim' | 'hide',
) {
  const floors = new Set<number | null>()
  for (const l of locations) {
    if (locationVisibility(lk, l, active, other) !== 'normal') continue
    floors.add(lk.places.get(l.place_id)?.floor_id ?? null)
  }
  return floors
}

/**
 * 3Dラベルを Canvas 外の DOM オーバーレイに描く。
 * drei の <Html> は要素ごとに React root を作り、大量に出し入れすると
 * React 19 でアンマウント競合エラーになるため、ここでは DOM を直接管理する。
 * 場所のラベルは名前だけにし、建物・階は色で示す（凡例は LabelLegend）。
 */
export function Labels({ container }: { container: React.RefObject<HTMLDivElement | null> }) {
  const locations = useData((s) => s.tables.place_locations)
  const nodes = useData((s) => s.tables.route_nodes)
  const lk = useData((s) => s.lookup)
  const active = useUi((s) => s.activeFloorplanId)
  const other = useUi((s) => s.otherFloors)
  const sel = useUi((s) => s.selection)
  const show = useUi((s) => s.showLabels)
  const { camera, size } = useThree()
  const els = useRef(new Map<string, HTMLDivElement>())

  const labels = useMemo<Label[]>(() => {
    if (!show) return []
    const out: Label[] = []
    for (const l of locations) {
      if (locationVisibility(lk, l, active, other) !== 'normal') continue
      const p = lk.places.get(l.place_id)
      const selected = sel?.kind === 'location' && sel.id === l.id
      out.push({
        key: `l${l.id}`,
        text: p ? p.name : `(不明な場所 ${l.place_id})`,
        pos: new THREE.Vector3(l.world_x, l.world_y, l.world_z),
        cls: `pin-label${selected ? ' sel' : ''}`,
        anchored: true,
        color: floorColors(lk, p?.floor_id ?? null),
      })
    }
    for (const n of nodes) {
      if (!(n.name || n.code) || nodeVisibility(lk, n, active, other) !== 'normal') continue
      out.push({ key: `n${n.id}`, text: n.name || n.code!, pos: new THREE.Vector3(n.world_x, n.world_y + 0.7, n.world_z), cls: 'label3d node' })
    }
    return out
  }, [locations, nodes, lk, active, other, sel, show])

  // DOM 要素の追加・更新・削除
  useEffect(() => {
    const root = container.current
    if (!root) return
    const keep = new Set(labels.map((l) => l.key))
    for (const [k, el] of els.current) {
      if (!keep.has(k)) {
        el.remove()
        els.current.delete(k)
      }
    }
    for (const l of labels) {
      let el = els.current.get(l.key)
      if (!el) {
        el = document.createElement('div')
        if (l.anchored) {
          for (const part of ['dot', 'stem', 'text']) {
            const s = document.createElement('span')
            s.className = part
            el.appendChild(s)
          }
        }
        root.appendChild(el)
        els.current.set(l.key, el)
      }
      el.className = l.cls
      if (l.anchored) {
        el.lastElementChild!.textContent = l.text
        el.style.setProperty('--floor-bg', l.color?.bg ?? '')
        el.style.setProperty('--floor-accent', l.color?.accent ?? '')
      } else el.textContent = l.text
    }
  }, [labels, container])

  useEffect(
    () => () => {
      for (const el of els.current.values()) el.remove()
      els.current.clear()
    },
    [],
  )

  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const perspective = camera instanceof THREE.PerspectiveCamera
    for (const l of labels) {
      const el = els.current.get(l.key)
      if (!el) continue
      v.copy(l.pos).project(camera)
      if (v.z > 1 || v.z < -1) {
        el.style.display = 'none'
        continue
      }
      el.style.display = ''
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      // 遠いラベルほど小さく（平行投影では奥行きで大きさが変わらないので等倍）
      const s = perspective ? THREE.MathUtils.clamp(FULL_SIZE_DIST / camera.position.distanceTo(l.pos), MIN_SCALE, 1) : 1
      el.style.transform = l.anchored
        ? `translate(${x}px, ${y}px) scale(${s.toFixed(3)})`
        : `translate(${x}px, ${y}px) scale(${s.toFixed(3)}) translate(-50%, -50%)`
      el.style.zIndex = String(Math.round((1 - v.z) * 100000))
    }
  })

  return null
}

/** 場所ラベルの色と階の対応（表示中の階だけ） */
export function LabelLegend() {
  const locations = useData((s) => s.tables.place_locations)
  const lk = useData((s) => s.lookup)
  const active = useUi((s) => s.activeFloorplanId)
  const other = useUi((s) => s.otherFloors)
  const show = useUi((s) => s.showLabels)
  const floors = useMemo(() => {
    if (!show) return []
    const set = visibleLabelFloors(lk, locations, active, other)
    const ordered: (number | null)[] = sortedFloors(lk).map((f) => f.id).filter((id) => set.has(id))
    if (set.has(null)) ordered.push(null)
    return ordered
  }, [lk, locations, active, other, show])
  if (floors.length === 0) return null
  return (
    <div className="label-legend">
      {floors.map((f) => {
        const c = floorColors(lk, f)
        return (
          <div key={f ?? 'outdoor'} className="legend-row">
            <i style={{ background: c.bg, borderColor: c.accent }} />
            {floorLabel(lk, f)}
          </div>
        )
      })}
    </div>
  )
}
