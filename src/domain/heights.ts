import type { PlaceLocation, RouteNode, Tables } from '../schema/tables'
import { primaryFloorplanOfFloor, type Lookup } from './lookup'

/** floorplan_id -> world_y */
export type FloorplanHeights = Record<number, number>

/**
 * place_location が属する floorplan。
 * floorplan_id があればそれ、なければ places.floor_id の代表floorplan。
 * どちらもなければ屋外扱い（null）で高さ制約なし。
 */
export function locationFloorplanId(lk: Lookup, loc: Pick<PlaceLocation, 'place_id' | 'floorplan_id'>): number | null {
  if (loc.floorplan_id != null) return loc.floorplan_id
  const place = lk.places.get(loc.place_id)
  return primaryFloorplanOfFloor(lk, place?.floor_id)?.id ?? null
}

/** route_node が属する floorplan（floor_id の代表floorplan） */
export function nodeFloorplanId(lk: Lookup, node: Pick<RouteNode, 'floor_id'>): number | null {
  return primaryFloorplanOfFloor(lk, node.floor_id)?.id ?? null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * まだ高さが決まっていない floorplan に初期値を与える。
 * 既存location の world_y の中央値 → 同じ階のnode の中央値 → level_no × 階高 の順。
 * 既に設定済みの値は維持する。
 */
export function fillMissingHeights(
  lk: Lookup,
  t: Pick<Tables, 'place_locations' | 'route_nodes'>,
  current: FloorplanHeights,
  storyHeight: number,
): FloorplanHeights {
  const locYs = new Map<number, number[]>()
  for (const loc of t.place_locations) {
    const fp = locationFloorplanId(lk, loc)
    if (fp == null) continue
    locYs.set(fp, [...(locYs.get(fp) ?? []), loc.world_y])
  }
  const nodeYs = new Map<number, number[]>()
  for (const n of t.route_nodes) {
    const fp = nodeFloorplanId(lk, n)
    if (fp == null) continue
    nodeYs.set(fp, [...(nodeYs.get(fp) ?? []), n.world_y])
  }
  const out: FloorplanHeights = { ...current }
  for (const fp of lk.floorplans.values()) {
    if (out[fp.id] != null) continue
    const floor = lk.floors.get(fp.floor_id)
    out[fp.id] =
      median(locYs.get(fp.id) ?? []) ??
      median(nodeYs.get(fp.id) ?? []) ??
      ((floor?.level_no ?? 1) - 1) * storyHeight
  }
  return out
}

/** floorplan の高さ制約を location / node に適用する。変更が無い行は同じ参照を返す */
export function applyHeights(
  lk: Lookup,
  t: Pick<Tables, 'place_locations' | 'route_nodes'>,
  heights: FloorplanHeights,
): Pick<Tables, 'place_locations' | 'route_nodes'> {
  const place_locations = t.place_locations.map((loc) => {
    const fp = locationFloorplanId(lk, loc)
    const h = fp != null ? heights[fp] : undefined
    return h != null && loc.world_y !== h ? { ...loc, world_y: h } : loc
  })
  const route_nodes = t.route_nodes.map((n) => {
    const fp = nodeFloorplanId(lk, n)
    const h = fp != null ? heights[fp] : undefined
    return h != null && n.world_y !== h ? { ...n, world_y: h } : n
  })
  return { place_locations, route_nodes }
}

/** 高さが制約されているか（されていれば固定値） */
export function constrainedYForLocation(lk: Lookup, heights: FloorplanHeights, loc: Pick<PlaceLocation, 'place_id' | 'floorplan_id'>) {
  const fp = locationFloorplanId(lk, loc)
  return fp != null ? heights[fp] ?? null : null
}
export function constrainedYForNode(lk: Lookup, heights: FloorplanHeights, node: Pick<RouteNode, 'floor_id'>) {
  const fp = nodeFloorplanId(lk, node)
  return fp != null ? heights[fp] ?? null : null
}
