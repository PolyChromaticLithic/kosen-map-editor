import type { Building, Floor, Floorplan, Place, Tables } from '../schema/tables'

/** 参照テーブルのID索引。tablesが変わるたびに作り直す（参照テーブルは小さい） */
export interface Lookup {
  buildings: Map<number, Building>
  floors: Map<number, Floor>
  floorplans: Map<number, Floorplan>
  places: Map<number, Place>
  /** floor_id -> その階の floorplans（sort_order, id 順） */
  floorplansByFloor: Map<number, Floorplan[]>
  /** place_id -> 別名 */
  aliasesByPlace: Map<number, string[]>
}

const byId = <T extends { id: number }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))

export function buildLookup(t: Pick<Tables, 'buildings' | 'floors' | 'floorplans' | 'places' | 'place_aliases'>): Lookup {
  const floorplansByFloor = new Map<number, Floorplan[]>()
  for (const fp of t.floorplans) {
    const list = floorplansByFloor.get(fp.floor_id) ?? []
    list.push(fp)
    floorplansByFloor.set(fp.floor_id, list)
  }
  for (const list of floorplansByFloor.values()) list.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  const aliasesByPlace = new Map<number, string[]>()
  for (const a of t.place_aliases) {
    const list = aliasesByPlace.get(a.place_id) ?? []
    list.push(a.alias)
    aliasesByPlace.set(a.place_id, list)
  }
  return {
    buildings: byId(t.buildings),
    floors: byId(t.floors),
    floorplans: byId(t.floorplans),
    places: byId(t.places),
    floorplansByFloor,
    aliasesByPlace,
  }
}

/** その階の代表floorplan（sort_order最小） */
export function primaryFloorplanOfFloor(lk: Lookup, floorId: number | null | undefined): Floorplan | null {
  if (floorId == null) return null
  return lk.floorplansByFloor.get(floorId)?.[0] ?? null
}
