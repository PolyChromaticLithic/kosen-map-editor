import type { RouteEdge, RouteNode } from '../schema/tables'

// 付録C「語彙セット未確定」のため初期値。projectStoreで編集可能にする。
export const DEFAULT_VOCAB = {
  node_type: ['hallway', 'junction', 'stairs', 'elevator', 'entrance', 'room_entrance', 'outdoor'],
  edge_type: ['hallway', 'outdoor_walkway', 'stairs', 'elevator', 'ramp', 'bridge', 'doorway'],
  access_type: ['entrance', 'main_entrance', 'side_entrance'],
  access_level: ['public', 'student', 'staff', 'restricted'],
}
export type Vocab = typeof DEFAULT_VOCAB

export const NODE_COLORS: Record<string, string> = {
  hallway: '#4f8cff',
  junction: '#7a5cff',
  stairs: '#ff8a3d',
  elevator: '#22c55e',
  entrance: '#e11d48',
  room_entrance: '#ec4899',
  outdoor: '#14b8a6',
}
export const nodeColor = (t: string) => NODE_COLORS[t] ?? '#94a3b8'

/** 2ノードの種別から新規エッジの属性を推測する（DDLのデフォルトをベースに） */
export function inferEdgeDefaults(a: RouteNode, b: RouteNode): Omit<RouteEdge, 'id' | 'from_node_id' | 'to_node_id' | 'created_at'> {
  const both = (t: string) => a.node_type === t && b.node_type === t
  const crossFloor = a.floor_id !== b.floor_id && a.floor_id != null && b.floor_id != null
  let edge_type = 'hallway'
  let wheelchair_accessible = true
  if (both('stairs')) {
    edge_type = 'stairs'
    wheelchair_accessible = false
  } else if (both('elevator')) {
    edge_type = 'elevator'
  } else if (a.floor_id == null && b.floor_id == null) {
    edge_type = 'outdoor_walkway'
  } else if (a.floor_id == null || b.floor_id == null) {
    edge_type = 'doorway'
  } else if (crossFloor) {
    edge_type = 'stairs'
    wheelchair_accessible = false
  }
  const is_indoor = a.floor_id != null && b.floor_id != null
  return {
    edge_type,
    is_bidirectional: true,
    distance_m: null,
    cost_multiplier: 1.0,
    extra_cost: 0,
    wheelchair_accessible,
    is_indoor,
    is_covered: is_indoor,
    slope_percent: null,
    min_width_m: null,
    access_level: 'public',
    is_active: true,
    note: null,
  }
}

export const DEFAULT_STORY_HEIGHT = 3.5
