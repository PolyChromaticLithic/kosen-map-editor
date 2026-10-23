// campus_map_database_design.docx 付録A のDDLを列定義として写したもの。
// CSVの読み書き・型変換・列順はすべてここを参照する。

export type ColumnType = 'int' | 'float' | 'text' | 'bool' | 'timestamp'

export interface ColumnDef {
  name: string
  type: ColumnType
  nullable: boolean
}

const c = (name: string, type: ColumnType, nullable = false): ColumnDef => ({ name, type, nullable })

export const TABLES = {
  buildings: [
    c('id', 'int'), c('code', 'text', true), c('name', 'text'), c('reading', 'text', true),
    c('short_name', 'text', true), c('model_object_name', 'text', true), c('description', 'text', true),
    c('sort_order', 'int'), c('is_active', 'bool'), c('created_at', 'timestamp'), c('updated_at', 'timestamp'),
  ],
  floors: [
    c('id', 'int'), c('building_id', 'int'), c('level_no', 'int'), c('name', 'text'),
    c('sort_order', 'int'), c('is_active', 'bool'), c('created_at', 'timestamp'),
  ],
  floorplans: [
    c('id', 'int'), c('floor_id', 'int'), c('code', 'text', true), c('name', 'text'), c('asset_path', 'text'),
    c('viewbox_width', 'float', true), c('viewbox_height', 'float', true),
    c('sort_order', 'int'), c('is_active', 'bool'), c('created_at', 'timestamp'),
  ],
  places: [
    c('id', 'int'), c('name', 'text'), c('reading', 'text', true), c('place_type', 'text'),
    c('floor_id', 'int', true), c('room_number', 'text', true), c('description', 'text', true),
    c('access_level', 'text'), c('is_searchable', 'bool'), c('is_active', 'bool'),
    c('created_at', 'timestamp'), c('updated_at', 'timestamp'),
  ],
  place_aliases: [
    c('id', 'int'), c('place_id', 'int'), c('alias', 'text'), c('reading', 'text', true), c('created_at', 'timestamp'),
  ],
  place_locations: [
    c('id', 'int'), c('place_id', 'int'),
    c('world_x', 'float'), c('world_y', 'float'), c('world_z', 'float'),
    c('floorplan_id', 'int', true), c('map_x', 'float', true), c('map_y', 'float', true),
    c('is_primary', 'bool'), c('created_at', 'timestamp'),
  ],
  route_nodes: [
    c('id', 'int'), c('code', 'text', true), c('name', 'text', true), c('node_type', 'text'),
    c('world_x', 'float'), c('world_y', 'float'), c('world_z', 'float'),
    c('floor_id', 'int', true), c('is_active', 'bool'), c('created_at', 'timestamp'),
  ],
  route_node_map_positions: [
    c('id', 'int'), c('route_node_id', 'int'), c('floorplan_id', 'int'),
    c('map_x', 'float'), c('map_y', 'float'), c('created_at', 'timestamp'),
  ],
  route_edges: [
    c('id', 'int'), c('from_node_id', 'int'), c('to_node_id', 'int'), c('edge_type', 'text'),
    c('is_bidirectional', 'bool'), c('distance_m', 'float', true), c('cost_multiplier', 'float'),
    c('extra_cost', 'float'), c('wheelchair_accessible', 'bool'), c('is_indoor', 'bool'), c('is_covered', 'bool'),
    c('slope_percent', 'float', true), c('min_width_m', 'float', true), c('access_level', 'text'),
    c('is_active', 'bool'), c('note', 'text', true), c('created_at', 'timestamp'),
  ],
  place_access_nodes: [
    c('id', 'int'), c('place_id', 'int'), c('route_node_id', 'int'), c('access_type', 'text'),
    c('is_primary', 'bool'), c('wheelchair_accessible', 'bool'), c('note', 'text', true), c('created_at', 'timestamp'),
  ],
} satisfies Record<string, ColumnDef[]>

export type TableName = keyof typeof TABLES

/** CSVから読むだけのテーブル */
export const REFERENCE_TABLES = ['buildings', 'floors', 'floorplans', 'places', 'place_aliases'] as const
/** エディターで編集し書き出すテーブル（仕様書13章の投入順） */
export const EDITABLE_TABLES = [
  'place_locations',
  'route_nodes',
  'route_node_map_positions',
  'route_edges',
  'place_access_nodes',
] as const
export type EditableTable = (typeof EDITABLE_TABLES)[number]

export interface Building {
  id: number; code: string | null; name: string; reading: string | null; short_name: string | null
  model_object_name: string | null; description: string | null; sort_order: number; is_active: boolean
  created_at: string; updated_at: string
}
export interface Floor {
  id: number; building_id: number; level_no: number; name: string; sort_order: number
  is_active: boolean; created_at: string
}
export interface Floorplan {
  id: number; floor_id: number; code: string | null; name: string; asset_path: string
  viewbox_width: number | null; viewbox_height: number | null; sort_order: number; is_active: boolean
  created_at: string
}
export interface Place {
  id: number; name: string; reading: string | null; place_type: string; floor_id: number | null
  room_number: string | null; description: string | null; access_level: string; is_searchable: boolean
  is_active: boolean; created_at: string; updated_at: string
}
export interface PlaceAlias {
  id: number; place_id: number; alias: string; reading: string | null; created_at: string
}
export interface PlaceLocation {
  id: number; place_id: number; world_x: number; world_y: number; world_z: number
  floorplan_id: number | null; map_x: number | null; map_y: number | null; is_primary: boolean
  created_at: string
}
export interface RouteNode {
  id: number; code: string | null; name: string | null; node_type: string
  world_x: number; world_y: number; world_z: number; floor_id: number | null; is_active: boolean
  created_at: string
}
export interface RouteNodeMapPosition {
  id: number; route_node_id: number; floorplan_id: number; map_x: number; map_y: number; created_at: string
}
export interface RouteEdge {
  id: number; from_node_id: number; to_node_id: number; edge_type: string; is_bidirectional: boolean
  distance_m: number | null; cost_multiplier: number; extra_cost: number; wheelchair_accessible: boolean
  is_indoor: boolean; is_covered: boolean; slope_percent: number | null; min_width_m: number | null
  access_level: string; is_active: boolean; note: string | null; created_at: string
}
export interface PlaceAccessNode {
  id: number; place_id: number; route_node_id: number; access_type: string; is_primary: boolean
  wheelchair_accessible: boolean; note: string | null; created_at: string
}

export interface RowTypes {
  buildings: Building
  floors: Floor
  floorplans: Floorplan
  places: Place
  place_aliases: PlaceAlias
  place_locations: PlaceLocation
  route_nodes: RouteNode
  route_node_map_positions: RouteNodeMapPosition
  route_edges: RouteEdge
  place_access_nodes: PlaceAccessNode
}

export type Tables = { [K in TableName]: RowTypes[K][] }

export const emptyTables = (): Tables => ({
  buildings: [], floors: [], floorplans: [], places: [], place_aliases: [],
  place_locations: [], route_nodes: [], route_node_map_positions: [], route_edges: [], place_access_nodes: [],
})

export const TABLE_LABELS: Record<TableName, string> = {
  buildings: '建物', floors: '階', floorplans: '平面図', places: '場所', place_aliases: '別名',
  place_locations: '場所の表示位置', route_nodes: '経路ノード', route_node_map_positions: 'ノード2D位置',
  route_edges: '経路エッジ', place_access_nodes: '入口ノード',
}
