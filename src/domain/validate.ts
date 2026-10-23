import type { EditableTable, TableName, Tables } from '../schema/tables'
import type { Lookup } from './lookup'

export type IssueLevel = 'error' | 'warn' | 'info'

export interface Issue {
  level: IssueLevel
  table: TableName
  id?: number
  message: string
  /** 参照先が消えた行（places差し替え等）。一括削除の対象 */
  orphan?: boolean
}

const inRange01 = (v: number | null) => v == null || (v >= 0 && v <= 1)

/**
 * 書き出し前の整合性チェック。
 * error: Supabaseの制約で取り込みが失敗する／仕様書11章違反
 * warn : 取り込めるが不完全
 * info : 作業残り（未配置など）
 */
export function validate(t: Tables, lk: Lookup, modelNodeNames: string[] | null): Issue[] {
  const issues: Issue[] = []
  const push = (level: IssueLevel, table: TableName, id: number | undefined, message: string, orphan = false) =>
    issues.push({ level, table, id, message, orphan })

  const nodeIds = new Set(t.route_nodes.map((n) => n.id))
  const nodeById = new Map(t.route_nodes.map((n) => [n.id, n]))

  // 主キー重複
  for (const table of ['place_locations', 'route_nodes', 'route_node_map_positions', 'route_edges', 'place_access_nodes'] as EditableTable[]) {
    const seen = new Set<number>()
    for (const r of t[table] as { id: number }[]) {
      if (seen.has(r.id)) push('error', table, r.id, `id ${r.id} が重複しています`)
      seen.add(r.id)
    }
  }

  // place_locations
  const primaryLoc = new Map<number, number>()
  const placesWithLoc = new Set<number>()
  for (const loc of t.place_locations) {
    const place = lk.places.get(loc.place_id)
    if (!place) {
      push('error', 'place_locations', loc.id, `place_id ${loc.place_id} の場所が存在しません`, true)
      continue
    }
    placesWithLoc.add(loc.place_id)
    if (![loc.world_x, loc.world_y, loc.world_z].every(Number.isFinite)) push('error', 'place_locations', loc.id, 'world座標が不正です')
    const hasFp = loc.floorplan_id != null
    const hasMap = loc.map_x != null && loc.map_y != null
    const anyMap = loc.map_x != null || loc.map_y != null
    if (hasFp !== hasMap || (anyMap && !hasMap)) push('error', 'place_locations', loc.id, 'floorplan_id と map_x/map_y は全て揃えるか全て空にしてください')
    if (!inRange01(loc.map_x) || !inRange01(loc.map_y)) push('error', 'place_locations', loc.id, 'map_x/map_y が0〜1の範囲外です')
    if (hasFp) {
      const fp = lk.floorplans.get(loc.floorplan_id!)
      if (!fp) push('error', 'place_locations', loc.id, `floorplan_id ${loc.floorplan_id} が存在しません`, true)
      else if (place.floor_id != null && fp.floor_id !== place.floor_id)
        push('error', 'place_locations', loc.id, `「${place.name}」の階と平面図「${fp.name}」の階が一致しません`)
    } else if (place.floor_id != null) {
      push('warn', 'place_locations', loc.id, `「${place.name}」は屋内ですが2D平面図上の位置が未設定です`)
    }
    if (loc.is_primary) {
      if (primaryLoc.has(loc.place_id)) push('error', 'place_locations', loc.id, `「${place.name}」の主表示位置(is_primary)が複数あります`)
      primaryLoc.set(loc.place_id, loc.id)
    }
  }

  // route_nodes
  const codes = new Map<string, number>()
  const degree = new Map<number, number>()
  for (const e of t.route_edges) {
    degree.set(e.from_node_id, (degree.get(e.from_node_id) ?? 0) + 1)
    degree.set(e.to_node_id, (degree.get(e.to_node_id) ?? 0) + 1)
  }
  for (const n of t.route_nodes) {
    if (n.floor_id != null && !lk.floors.has(n.floor_id)) push('error', 'route_nodes', n.id, `floor_id ${n.floor_id} が存在しません`, true)
    if (n.code) {
      if (codes.has(n.code)) push('error', 'route_nodes', n.id, `code「${n.code}」が重複しています`)
      codes.set(n.code, n.id)
    }
    if (!n.node_type) push('error', 'route_nodes', n.id, 'node_type が空です')
    if (!degree.get(n.id)) push('warn', 'route_nodes', n.id, `ノード ${n.name || n.code || '#' + n.id} はどのエッジにも接続されていません`)
  }

  // route_node_map_positions
  const mapPairs = new Set<string>()
  for (const m of t.route_node_map_positions) {
    const node = nodeById.get(m.route_node_id)
    const fp = lk.floorplans.get(m.floorplan_id)
    if (!node) push('error', 'route_node_map_positions', m.id, `route_node_id ${m.route_node_id} が存在しません`, true)
    if (!fp) push('error', 'route_node_map_positions', m.id, `floorplan_id ${m.floorplan_id} が存在しません`, true)
    if (!inRange01(m.map_x) || !inRange01(m.map_y)) push('error', 'route_node_map_positions', m.id, 'map_x/map_y が0〜1の範囲外です')
    const key = `${m.route_node_id}:${m.floorplan_id}`
    if (mapPairs.has(key)) push('error', 'route_node_map_positions', m.id, '同じノード・平面図の組み合わせが重複しています')
    mapPairs.add(key)
    if (node && fp && node.floor_id != null && node.floor_id !== fp.floor_id)
      push('warn', 'route_node_map_positions', m.id, `ノードの階と平面図「${fp.name}」の階が異なります`)
  }

  // route_edges
  const edgePairs = new Set<string>()
  for (const e of t.route_edges) {
    if (!nodeIds.has(e.from_node_id)) push('error', 'route_edges', e.id, `from_node_id ${e.from_node_id} が存在しません`, true)
    if (!nodeIds.has(e.to_node_id)) push('error', 'route_edges', e.id, `to_node_id ${e.to_node_id} が存在しません`, true)
    if (e.from_node_id === e.to_node_id) push('error', 'route_edges', e.id, '始点と終点が同じです')
    if (e.distance_m != null && !(e.distance_m >= 0)) push('error', 'route_edges', e.id, 'distance_m は0以上にしてください')
    if (!(e.cost_multiplier > 0)) push('error', 'route_edges', e.id, 'cost_multiplier は0より大きくしてください')
    if (!(e.extra_cost >= 0)) push('error', 'route_edges', e.id, 'extra_cost は0以上にしてください')
    if (e.min_width_m != null && !(e.min_width_m > 0)) push('error', 'route_edges', e.id, 'min_width_m は正の数にしてください')
    if (!e.edge_type) push('error', 'route_edges', e.id, 'edge_type が空です')
    if (!e.access_level) push('error', 'route_edges', e.id, 'access_level が空です')
    const key = [Math.min(e.from_node_id, e.to_node_id), Math.max(e.from_node_id, e.to_node_id)].join('-')
    if (edgePairs.has(key)) push('warn', 'route_edges', e.id, '同じノード間に複数のエッジがあります')
    edgePairs.add(key)
    if (e.edge_type === 'stairs' && e.wheelchair_accessible) push('warn', 'route_edges', e.id, '階段エッジが wheelchair_accessible=true になっています')
  }

  // place_access_nodes
  const accessPairs = new Set<string>()
  const primaryAccess = new Set<number>()
  const placesWithAccess = new Set<number>()
  for (const a of t.place_access_nodes) {
    const place = lk.places.get(a.place_id)
    if (!place) push('error', 'place_access_nodes', a.id, `place_id ${a.place_id} の場所が存在しません`, true)
    if (!nodeIds.has(a.route_node_id)) push('error', 'place_access_nodes', a.id, `route_node_id ${a.route_node_id} が存在しません`, true)
    placesWithAccess.add(a.place_id)
    const key = `${a.place_id}:${a.route_node_id}`
    if (accessPairs.has(key)) push('error', 'place_access_nodes', a.id, '同じ場所・ノードの組み合わせが重複しています')
    accessPairs.add(key)
    if (a.is_primary) {
      if (primaryAccess.has(a.place_id)) push('error', 'place_access_nodes', a.id, `「${place?.name ?? a.place_id}」の主入口(is_primary)が複数あります`)
      primaryAccess.add(a.place_id)
    }
  }

  // places（参照のみ）: 作業残り
  for (const p of lk.places.values()) {
    if (!p.is_active) continue
    if (p.floor_id != null && !lk.floors.has(p.floor_id)) push('warn', 'places', p.id, `「${p.name}」の floor_id ${p.floor_id} が floors にありません`)
    if (!placesWithLoc.has(p.id)) push('info', 'places', p.id, `「${p.name}」の表示位置が未配置です`)
    if (!placesWithAccess.has(p.id)) push('info', 'places', p.id, `「${p.name}」の入口ノードが未設定です`)
  }

  // buildings.model_object_name とGLBノード名
  if (modelNodeNames) {
    const names = new Set(modelNodeNames)
    for (const b of lk.buildings.values()) {
      if (b.model_object_name && !names.has(b.model_object_name))
        push('warn', 'buildings', b.id, `建物「${b.name}」の model_object_name「${b.model_object_name}」が3Dモデル内に見つかりません`)
    }
  }

  return issues
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error')
