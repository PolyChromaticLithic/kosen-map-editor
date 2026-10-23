import { readFileSync } from 'node:fs'
import { describe, expect, it, beforeEach } from 'vitest'
import { detectTableFromFileName, parseTableCsv, serializeTableCsv } from './io/csv'
import { useData, undo } from './store/dataStore'
import { splitEdgeAt } from './viewport/actions'
import { validate, hasErrors } from './domain/validate'
import { placeLabel } from './domain/labels'
import { inferEdgeDefaults } from './domain/defaults'
import { clearSql, afterImportSql } from './io/exportBundle'
import { TABLES, emptyTables, type TableName, type Tables } from './schema/tables'

const fixture = (t: TableName) => readFileSync(new URL(`../fixtures/${t}_rows.csv`, import.meta.url), 'utf8')

function loadFixtures(): Tables {
  const t = emptyTables()
  for (const name of Object.keys(TABLES) as TableName[]) {
    const r = parseTableCsv(name, fixture(name))
    expect(r.errors, name).toEqual([])
    ;(t as Record<TableName, unknown>)[name] = r.rows
  }
  return t
}

beforeEach(() => {
  useData.setState({ tables: emptyTables(), heights: {}, idCounters: { place_locations: 0, route_nodes: 0, route_node_map_positions: 0, route_edges: 0, place_access_nodes: 0 } })
  useData.getState().loadTables(loadFixtures())
})

describe('csv', () => {
  it('detects table from Supabase export file names', () => {
    expect(detectTableFromFileName('places_rows.csv')).toBe('places')
    expect(detectTableFromFileName('place_locations_rows (1).csv')).toBe('place_locations')
    expect(detectTableFromFileName('route_node_map_positions.csv')).toBe('route_node_map_positions')
    expect(detectTableFromFileName('foo.csv')).toBeNull()
  })

  it('coerces types and nulls', () => {
    const r = parseTableCsv('places', fixture('places'))
    const p = r.rows.find((x) => x.id === 9)!
    expect(p.floor_id).toBeNull()
    expect(p.is_active).toBe(true)
    expect(r.rows.find((x) => x.id === 10)!.description).toBe('正門横, 屋根あり')
  })

  it('round-trips in DDL column order', () => {
    for (const name of ['route_edges', 'place_locations', 'places'] as const) {
      const rows = parseTableCsv(name, fixture(name)).rows
      const csv = serializeTableCsv(name, rows)
      expect(csv.split('\n')[0]).toBe(TABLES[name].map((c) => c.name).join(','))
      expect(parseTableCsv(name, csv).rows).toEqual(rows)
    }
  })

  it('reports missing required values', () => {
    const r = parseTableCsv('route_edges', 'id,from_node_id,to_node_id\n1,,2\n')
    expect(r.errors.length).toBeGreaterThan(0)
  })
})

describe('heights', () => {
  it('initialises floorplan heights from existing data', () => {
    const h = useData.getState().heights
    expect(h[1]).toBe(0) // 既存location/nodeの中央値
    expect(h[2]).toBe(3.6) // 2Fノードから
    expect(h[4]).toBe(3.5) // データなし → (level_no-1)×階高
  })

  it('fixes y for places on the same floorplan, including new rows', () => {
    const d = useData.getState()
    const id = d.insert('place_locations', { place_id: 2, world_x: 1, world_y: 99, world_z: 1, floorplan_id: null, map_x: null, map_y: null, is_primary: true })
    expect(useData.getState().tables.place_locations.find((l) => l.id === id)!.world_y).toBe(3.6)
    d.update('place_locations', id, { world_y: -5, world_x: 7 })
    const l = useData.getState().tables.place_locations.find((l) => l.id === id)!
    expect(l.world_y).toBe(3.6)
    expect(l.world_x).toBe(7)
  })

  it('moves every location and node on a floorplan when its height changes', () => {
    const d = useData.getState()
    d.insert('place_locations', { place_id: 5, world_x: 1, world_y: 0, world_z: 1, floorplan_id: null, map_x: null, map_y: null, is_primary: true })
    d.setHeight(2, 4.2)
    const t = useData.getState().tables
    expect(t.route_nodes.find((n) => n.id === 5)!.world_y).toBe(4.2)
    expect(t.place_locations.filter((l) => l.place_id === 5).every((l) => l.world_y === 4.2)).toBe(true)
    // 他の階・屋外は動かない
    expect(t.route_nodes.find((n) => n.id === 4)!.world_y).toBe(0)
    expect(t.route_nodes.find((n) => n.id === 6)!.world_y).toBe(0)
  })

  it('leaves outdoor rows free', () => {
    const d = useData.getState()
    d.update('place_locations', 3, { world_y: 2.5 })
    expect(useData.getState().tables.place_locations.find((l) => l.id === 3)!.world_y).toBe(2.5)
  })

  it('undoes a height change in one step', () => {
    useData.getState().setHeight(2, 5)
    useData.temporal.getState().undo()
    const s = useData.getState()
    expect(s.heights[2]).toBe(3.6)
    expect(s.tables.route_nodes.find((n) => n.id === 5)!.world_y).toBe(3.6)
  })
})

