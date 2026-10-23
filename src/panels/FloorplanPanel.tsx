import { useMemo } from 'react'
import { useData } from '../store/dataStore'
import { useUi } from '../store/uiStore'
import { useProject } from '../store/projectStore'
import { floorLabel, sortedFloorplans } from '../domain/labels'
import { locationFloorplanId, nodeFloorplanId } from '../domain/heights'
import { NumberField } from './Fields'
import { deleteSvg, saveSvg } from '../io/persist'

export function FloorplanPanel() {
  const lk = useData((s) => s.lookup)
  const heights = useData((s) => s.heights)
  const storyHeight = useData((s) => s.storyHeight)
  const t = useData((s) => s.tables)
  const active = useUi((s) => s.activeFloorplanId)
  const svgFiles = useProject((s) => s.svgFiles)
  const fps = sortedFloorplans(lk)

  const counts = useMemo(() => {
    const m = new Map<number, { locs: number; nodes: number }>()
    const get = (id: number) => m.get(id) ?? (m.set(id, { locs: 0, nodes: 0 }), m.get(id)!)
    for (const l of t.place_locations) {
      const fp = locationFloorplanId(lk, l)
      if (fp != null) get(fp).locs++
    }
    for (const n of t.route_nodes) {
      const fp = nodeFloorplanId(lk, n)
      if (fp != null) get(fp).nodes++
    }
    return m
  }, [t.place_locations, t.route_nodes, lk])

  if (fps.length === 0) return <div className="empty">floorplans.csv を読み込んでください</div>

  return (
    <div className="list-panel scroll">
      <p className="hint">
        同じ平面図に属する場所・ノードは同じ高さ (world_y) に固定されます。高さを変えると全部が一緒に動きます。
      </p>
      <NumberField
        label="標準階高 (m)"
        value={storyHeight}
        hint="初期高さが決められない平面図に (level_no-1)×階高 を使います"
        onCommit={(v) => v != null && v > 0 && useData.getState().setStoryHeight(v)}
      />
      <div
        className={`fp-card ${active == null ? 'active' : ''}`}
        onClick={() => useUi.setState({ activeFloorplanId: null })}
      >
        <div className="fp-title">屋外 / 全体</div>
        <div className="muted">高さ制約なし・モデル表面に配置</div>
      </div>
      {fps.map((fp) => {
        const c = counts.get(fp.id)
        return (
          <div key={fp.id} className={`fp-card ${active === fp.id ? 'active' : ''}`} onClick={() => useUi.setState({ activeFloorplanId: fp.id })}>
            <div className="fp-title">
              {floorLabel(lk, fp.floor_id)} <span className="muted">[{fp.name}]</span>
            </div>
            <div className="muted">
              #{fp.id} {fp.code ?? ''} — 場所 {c?.locs ?? 0} / ノード {c?.nodes ?? 0}
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <NumberField
                label="高さ world_y"
                value={heights[fp.id] ?? null}
                onCommit={(v) => v != null && useData.getState().setHeight(fp.id, v)}
              />
              <div className="row-inline">
                <span className="muted">SVG: {svgFiles[fp.id] ?? `未割当 (${fp.asset_path})`}</span>
                <label className="button small">
                  選択
                  <input
                    type="file"
                    accept=".svg,image/svg+xml"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      await saveSvg(fp.id, await f.text())
                      useProject.getState().setSvgFile(fp.id, f.name)
                      e.target.value = ''
                    }}
                  />
                </label>
                {svgFiles[fp.id] && (
                  <button
                    className="small"
                    onClick={async () => {
                      await deleteSvg(fp.id)
                      useProject.getState().setSvgFile(fp.id, null)
                    }}
                  >
                    解除
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
