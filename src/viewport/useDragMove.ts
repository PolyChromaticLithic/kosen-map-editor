import { useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useData, findRow } from '../store/dataStore'
import { clearSnapGuide, snapToRef, type SnapTarget } from './snap'

type Drag = { start: THREE.Vector3; plane: THREE.Plane; down: { x: number; y: number }; moved: boolean; lockedY: boolean }

/**
 * マーカー（ノードの球・場所のピン）をつかんで水平に動かすためのイベントハンドラ。
 * 高さは変えず、基準（ノード／場所）にスナップする。1回のドラッグを履歴1件にまとめる。
 */
export function useDragMove(opts: {
  target: SnapTarget
  pos: { x: number; y: number; z: number }
  /** ドラッグを始めてよいか（ツールや表示状態で判定） */
  canStart: () => boolean
  /** 高さが階に固定されているか */
  lockedY: () => boolean
  /** 動かし始めたときに呼ぶ（選択など） */
  onStart: () => void
}) {
  const { camera, size } = useThree()
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null
  const drag = useRef<Drag | null>(null)
  const { target, pos } = opts

  const write = (p: THREE.Vector3) => useData.getState().update(target.table, target.id, { world_x: p.x, world_y: p.y, world_z: p.z })

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || !opts.canStart()) return
    e.stopPropagation()
    ;(e.target as unknown as Element).setPointerCapture(e.pointerId)
    if (controls) controls.enabled = false
    drag.current = {
      start: new THREE.Vector3(pos.x, pos.y, pos.z),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -pos.y),
      down: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
      moved: false,
      lockedY: opts.lockedY(),
    }
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const g = drag.current
    if (!g) return
    e.stopPropagation()
    if (!g.moved) {
      // 4px 未満はクリック扱い
      if (Math.hypot(e.nativeEvent.clientX - g.down.x, e.nativeEvent.clientY - g.down.y) < 4) return
      g.moved = true
      useData.temporal.getState().pause()
      opts.onStart()
    }
    const p = e.ray.intersectPlane(g.plane, new THREE.Vector3())
    if (!p) return
    snapToRef(p, { moving: target, lockedY: g.lockedY, camera, viewportHeight: size.height, disabled: e.nativeEvent.altKey })
    write(p)
  }

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const g = drag.current
    if (!g) return
    drag.current = null
    ;(e.target as unknown as Element).releasePointerCapture(e.pointerId)
    if (controls) controls.enabled = true
    clearSnapGuide()
    if (!g.moved) return
    const r = findRow(useData.getState().tables, target.table, target.id)
    const end = r ? new THREE.Vector3(r.world_x, r.world_y, r.world_z) : g.start
    write(g.start)
    useData.temporal.getState().resume()
    if (!end.equals(g.start)) write(end)
  }

  return { onPointerDown, onPointerMove, onPointerUp }
}
