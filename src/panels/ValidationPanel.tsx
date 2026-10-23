import { useMemo, useState } from 'react'
import { useData } from '../store/dataStore'
import { useUi, type Selection } from '../store/uiStore'
import { validate, type Issue, type IssueLevel } from '../domain/validate'
import { TABLE_LABELS, type EditableTable } from '../schema/tables'

export function useIssues() {
  const tables = useData((s) => s.tables)
  const lk = useData((s) => s.lookup)
  const model = useUi((s) => s.model)
  const names = useUi((s) => s.modelNodeNames)
  return useMemo(() => validate(tables, lk, model ? names : null), [tables, lk, model, names])
}

function selectionOf(i: Issue): Selection {
  if (i.id == null) return null
  switch (i.table) {
    case 'places': return { kind: 'place', id: i.id }
    case 'place_locations': return { kind: 'location', id: i.id }
    case 'route_nodes': return { kind: 'node', id: i.id }
    case 'route_edges': return { kind: 'edge', id: i.id }
    case 'place_access_nodes': return { kind: 'access', id: i.id }
    default: return null
  }
}

const LEVEL_LABEL: Record<IssueLevel, string> = { error: 'エラー', warn: '警告', info: '作業残り' }

export function ValidationPanel() {
  const issues = useIssues()
  const [level, setLevel] = useState<IssueLevel>('error')
  const counts = { error: 0, warn: 0, info: 0 }
  for (const i of issues) counts[i.level]++
  const orphans = issues.filter((i) => i.orphan && i.id != null)
  const shown = issues.filter((i) => i.level === level).slice(0, 500)

  return (
    <div className="list-panel">
      <div className="tabs small">
        {(['error', 'warn', 'info'] as const).map((l) => (
          <button key={l} className={`${level === l ? 'active' : ''} lvl-${l}`} onClick={() => setLevel(l)}>
            {LEVEL_LABEL[l]} {counts[l]}
          </button>
        ))}
      </div>
      {orphans.length > 0 && (
        <div className="callout">
          参照先（places / floors / floorplans / ノード）が見つからない行が {orphans.length} 件あります。
          places などを差し替えた場合に発生します。
          <button
            className="danger"
            onClick={() => {
              const d = useData.getState()
              const byTable = new Map<EditableTable, number[]>()
              for (const o of orphans) {
                if (o.table === 'route_nodes') continue // ノードは floor_id を直せば使えるので自動削除しない
                const t = o.table as EditableTable
                byTable.set(t, [...(byTable.get(t) ?? []), o.id!])
              }
              for (const [t, ids] of byTable) d.remove(t, ids)
            }}
          >
            孤立行を一括削除（ノード以外）
          </button>
        </div>
      )}
      <div className="tree">
        {shown.map((i, k) => (
          <div
            key={k}
            className={`item issue lvl-${i.level}`}
            onClick={() => {
              const s = selectionOf(i)
              if (s) useUi.getState().select(s)
            }}
          >
            <span className="muted">{TABLE_LABELS[i.table]}{i.id != null ? ` #${i.id}` : ''}</span> {i.message}
          </div>
        ))}
        {shown.length === 0 && <div className="empty">なし</div>}
      </div>
    </div>
  )
}
