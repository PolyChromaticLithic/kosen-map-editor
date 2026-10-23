import { useEffect, useMemo, useRef } from 'react'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { useData, findRow } from '../store/dataStore'
import { useUi } from '../store/uiStore'
import { constrainedYForLocation, constrainedYForNode } from '../domain/heights'
import { useThree } from '@react-three/fiber'
import { altDown, clearSnapGuide, snapToRef } from './snap'

type Target = { table: 'place_locations' | 'route_nodes'; id: number; x: number; y: number; z: number; lockedY: boolean }

/**
 * 選択中の location / node を移動するギズモ。
 * 階に属するものは Y 軸を出さず（高さは floorplan の高さに固定）、水平移動のみ。
 * ドラッグ中は履歴を止めてライブ更新し、離したときに1回分の履歴として確定する。
 */
export function Gizmo() {
  const tool = useUi((s) => s.tool)
  const sel = useUi((s) => s.selection)
  const tables = useData((s) => s.tables)
  const lk = useData((s) => s.lookup)
  const heights = useData((s) => s.heights)
  const { camera, size } = useThree()
  const proxy = useMemo(() => new THREE.Object3D(), [])
  const dragStart = useRef<THREE.Vector3 | null>(null)

  let target: Target | null = null
  if (tool === 'select' && sel?.kind === 'location') {
    const r = findRow(tables, 'place_locations', sel.id)
    if (r) target = { table: 'place_locations', id: r.id, x: r.world_x, y: r.world_y, z: r.world_z, lockedY: constrainedYForLocation(lk, heights, r) != null }
  } else if (tool === 'select' && sel?.kind === 'node') {
    const r = findRow(tables, 'route_nodes', sel.id)
    if (r) target = { table: 'route_nodes', id: r.id, x: r.world_x, y: r.world_y, z: r.world_z, lockedY: constrainedYForNode(lk, heights, r) != null }
  }

  useEffect(() => {
    if (target && !dragStart.current) proxy.position.set(target.x, target.y, target.z)
  })

  if (!target) return null
  const t = target
  const write = (p: THREE.Vector3) =>
    useData.getState().update(t.table, t.id, { world_x: p.x, world_y: p.y, world_z: p.z })

  return (
    <>
      <primitive object={proxy} />
      <TransformControls
        object={proxy}
        mode="translate"
        showY={!t.lockedY}
        size={0.8}
        onMouseDown={() => {
          dragStart.current = proxy.position.clone()
          useData.temporal.getState().pause()
        }}
        onObjectChange={() => {
          if (!dragStart.current) return
          snapToRef(proxy.position, { moving: t, lockedY: t.lockedY, camera, viewportHeight: size.height, disabled: altDown })
          write(proxy.position)
        }}
        onMouseUp={() => {
          const start = dragStart.current
          clearSnapGuide()
          if (!start) return
          const end = proxy.position.clone()
          write(start)
          useData.temporal.getState().resume()
          if (!end.equals(start)) write(end)
          dragStart.current = null
        }}
      />
    </>
  )
}
