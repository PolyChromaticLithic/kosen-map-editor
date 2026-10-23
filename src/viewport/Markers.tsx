import { memo, useMemo, useState } from 'react'
import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useData } from '../store/dataStore'
import { constrainedYForLocation, constrainedYForNode } from '../domain/heights'
import { toggleSnapRef, useSnapGuide } from './snap'
import { useDragMove } from './useDragMove'
import { useUi } from '../store/uiStore'
import { locationVisibility, nodeVisibility, type Visibility } from '../domain/visibility'
import { nodeColor } from '../domain/defaults'
import { edgeToolClickNode, linkAccessNode, splitEdgeAt } from './actions'
import type { PlaceLocation, RouteEdge, RouteNode } from '../schema/tables'

const isClick = (e: ThreeEvent<MouseEvent>) => e.delta < 4
const opacityOf = (v: Visibility) => (v === 'dim' ? 0.18 : 1)

const pinGeo = new THREE.ConeGeometry(0.35, 1.2, 12).rotateX(Math.PI).translate(0, 0.6, 0)
const headGeo = new THREE.SphereGeometry(0.45, 16, 12).translate(0, 1.4, 0)
const nodeGeo = new THREE.SphereGeometry(0.3, 16, 12)
const refRingGeo = new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2)

/* ---------------- place_locations ---------------- */

const LocationPin = memo(function LocationPin(props: {
  loc: PlaceLocation; vis: Visibility; selected: boolean; active: boolean; isRef: boolean
}) {
  const { loc, vis, selected, active, isRef } = props
  const onTop = useUi((s) => s.markersOnTop)
  // ピンをつかんで水平移動（選択/場所を配置ツール）。基準にスナップ
  const dragHandlers = useDragMove({
    target: { table: 'place_locations', id: loc.id },
    pos: { x: loc.world_x, y: loc.world_y, z: loc.world_z },
    canStart: () => vis === 'normal' && ['select', 'place'].includes(useUi.getState().tool),
    lockedY: () => {
      const d = useData.getState()
      return constrainedYForLocation(d.lookup, d.heights, loc) != null
    },
    onStart: () => useUi.setState({ selection: { kind: 'location', id: loc.id }, activePlaceId: loc.place_id }),
  })
  if (vis === 'hidden') return null
  const color = selected ? '#facc15' : active ? '#fb923c' : loc.is_primary ? '#ef4444' : '#f87171'
  const op = opacityOf(vis)
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isClick(e)) return
    e.stopPropagation()
    const ui = useUi.getState()
    if (ui.tool === 'select' || ui.tool === 'place' || ui.tool === 'access') {
      useUi.setState({ selection: { kind: 'location', id: loc.id }, activePlaceId: loc.place_id })
    }
  }
  const onContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    toggleSnapRef({ kind: 'location', id: loc.id })
  }
  const handlers = { onClick, onContextMenu, ...dragHandlers }
  return (
    <group position={[loc.world_x, loc.world_y, loc.world_z]}>
      {isRef && <RefRing opacity={op} />}
      <mesh geometry={pinGeo} {...handlers} renderOrder={2}>
        <meshStandardMaterial color={color} transparent opacity={op} depthTest={vis !== 'dim' && !onTop} />
      </mesh>
      <mesh geometry={headGeo} {...handlers} renderOrder={2}>
        <meshStandardMaterial color={color} transparent opacity={op} depthTest={vis !== 'dim' && !onTop} />
      </mesh>
    </group>
  )
})

/** スナップの基準を示す輪 */
function RefRing({ opacity }: { opacity: number }) {
  return (
    <mesh geometry={refRingGeo} renderOrder={3} raycast={() => null}>
      <meshBasicMaterial color="#e879f9" transparent opacity={opacity} depthTest={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

export function LocationMarkers() {
  const locations = useData((s) => s.tables.place_locations)
  const lk = useData((s) => s.lookup)
  const active = useUi((s) => s.activeFloorplanId)
  const other = useUi((s) => s.otherFloors)
  const sel = useUi((s) => s.selection)
  const activePlaceId = useUi((s) => s.activePlaceId)
  const snapRef = useUi((s) => s.snapRef)
  return (
    <group>
      {locations.map((loc) => (
        <LocationPin
          key={loc.id}
          loc={loc}
          vis={locationVisibility(lk, loc, active, other)}
          selected={sel?.kind === 'location' && sel.id === loc.id}
          active={activePlaceId === loc.place_id}
          isRef={snapRef?.kind === 'location' && snapRef.id === loc.id}
        />
      ))}
    </group>
  )
}

/* ---------------- route_nodes ---------------- */

const NodeBall = memo(function NodeBall(props: {
  node: RouteNode; vis: Visibility; selected: boolean; edgeFrom: boolean; isRef: boolean
}) {
  const { node, vis, selected, edgeFrom, isRef } = props
  const onTop = useUi((s) => s.markersOnTop)
  // 球をつかんで水平移動（選択/ノード追加ツール）。基準にスナップ
  const dragHandlers = useDragMove({
    target: { table: 'route_nodes', id: node.id },
    pos: { x: node.world_x, y: node.world_y, z: node.world_z },
    canStart: () => vis === 'normal' && ['select', 'node'].includes(useUi.getState().tool),
    lockedY: () => {
      const d = useData.getState()
      return constrainedYForNode(d.lookup, d.heights, node) != null
    },
    onStart: () => useUi.getState().select({ kind: 'node', id: node.id }),
  })
  if (vis === 'hidden') return null
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isClick(e)) return
    e.stopPropagation()
    const ui = useUi.getState()
    if (ui.tool === 'edge') edgeToolClickNode(node.id)
    else if (ui.tool === 'access') linkAccessNode(node.id)
    else ui.select({ kind: 'node', id: node.id })
  }
  const onContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    toggleSnapRef({ kind: 'node', id: node.id })
  }

  const color = selected ? '#facc15' : edgeFrom ? '#f97316' : nodeColor(node.node_type)
  return (
    <group position={[node.world_x, node.world_y, node.world_z]}>
      {isRef && <RefRing opacity={opacityOf(vis)} />}
      <mesh
        geometry={nodeGeo}
        onClick={onClick}
        onContextMenu={onContextMenu}
        {...dragHandlers}
        scale={selected || edgeFrom ? 1.5 : 1}
        renderOrder={3}
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={node.is_active ? opacityOf(vis) : opacityOf(vis) * 0.4}
          depthTest={vis !== 'dim' && !onTop}
        />
      </mesh>
    </group>
  )
})

