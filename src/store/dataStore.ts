import { create } from 'zustand'
import { temporal } from 'zundo'
import {
  EDITABLE_TABLES,
  emptyTables,
  type EditableTable,
  type RowTypes,
  type TableName,
  type Tables,
} from '../schema/tables'
import { buildLookup, type Lookup } from '../domain/lookup'
import { applyHeights, fillMissingHeights, type FloorplanHeights } from '../domain/heights'
import { DEFAULT_STORY_HEIGHT } from '../domain/defaults'

export type NewRow<K extends EditableTable> = Omit<RowTypes[K], 'id' | 'created_at'> & { created_at?: string }

type IdCounters = Record<EditableTable, number>

/** テーブルをどのCSVから読み込んだか */
export interface TableSource {
  file: string
  rows: number
  /** 読み込んだ日時 (ISO) */
  at: string
}
export type TableSources = Partial<Record<TableName, TableSource>>

interface DataState {
  tables: Tables
  heights: FloorplanHeights
  /** テーブルごとの採番済み最大ID。削除しても戻さない（Supabase上の既存IDと衝突させない） */
  idCounters: IdCounters
  lookup: Lookup
  storyHeight: number
  /** 読み込み元の記録（テーブル一覧の表示用） */
  sources: TableSources

  /** CSV読み込み。渡したテーブルだけ差し替える */
  loadTables: (partial: Partial<Tables>, sources?: TableSources) => void
  /** 自動保存からの復元 */
  restore: (s: { tables: Tables; heights: FloorplanHeights; idCounters: IdCounters; storyHeight?: number; sources?: TableSources }) => void
  insert: <K extends EditableTable>(table: K, row: NewRow<K>) => number
  update: <K extends EditableTable>(table: K, id: number, patch: Partial<RowTypes[K]>) => void
  remove: (table: EditableTable, ids: number[]) => void
  setHeight: (floorplanId: number, y: number) => void
  setStoryHeight: (h: number) => void
  reapplyHeights: () => void
}

const zeroCounters = (): IdCounters =>
  Object.fromEntries(EDITABLE_TABLES.map((t) => [t, 0])) as IdCounters

const maxId = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0)

// 手で置いた座標の端数を丸める（world: 1mm, map: 0〜1 を 1/10000）
const roundTo = (v: unknown, k: number) => (typeof v === 'number' ? Math.round(v * k) / k : v)
function roundCoords<T>(row: T): T {
  const r = { ...row } as Record<string, unknown>
  for (const key of ['world_x', 'world_y', 'world_z']) if (key in r) r[key] = roundTo(r[key], 1000)
  for (const key of ['map_x', 'map_y']) if (key in r) r[key] = roundTo(r[key], 10000)
  return r as T
}

function withHeights(lookup: Lookup, tables: Tables, heights: FloorplanHeights): Tables {
  return { ...tables, ...applyHeights(lookup, tables, heights) }
}

export const useData = create<DataState>()(
  temporal(
    (set, get) => ({
      tables: emptyTables(),
      heights: {},
      idCounters: zeroCounters(),
      lookup: buildLookup(emptyTables()),
      storyHeight: DEFAULT_STORY_HEIGHT,
      sources: {},

      loadTables: (partial, sources) => {
        const s = get()
        const tables = { ...s.tables, ...partial }
        const lookup = buildLookup(tables)
        // 新しく登場したfloorplanにだけ初期高さを与え、既存の高さは維持する
        const heights = fillMissingHeights(lookup, tables, s.heights, s.storyHeight)
        const idCounters = { ...s.idCounters }
        for (const t of EDITABLE_TABLES) {
          if (partial[t]) idCounters[t] = Math.max(idCounters[t], maxId(tables[t]))
        }
        set({
          tables: withHeights(lookup, tables, heights),
          lookup,
          heights,
          idCounters,
          sources: sources ? { ...s.sources, ...sources } : s.sources,
        })
        useData.temporal.getState().clear()
      },

      restore: ({ tables, heights, idCounters, storyHeight, sources }) => {
        const lookup = buildLookup(tables)
        set({ tables, heights, idCounters, lookup, storyHeight: storyHeight ?? DEFAULT_STORY_HEIGHT, sources: sources ?? {} })
        useData.temporal.getState().clear()
      },

      insert: (table, row) => {
        const s = get()
        const id = Math.max(s.idCounters[table], maxId(s.tables[table])) + 1
        const full = roundCoords({ created_at: new Date().toISOString(), ...row, id }) as unknown as RowTypes[typeof table]
        const tables = { ...s.tables, [table]: [...s.tables[table], full] } as Tables
        set({
          tables: withHeights(s.lookup, tables, s.heights),
          idCounters: { ...s.idCounters, [table]: id },
        })
        return id
      },

      update: (table, id, patch) => {
        const s = get()
        const rows = s.tables[table] as { id: number }[]
        const tables = {
          ...s.tables,
          [table]: rows.map((r) => (r.id === id ? roundCoords({ ...r, ...patch }) : r)),
        } as Tables
        set({ tables: withHeights(s.lookup, tables, s.heights) })
      },

      remove: (table, ids) => {
        const s = get()
        const del = new Set(ids)
        const t = { ...s.tables }
        if (table === 'route_nodes') {
          // DDLの on delete cascade と同じ振る舞い
          t.route_nodes = t.route_nodes.filter((n) => !del.has(n.id))
          t.route_edges = t.route_edges.filter((e) => !del.has(e.from_node_id) && !del.has(e.to_node_id))
          t.place_access_nodes = t.place_access_nodes.filter((a) => !del.has(a.route_node_id))
          t.route_node_map_positions = t.route_node_map_positions.filter((m) => !del.has(m.route_node_id))
        } else {
          ;(t as Record<TableName, { id: number }[]>)[table] = (t[table] as { id: number }[]).filter((r) => !del.has(r.id))
        }
        set({ tables: t })
      },

      setHeight: (floorplanId, y) => {
        const s = get()
        const heights = { ...s.heights, [floorplanId]: y }
        set({ heights, tables: withHeights(s.lookup, s.tables, heights) })
      },

      setStoryHeight: (h) => set({ storyHeight: h }),

      reapplyHeights: () => {
        const s = get()
        set({ tables: withHeights(s.lookup, s.tables, s.heights) })
      },
    }),
    {
      // Undo対象はテーブルと高さのみ。参照テーブルは読み込み時に履歴を消すので履歴中は不変
      partialize: (s) => ({ tables: s.tables, heights: s.heights }),
      equality: (a, b) => a.tables === b.tables && a.heights === b.heights,
      limit: 200,
    },
  ),
)

export const undo = () => useData.temporal.getState().undo()
export const redo = () => useData.temporal.getState().redo()

/** 行を1件取得するヘルパ */
export function findRow<K extends TableName>(tables: Tables, table: K, id: number | null | undefined): RowTypes[K] | undefined {
  if (id == null) return undefined
  return (tables[table] as RowTypes[K][]).find((r) => (r as { id: number }).id === id)
}