describe('ids', () => {
  it('allocates above existing ids and never reuses deleted ones', () => {
    const d = useData.getState()
    const a = d.insert('route_nodes', { code: null, name: null, node_type: 'hallway', world_x: 0, world_y: 0, world_z: 0, floor_id: 1, is_active: true })
    expect(a).toBe(7)
    d.remove('route_nodes', [a])
    const b = useData.getState().insert('route_nodes', { code: null, name: null, node_type: 'hallway', world_x: 0, world_y: 0, world_z: 0, floor_id: 1, is_active: true })
    expect(b).toBe(8)
  })

  it('cascades node deletion to edges, access nodes and map positions', () => {
    useData.getState().remove('route_nodes', [2, 3])
    const t = useData.getState().tables
    expect(t.route_edges.map((e) => e.id)).toEqual([4, 5])
    expect(t.place_access_nodes).toEqual([])
    expect(t.route_node_map_positions).toEqual([])
  })
})

describe('labels', () => {
  it('distinguishes same-named places by building / floor / floorplan', () => {
    const lk = useData.getState().lookup
    const labels = [1, 2, 3, 4].map((id) => placeLabel(lk, lk.places.get(id)!))
    expect(new Set(labels).size).toBe(4)
    expect(labels[1]).toBe('トイレ — 1号館 / 2F / [1号館2階]')
    expect(placeLabel(lk, lk.places.get(9)!)).toBe('グラウンド — 屋外')
  })
})

describe('edges', () => {
  it('infers stairs edges as not wheelchair accessible', () => {
    const t = useData.getState().tables
    const e = inferEdgeDefaults(t.route_nodes[3], t.route_nodes[4])
    expect(e.edge_type).toBe('stairs')
    expect(e.wheelchair_accessible).toBe(false)
    const o = inferEdgeDefaults(t.route_nodes[5], t.route_nodes[0])
    expect(o.edge_type).toBe('doorway')
    expect(o.is_indoor).toBe(false)
  })

  it('splits an edge with a new node, keeping attributes, in one undo step', () => {
    useData.getState().update('route_edges', 2, { distance_m: 10 })
    const before = useData.getState().tables
    const nodeId = splitEdgeAt(2, 0.3)!
    const t = useData.getState().tables
    const n = t.route_nodes.find((x) => x.id === nodeId)!
    const [a, b] = [2, 3].map((id) => t.route_nodes.find((x) => x.id === id)!)
    expect(n.world_x).toBeCloseTo(a.world_x + (b.world_x - a.world_x) * 0.3, 2)
    expect(n.floor_id).toBe(a.floor_id)
    const halves = t.route_edges.filter((e) => e.from_node_id === nodeId || e.to_node_id === nodeId)
    expect(halves.map((e) => [e.from_node_id, e.to_node_id])).toEqual([[2, nodeId], [nodeId, 3]])
    expect(halves.map((e) => e.distance_m)).toEqual([3, 7])
    expect(halves.every((e) => e.min_width_m === 2.5)).toBe(true)
    undo()
    expect(useData.getState().tables).toBe(before)
  })
})

describe('validate', () => {
  const run = () => validate(useData.getState().tables, useData.getState().lookup, null)

  it('fixtures have no errors', () => {
    expect(run().filter((i) => i.level === 'error')).toEqual([])
  })

  it('detects orphans after places are replaced', () => {
    const places = useData.getState().tables.places.filter((p) => p.id !== 1)
    useData.getState().loadTables({ places })
    const issues = run()
    expect(hasErrors(issues)).toBe(true)
    expect(issues.filter((i) => i.orphan).map((i) => `${i.table}:${i.id}`).sort()).toEqual(['place_access_nodes:1', 'place_locations:1'])
  })

  it('checks spec section 11 constraints', () => {
    const d = useData.getState()
    d.update('route_edges', 1, { cost_multiplier: 0, min_width_m: 0 })
    d.update('place_locations', 1, { map_x: 1.5 })
    d.update('place_locations', 2, { floorplan_id: 1, map_x: null, map_y: null })
    d.insert('place_locations', { place_id: 1, world_x: 0, world_y: 0, world_z: 0, floorplan_id: null, map_x: null, map_y: null, is_primary: true })
    d.insert('place_access_nodes', { place_id: 1, route_node_id: 3, access_type: 'entrance', is_primary: false, wheelchair_accessible: true, note: null })
    const msgs = run().filter((i) => i.level === 'error').map((i) => i.message).join('\n')
    expect(msgs).toContain('cost_multiplier')
    expect(msgs).toContain('min_width_m')
    expect(msgs).toContain('0〜1')
    expect(msgs).toContain('全て揃える')
    expect(msgs).toContain('主表示位置')
    expect(msgs).toContain('重複')
  })

  it('detects floor mismatch between place and floorplan', () => {
    useData.getState().update('place_locations', 2, { floorplan_id: 2, map_x: 0.5, map_y: 0.5 })
    expect(run().some((i) => i.level === 'error' && i.message.includes('一致しません'))).toBe(true)
  })

  it('warns when model node names are missing', () => {
    const issues = validate(useData.getState().tables, useData.getState().lookup, ['Building_1', 'Gym'])
    expect(issues.some((i) => i.message.includes('Building_2'))).toBe(true)
  })
})

describe('export sql', () => {
  it('clears in reverse dependency order', () => {
    const s = clearSql()
    expect(s.indexOf('place_access_nodes')).toBeLessThan(s.indexOf('route_nodes;'))
    expect(s.indexOf('route_edges')).toBeLessThan(s.indexOf('route_nodes;'))
    expect(afterImportSql()).toContain("pg_get_serial_sequence('public.route_edges', 'id')")
  })
})