export function RouteNodes() {
  const nodes = useData((s) => s.tables.route_nodes)
  const lk = useData((s) => s.lookup)
  const active = useUi((s) => s.activeFloorplanId)
  const other = useUi((s) => s.otherFloors)
  const sel = useUi((s) => s.selection)
  const edgeFrom = useUi((s) => s.edgeFrom)
  const snapRef = useUi((s) => s.snapRef)
  return (
    <group>
      {nodes.map((n) => (
        <NodeBall
          key={n.id}
          node={n}
          vis={nodeVisibility(lk, n, active, other)}
          selected={sel?.kind === 'node' && sel.id === n.id}
          edgeFrom={edgeFrom === n.id}
          isRef={snapRef?.kind === 'node' && snapRef.id === n.id}
        />
      ))}
      <SnapGuide />
    </group>
  )
}

const AXIS_COLORS = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' } as const

/** 基準ノードにスナップしている間、基準ノードから移動中のノードへ軸の色で線を引く */
function SnapGuide() {
  const { from, to, axes } = useSnapGuide()
  if (!from || !to || axes.length === 0) return null
  const color = axes.length === 1 ? AXIS_COLORS[axes[0]] : '#e879f9'
  return <Line points={[from, to]} color={color} lineWidth={2} dashed dashSize={0.3} gapSize={0.2} depthTest={false} raycast={() => null} />
}

/* ---------------- route_edges ---------------- */

/** エッジ上に挿入するとき、端点からこれ以上離す (m) */
const SPLIT_MARGIN = 0.3

/** カーソル位置 p をエッジ a→b 上に射影した割合 t。端に近すぎる・短すぎるエッジは null */
function splitParam(pa: THREE.Vector3, pb: THREE.Vector3, p: THREE.Vector3): number | null {
  const ab = pb.clone().sub(pa)
  const len = ab.length()
  if (len < SPLIT_MARGIN * 2) return null
  const t = p.clone().sub(pa).dot(ab) / (len * len)
  const m = SPLIT_MARGIN / len
  return Math.min(1 - m, Math.max(m, t))
}

type EdgeHover = { edgeId: number; t: number; point: THREE.Vector3 } | null

