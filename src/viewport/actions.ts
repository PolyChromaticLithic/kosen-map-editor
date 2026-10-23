import { useData, findRow } from '../store/dataStore'
import { useUi } from '../store/uiStore'
import { inferEdgeDefaults } from '../domain/defaults'
import { placeShortLabel } from '../domain/labels'
import { primaryFloorplanOfFloor } from '../domain/lookup'

type Vec3 = { x: number; y: number; z: number }

/** 「場所を配置」: 主表示位置があれば移動、なければ作成 */
export function placeActivePlaceAt(p: Vec3) {
  const ui = useUi.getState()
  const data = useData.getState()
  const placeId = ui.activePlaceId
  if (placeId == null) {
    ui.notify('先に左の一覧から配置する場所を選んでください', 'warn')
    return
  }
  const place = data.lookup.places.get(placeId)
  if (!place) return
  const placeFp = primaryFloorplanOfFloor(data.lookup, place.floor_id)?.id ?? null
  if (placeFp !== ui.activeFloorplanId) {
    ui.notify(`「${placeShortLabel(data.lookup, place)}」は作業中の階と異なります。高さはその場所の階に合わせます`, 'warn')
  }
  placePlaceAt(placeId, p)
}

/** place の主表示位置を p に置く（無ければ作成）。高さは階の制約で上書きされる */
export function placePlaceAt(placeId: number, p: Vec3) {
  const ui = useUi.getState()
  const data = useData.getState()
  const existing = data.tables.place_locations.filter((l) => l.place_id === placeId)
  const primary = existing.find((l) => l.is_primary) ?? existing[0]
  if (primary) {
    data.update('place_locations', primary.id, { world_x: p.x, world_y: p.y, world_z: p.z })
    ui.select({ kind: 'location', id: primary.id })
  } else {
    const id = data.insert('place_locations', {
      place_id: placeId,
      world_x: p.x, world_y: p.y, world_z: p.z,
      floorplan_id: null, map_x: null, map_y: null,
      is_primary: true,
    })
    ui.select({ kind: 'location', id })
  }
  useUi.setState({ activePlaceId: placeId })
}

/** 「ノード追加」: 作業中の階に追加。connectFrom があればそこからエッジも張る */
export function addNodeAt(p: Vec3, connectFrom: number | null) {
  const ui = useUi.getState()
  const data = useData.getState()
  const fp = ui.activeFloorplanId != null ? data.lookup.floorplans.get(ui.activeFloorplanId) : undefined
  const id = data.insert('route_nodes', {
    code: null,
    name: null,
    node_type: fp ? ui.lastNodeType : ui.lastNodeType === 'hallway' ? 'outdoor' : ui.lastNodeType,
    world_x: p.x, world_y: p.y, world_z: p.z,
    floor_id: fp?.floor_id ?? null,
    is_active: true,
  })
  if (connectFrom != null) connectNodes(connectFrom, id)
  ui.select({ kind: 'node', id })
  return id
}

/**
 * 「ノード追加」でエッジ上をクリック: エッジを t (0〜1, from側から) の位置で分割し、間にノードを入れる。
 * 元のエッジは from→新ノード に縮め、新ノード→to を同じ属性で追加する。Undo 1回で戻せるようにまとめる。
 */
export function splitEdgeAt(edgeId: number, t: number) {
  const ui = useUi.getState()
  const before = useData.getState()
  const edge = findRow(before.tables, 'route_edges', edgeId)
  const a = edge && findRow(before.tables, 'route_nodes', edge.from_node_id)
  const b = edge && findRow(before.tables, 'route_nodes', edge.to_node_id)
  if (!edge || !a || !b) return null
  const lerp = (u: number, v: number) => u + (v - u) * t
  // 階をまたぐエッジ（階段など）は近い方の端点の階に置く
  const floorId = a.floor_id === b.floor_id ? a.floor_id : t < 0.5 ? a.floor_id : b.floor_id
  const { id: _id, created_at: _c, ...attrs } = edge
  const dist = edge.distance_m

  const history = useData.temporal.getState()
  history.pause()
  const data = useData.getState()
  const nodeId = data.insert('route_nodes', {
    code: null,
    name: null,
    node_type: floorId != null ? ui.lastNodeType : ui.lastNodeType === 'hallway' ? 'outdoor' : ui.lastNodeType,
    world_x: lerp(a.world_x, b.world_x), world_y: lerp(a.world_y, b.world_y), world_z: lerp(a.world_z, b.world_z),
    floor_id: floorId,
    is_active: true,
  })
  data.update('route_edges', edge.id, { to_node_id: nodeId, distance_m: dist != null ? dist * t : null })
  data.insert('route_edges', { ...attrs, from_node_id: nodeId, distance_m: dist != null ? dist * (1 - t) : null })
  const after = useData.getState().tables
  useData.setState({ tables: before.tables })
  history.resume()
  useData.setState({ tables: after })

  ui.select({ kind: 'node', id: nodeId })
  return nodeId
}

export function connectNodes(fromId: number, toId: number): number | null {
  const ui = useUi.getState()
  const data = useData.getState()
  if (fromId === toId) return null
  const dup = data.tables.route_edges.find(
    (e) => (e.from_node_id === fromId && e.to_node_id === toId) || (e.from_node_id === toId && e.to_node_id === fromId),
  )
  if (dup) {
    ui.notify('このノード間には既にエッジがあります', 'warn')
    return dup.id
  }
  const a = findRow(data.tables, 'route_nodes', fromId)
  const b = findRow(data.tables, 'route_nodes', toId)
  if (!a || !b) return null
  return data.insert('route_edges', { from_node_id: fromId, to_node_id: toId, ...inferEdgeDefaults(a, b) })
}

/** 「エッジ追加」ツールでノードをクリック */
export function edgeToolClickNode(nodeId: number) {
  const ui = useUi.getState()
  if (ui.edgeFrom == null || ui.edgeFrom === nodeId) {
    useUi.setState({ edgeFrom: nodeId, selection: { kind: 'node', id: nodeId } })
    return
  }
  const id = connectNodes(ui.edgeFrom, nodeId)
  // 連続して張れるよう終点を次の始点にする
  useUi.setState({ edgeFrom: nodeId, selection: id != null ? { kind: 'edge', id } : ui.selection })
}

/** 「入口紐付け」ツールでノードをクリック */
export function linkAccessNode(nodeId: number) {
  const ui = useUi.getState()
  const data = useData.getState()
  const placeId = ui.activePlaceId
  if (placeId == null) {
    ui.notify('先に左の一覧から場所を選んでください', 'warn')
    return
  }
  const existing = data.tables.place_access_nodes.filter((a) => a.place_id === placeId)
  const dup = existing.find((a) => a.route_node_id === nodeId)
  if (dup) {
    ui.select({ kind: 'access', id: dup.id })
    return
  }
  const id = data.insert('place_access_nodes', {
    place_id: placeId,
    route_node_id: nodeId,
    access_type: 'entrance',
    is_primary: existing.length === 0,
    wheelchair_accessible: true,
    note: null,
  })
  ui.select({ kind: 'access', id })
  ui.notify('入口ノードを紐付けました')
}

export function deleteSelection() {
  const ui = useUi.getState()
  const data = useData.getState()
  const s = ui.selection
  if (!s) return
  const table = (
    { location: 'place_locations', node: 'route_nodes', edge: 'route_edges', access: 'place_access_nodes' } as const
  )[s.kind as 'location' | 'node' | 'edge' | 'access']
  if (!table) return
  data.remove(table, [s.id])
  ui.select(null)
}
