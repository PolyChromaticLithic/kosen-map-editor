import Papa from 'papaparse'
import { TABLES, type ColumnDef, type TableName, type RowTypes } from '../schema/tables'

export interface ParseResult<K extends TableName> {
  table: K
  rows: RowTypes[K][]
  errors: string[]
}

/** ファイル名からテーブルを判別する。`places_rows.csv` / `place_locations (1).csv` 等に対応 */
export function detectTableFromFileName(fileName: string): TableName | null {
  const base = fileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.csv$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
  const names = Object.keys(TABLES) as TableName[]
  const stripped = base.replace(/_rows$/, '').replace(/^public\./, '')
  if (names.includes(stripped as TableName)) return stripped as TableName
  // 先頭一致で最長のテーブル名（place_locations が places より優先されるように）
  const hits = names.filter((n) => stripped.startsWith(n)).sort((a, b) => b.length - a.length)
  return hits[0] ?? null
}

/** ヘッダ列からテーブルを判別する（ファイル名で判別できなかった場合の予備） */
export function detectTableFromHeader(header: string[]): TableName | null {
  const set = new Set(header.map((h) => h.trim()))
  for (const [name, cols] of Object.entries(TABLES) as [TableName, ColumnDef[]][]) {
    if (cols.length === set.size && cols.every((col) => set.has(col.name))) return name
  }
  return null
}

function coerce(col: ColumnDef, raw: unknown, rowNo: number, errors: string[]): unknown {
  const s = raw == null ? '' : String(raw).trim()
  if (s === '' || s.toUpperCase() === 'NULL') {
    if (col.nullable) return null
    if (col.type === 'text') return ''
    if (col.type === 'timestamp') return new Date().toISOString()
    errors.push(`${rowNo}行目: ${col.name} が空です`)
    return null
  }
  switch (col.type) {
    case 'int': {
      const n = Number(s)
      if (!Number.isInteger(n)) errors.push(`${rowNo}行目: ${col.name} が整数ではありません (${s})`)
      return n
    }
    case 'float': {
      const n = Number(s)
      if (!Number.isFinite(n)) errors.push(`${rowNo}行目: ${col.name} が数値ではありません (${s})`)
      return n
    }
    case 'bool': {
      const l = s.toLowerCase()
      if (['true', 't', '1', 'yes', 'y'].includes(l)) return true
      if (['false', 'f', '0', 'no', 'n'].includes(l)) return false
      errors.push(`${rowNo}行目: ${col.name} が真偽値ではありません (${s})`)
      return false
    }
    default:
      return String(raw)
  }
}

export function parseTableCsv<K extends TableName>(table: K, text: string): ParseResult<K> {
  const cols = TABLES[table] as ColumnDef[]
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })
  const errors = res.errors.map((e) => `${e.row != null ? e.row + 2 : '?'}行目: ${e.message}`)
  const header = res.meta.fields ?? []
  const missing = cols.filter((col) => !header.includes(col.name))
  for (const m of missing) {
    if (m.type !== 'timestamp' && !m.nullable) errors.push(`必須列 ${m.name} がありません`)
  }
  const rows = res.data.map((raw, i) => {
    const row: Record<string, unknown> = {}
    for (const col of cols) row[col.name] = coerce(col, raw[col.name], i + 2, errors)
    return row as unknown as RowTypes[K]
  })
  return { table, rows, errors }
}

function formatCell(col: ColumnDef, v: unknown): string {
  if (v === null || v === undefined) return ''
  if (col.type === 'bool') return v ? 'true' : 'false'
  return String(v)
}

/** DDLの列順でCSVを書き出す */
export function serializeTableCsv<K extends TableName>(table: K, rows: RowTypes[K][]): string {
  const cols = TABLES[table] as ColumnDef[]
  const data = rows.map((r) => cols.map((col) => formatCell(col, (r as unknown as Record<string, unknown>)[col.name])))
  return Papa.unparse({ fields: cols.map((col) => col.name), data }, { newline: '\n' }) + '\n'
}