const EdgeLine = memo(function EdgeLine(props: {
  edge: RouteEdge; a: RouteNode; b: RouteNode; vis: Visibility; selected: boolean
  /** ノード追加ツール中: 当たり判定を太くし、ホバー位置を通知する */
  splitMode: boolean
  onHover: (h: EdgeHover) => void
}) {
  const { edge, a, b, vis, selected, splitMode, onHover } = props
  const onTop = useUi((s) => s.markersOnTop)
  const pa = useMemo(() => new THREE.Vector3(a.world_x, a.world_y, a.world_z), [a.world_x, a.world_y, a.world_z])
  const pb = useMemo(() => new THREE.Vector3(b.world_x, b.world_y, b.world_z), [b.world_x, b.world_y, b.world_z])
  if (vis === 'hidden') return null
  const color = selected ? '#facc15' : !edge.is_active ? '#64748b' : edge.wheelchair_accessible ? '#38bdf8' : '#f97316'
  const canSplit = splitMode && vis === 'normal'
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isClick(e)) return
    e.stopPropagation()
    if (canSplit) {
      const t = splitParam(pa, pb, e.point)
      if (t != null) {
        splitEdgeAt(edge.id, t)
        onHover(null)
      }
      return
    }
    useUi.getState().select({ kind: 'edge', id: edge.id })
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!canSplit) return
    e.stopPropagation()
    const t = splitParam(pa, pb, e.point)
    onHover(t != null ? { edgeId: edge.id, t, point: pa.clone().lerp(pb, t) } : null)
  }
  const mid = pa.clone().lerp(pb, 0.5)
  const dir = pb.clone().sub(pa).normalize()
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  return (
    <group>
      <Line
        points={[pa, pb]}
        color={color}
        lineWidth={selected ? 5 : 3}
        dashed={!edge.wheelchair_accessible}
        dashSize={0.4}
        gapSize={0.25}
        transparent
        opacity={opacityOf(vis)}
        depthTest={vis !== 'dim' && !onTop}
        onClick={canSplit ? undefined : onClick}
      />
      {canSplit && (
        // カーソルを近づけるだけで反応するよう、見えない太い線で当たり判定を取る
        <Line
          points={[pa, pb]}
          lineWidth={18}
          transparent
          opacity={0}
          depthWrite={false}
          onClick={onClick}
          onPointerMove={onMove}
          onPointerOut={() => onHover(null)}
        />
      )}
      {!edge.is_bidirectional && (
        <mesh position={mid} quaternion={quat} onClick={onClick}>
          <coneGeometry args={[0.25, 0.7, 10]} />
          <meshBasicMaterial color={color} transparent opacity={opacityOf(vis)} depthTest={vis !== 'dim' && !onTop} />
        </mesh>
      )}
    </group>
  )
})

export function RouteEdges() {
  const edges = useData((s) => s.tables.route_edges)
  const nodes = useData((s) => s.tables.route_nodes)
  const lk = useData((s) => s.lookup)
  const active = useUi((s) => s.activeFloorplanId)
  const other = useUi((s) => s.otherFloors)
  const sel = useUi((s) => s.selection)
  const splitMode = useUi((s) => s.tool === 'node')
  const [hover, setHover] = useState<EdgeHover>(null)
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const rank = { normal: 0, dim: 1, hidden: 2 } as const
  return (
    <group>
      {splitMode && hover && (
        // 挿入位置のプレビュー
        <mesh geometry={nodeGeo} position={hover.point} scale={1.3} renderOrder={4} raycast={() => null}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthTest={false} />
        </mesh>
      )}
      {edges.map((e) => {
        const a = byId.get(e.from_node_id)
        const b = byId.get(e.to_node_id)
        if (!a || !b) return null
        const va = nodeVisibility(lk, a, active, other)
        const vb = nodeVisibility(lk, b, active, other)
        // 階をまたぐエッジは、どちらかが表示されていれば見せる
        const vis = rank[va] <= rank[vb] ? va : vb
        return (
          <EdgeLine
            key={e.id}
            edge={e}
            a={a}
            b={b}
            vis={vis}
            selected={sel?.kind === 'edge' && sel.id === e.id}
            splitMode={splitMode}
            onHover={setHover}
          />
        )
      })}
    </group>
  )
}

/* ---------------- place_access_nodes ---------------- */

export function AccessLinks() {
  const access = useData((s) => s.tables.place_access_nodes)
  const nodes = useData((s) => s.tables.route_nodes)
  const locations = useData((s) => s.tables.place_locations)
  const lk = useData((s) => s.lookup)
  const active = useUi((s) => s.activeFloorplanId)
  const other = useUi((s) => s.otherFloors)
  const activePlaceId = useUi((s) => s.activePlaceId)
  const sel = useUi((s) => s.selection)
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const rank = { normal: 0, dim: 1, hidden: 2 } as const
  const locByPlace = useMemo(() => {
    const m = new Map<number, PlaceLocation>()
    for (const l of locations) if (l.is_primary || !m.has(l.place_id)) m.set(l.place_id, l)
    return m
  }, [locations])
  return (
    <group>
      {access.map((a) => {
        const n = nodeById.get(a.route_node_id)
        const l = locByPlace.get(a.place_id)
        if (!n || !l) return null
        // 場所とノードのうち見えている方に合わせる（他の階のものは薄く／非表示）
        const vl = locationVisibility(lk, l, active, other)
        const vn = nodeVisibility(lk, n, active, other)
        const vis = rank[vl] <= rank[vn] ? vl : vn
        if (vis === 'hidden') return null
        const selected = sel?.kind === 'access' && sel.id === a.id
        const hot = selected || a.place_id === activePlaceId
        return (
          <Line
            key={a.id}
            points={[
              [l.world_x, l.world_y, l.world_z],
              [n.world_x, n.world_y, n.world_z],
            ]}
            color={selected ? '#facc15' : a.is_primary ? '#ec4899' : '#f9a8d4'}
            lineWidth={hot ? 3 : 1.5}
            dashed
            dashSize={0.2}
            gapSize={0.15}
            transparent
            opacity={vis === 'dim' ? 0.18 : hot ? 1 : 0.7}
            depthTest={false}
            onClick={(e) => {
              if (!isClick(e)) return
              e.stopPropagation()
              useUi.getState().select({ kind: 'access', id: a.id })
            }}
          />
        )
      })}
    </group>
  )
}
