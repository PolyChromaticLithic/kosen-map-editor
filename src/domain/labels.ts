import type { Place, RouteNode } from '../schema/tables'
import { primaryFloorplanOfFloor, type Lookup } from './lookup'

export interface PlaceContext {
  building: string | null
  floor: string | null
  floorplan: string | null
}

export function placeContext(lk: Lookup, place: Pick<Place, 'floor_id'>, floorplanId?: number | null): PlaceContext {
  const floor = place.floor_id != null ? lk.floors.get(place.floor_id) : undefined
  const building = floor ? lk.buildings.get(floor.building_id) : undefined
  const fp = floorplanId != null ? lk.floorplans.get(floorplanId) : primaryFloorplanOfFloor(lk, place.floor_id)
  return {
    building: building ? building.short_name || building.name : null,
    floor: floor?.name ?? null,
    floorplan: fp?.name ?? null,
  }
}

/** 「1号館 / 2F / [1号館2F平面図] / #201」形式。屋外は「屋外」 */
export function contextText(ctx: PlaceContext, roomNumber?: string | null): string {
  const parts: string[] = []
  if (!ctx.building && !ctx.floor) parts.push('屋外')
  if (ctx.building) parts.push(ctx.building)
  if (ctx.floor) parts.push(ctx.floor)
  if (ctx.floorplan) parts.push(`[${ctx.floorplan}]`)
  if (roomNumber) parts.push(`#${roomNumber}`)
  return parts.join(' / ')
}

export function placeLabel(lk: Lookup, place: Place, floorplanId?: number | null): string {
  return `${place.name} — ${contextText(placeContext(lk, place, floorplanId), place.room_number)}`
}

/** 3Dラベル用の短い表記「トイレ (1号館 2F)」 */
export function placeShortLabel(lk: Lookup, place: Place): string {
  const ctx = placeContext(lk, place)
  const where = [ctx.building, ctx.floor].filter(Boolean).join(' ')
  return where ? `${place.name} (${where})` : place.name
}

export function nodeLabel(lk: Lookup, node: RouteNode): string {
  const head = node.name || node.code || `#${node.id}`
  const ctx = placeContext(lk, { floor_id: node.floor_id })
  const where = [ctx.building, ctx.floor].filter(Boolean).join(' ') || '屋外'
  return `${head} [${node.node_type}] — ${where}`
}

/** 検索用に正規化（全角/半角・カタカナ/ひらがな・大文字小文字を寄せる） */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')
}

export function placeMatches(lk: Lookup, place: Place, query: string): boolean {
  const q = normalizeForSearch(query)
  if (!q) return true
  const hay = [place.name, place.reading, place.room_number, place.place_type, ...(lk.aliasesByPlace.get(place.id) ?? [])]
  return hay.some((h) => h && normalizeForSearch(h).includes(q))
}

export function floorLabel(lk: Lookup, floorId: number | null): string {
  if (floorId == null) return '屋外'
  const floor = lk.floors.get(floorId)
  if (!floor) return `(不明な階 ${floorId})`
  const b = lk.buildings.get(floor.building_id)
  return `${b ? b.short_name || b.name : '?'} ${floor.name}`
}

export function floorplanLabel(lk: Lookup, floorplanId: number | null): string {
  if (floorplanId == null) return '屋外'
  const fp = lk.floorplans.get(floorplanId)
  if (!fp) return `(不明な平面図 ${floorplanId})`
  return `${floorLabel(lk, fp.floor_id)} [${fp.name}]`
}

/** 建物→階 の順に並べた floorplans */
export function sortedFloorplans(lk: Lookup) {
  return [...lk.floorplans.values()].sort((a, b) => {
    const fa = lk.floors.get(a.floor_id)
    const fb = lk.floors.get(b.floor_id)
    const ba = fa ? lk.buildings.get(fa.building_id) : undefined
    const bb = fb ? lk.buildings.get(fb.building_id) : undefined
    return (
      (ba?.sort_order ?? 0) - (bb?.sort_order ?? 0) ||
      (ba?.id ?? 0) - (bb?.id ?? 0) ||
      (fa?.sort_order ?? 0) - (fb?.sort_order ?? 0) ||
      (fa?.level_no ?? 0) - (fb?.level_no ?? 0) ||
      a.sort_order - b.sort_order ||
      a.id - b.id
    )
  })
}

export function sortedFloors(lk: Lookup) {
  return [...lk.floors.values()].sort((a, b) => {
    const ba = lk.buildings.get(a.building_id)
    const bb = lk.buildings.get(b.building_id)
    return (
      (ba?.sort_order ?? 0) - (bb?.sort_order ?? 0) ||
      a.building_id - b.building_id ||
      a.sort_order - b.sort_order ||
      a.level_no - b.level_no
    )
  })
}

/**
 * 階ごとのラベル色（色相）。3Dラベルの「建物 階」表記の代わりに使う。
 * 階の並び順に黄金角で色相を割り当て、隣り合う階どうしが似た色にならないようにする。屋外は null。
 */
export function floorHue(lk: Lookup, floorId: number | null): number | null {
  if (floorId == null || !lk.floors.has(floorId)) return null
  const idx = sortedFloors(lk).findIndex((f) => f.id === floorId)
  return (idx * 137.508) % 360
}

/** 階の色を CSS の色で返す（文字色の上に置く背景用 / 縁や点用） */
export function floorColors(lk: Lookup, floorId: number | null) {
  const h = floorHue(lk, floorId)
  if (h == null) return { bg: 'rgba(51, 65, 85, 0.9)', accent: '#cbd5e1' }
  return { bg: `hsla(${h.toFixed(0)}, 65%, 30%, 0.92)`, accent: `hsl(${h.toFixed(0)}, 85%, 65%)` }
}
