import { useMemo, useState } from 'react'
import { useData } from '../store/dataStore'
import { useUi } from '../store/uiStore'
import { useProject } from '../store/projectStore'
import { nodeFloorplanId } from '../domain/heights'
import { nodeLabel, normalizeForSearch } from '../domain/labels'
import { nodeColor } from '../domain/defaults'

export function NodeList() {
  const nodes = useData((s) => s.tables.route_nodes)
  const lk = useData((s) => s.lookup)
  const active = useUi((s) => s.activeFloorplanId)
  const sel = useUi((s) => s.selection)
  const lastNodeType = useUi((s) => s.lastNodeType)
  const vocab = useProject((s) => s.vocab)
  const [q, setQ] = useState('')
  const [onlyActive, setOnlyActive] = useState(true)

  const list = useMemo(() => {
    const nq = normalizeForSearch(q)
    return nodes.filter((n) => {
      if (onlyActive && nodeFloorplanId(lk, n) !== active) return false
      if (!nq) return true
      return [n.code, n.name, n.node_type, String(n.id)].some((s) => s && normalizeForSearch(s).includes(nq))
    })
  }, [nodes, lk, q, onlyActive, active])

  return (
    <div className="list-panel">
      <label className="field">
        <span className="field-label">追加するノード種別</span>
        <select value={lastNodeType} onChange={(e) => useUi.setState({ lastNodeType: e.target.value })}>
          {vocab.node_type.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <p className="hint">ノード追加(N)中に Shift+クリックで、選択中のノードからエッジを続けて張れます。</p>
      <input className="search" placeholder="code / name / 種別 / id" value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="filters">
        <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> 作業中の階のみ
      </label>
      <div className="tree">
        {list.map((n) => (
          <div
            key={n.id}
            className={`item ${sel?.kind === 'node' && sel.id === n.id ? 'active' : ''}`}
            onClick={() => useUi.getState().select({ kind: 'node', id: n.id })}
          >
            <span className="dot" style={{ background: nodeColor(n.node_type) }} />
            <span className="grow">{nodeLabel(lk, n)}</span>
          </div>
        ))}
        {list.length === 0 && <div className="empty">ノードがありません</div>}
      </div>
    </div>
  )
}
