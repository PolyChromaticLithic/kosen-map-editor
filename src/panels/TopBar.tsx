import { useStore } from 'zustand'
import { useData, undo, redo } from '../store/dataStore'
import { useUi, TOOL_LABELS, type Tool } from '../store/uiStore'
import { importFiles, buildProjectJson } from '../io/importFiles'
import { buildExportZip, downloadBlob } from '../io/exportBundle'
import { clearAll } from '../io/persist'
import { hasErrors } from '../domain/validate'
import { floorplanLabel, sortedFloorplans } from '../domain/labels'
import { useIssues } from './ValidationPanel'
import { TableStatusButton } from './TableStatus'

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')

export function TopBar({ onShowValidation }: { onShowValidation: () => void }) {
  const issues = useIssues()
  const canUndo = useStore(useData.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(useData.temporal, (s) => s.futureStates.length > 0)
  const view = useUi((s) => s.view)
  const modelFileName = useUi((s) => s.modelFileName)

  const exportZip = async () => {
    if (hasErrors(issues)) {
      useUi.getState().notify('エラーがあるため書き出せません。検証タブを確認してください', 'error')
      onShowValidation()
      return
    }
    const blob = await buildExportZip(useData.getState().tables)
    downloadBlob(blob, `kosen-map-export-${stamp()}.zip`)
  }

  return (
    <header className="topbar">
      <strong className="brand">校内マップ エディター</strong>
      <label className="button primary" title="CSV / GLB・glTF / SVG / editor-project.json をまとめて選択できます（ドラッグ&ドロップも可）">
        読み込み…
        <input
          type="file"
          multiple
          hidden
          accept=".csv,.glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.svg,.json"
          onChange={async (e) => {
            await importFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </label>
      <TableStatusButton />
      <button onClick={exportZip} title="編集対象5テーブルのCSV＋取り込み用SQLをZIPで保存">
        CSV書き出し (ZIP)
      </button>
      <button
        onClick={() =>
          downloadBlob(new Blob([JSON.stringify(buildProjectJson(), null, 2)], { type: 'application/json' }), 'editor-project.json')
        }
        title="平面図の高さ・語彙・SVG割当などエディター設定を保存"
      >
        設定保存
      </button>
      <span className="sep" />
      <button disabled={!canUndo} onClick={undo} title="元に戻す (Ctrl+Z)">↶</button>
      <button disabled={!canRedo} onClick={redo} title="やり直す (Ctrl+Y)">↷</button>
      <span className="sep" />
      <div className="tabs">
        <button className={view === '3d' ? 'active' : ''} onClick={() => useUi.setState({ view: '3d' })}>3D</button>
        <button className={view === '2d' ? 'active' : ''} onClick={() => useUi.setState({ view: '2d' })}>2D平面図</button>
      </div>
      <span className="grow" />
      <span className="muted">{modelFileName ? `モデル: ${modelFileName}` : 'モデル未読込'}</span>
      <button
        className="small"
        onClick={async () => {
          if (!confirm('作業データ（自動保存分）を消去して初期状態に戻しますか？')) return
          await clearAll()
          location.reload()
        }}
      >
        リセット
      </button>
    </header>
  )
}

export function ToolBar() {
  const tool = useUi((s) => s.tool)
  const view = useUi((s) => s.view)
  const lk = useData((s) => s.lookup)
  const heights = useData((s) => s.heights)
  const active = useUi((s) => s.activeFloorplanId)
  const otherFloors = useUi((s) => s.otherFloors)
  const clipAbove = useUi((s) => s.clipAbove)
  const orthographic = useUi((s) => s.orthographic)
  const markersOnTop = useUi((s) => s.markersOnTop)
  const translucent = useUi((s) => s.modelTranslucent)
  const showLabels = useUi((s) => s.showLabels)
  const edgeFrom = useUi((s) => s.edgeFrom)
  const activePlaceId = useUi((s) => s.activePlaceId)
  const activePlace = activePlaceId != null ? lk.places.get(activePlaceId) : undefined

  return (
    <div className="toolbar">
      <label>
        作業階:
        <select
          value={active ?? ''}
          onChange={(e) => useUi.setState({ activeFloorplanId: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">屋外 / 全体</option>
          {sortedFloorplans(lk).map((fp) => (
            <option key={fp.id} value={fp.id}>
              {floorplanLabel(lk, fp.id)} (y={heights[fp.id]?.toFixed(2) ?? '?'})
            </option>
          ))}
        </select>
      </label>
      {view === '3d' && (
        <>
          <span className="sep" />
          {(Object.keys(TOOL_LABELS) as Tool[]).map((t) => (
            <button key={t} className={tool === t ? 'active' : ''} onClick={() => useUi.getState().setTool(t)}>
              {TOOL_LABELS[t]}
            </button>
          ))}
          <span className="sep" />
          <label>
            他の階:
            <select value={otherFloors} onChange={(e) => useUi.setState({ otherFloors: e.target.value as 'show' | 'dim' | 'hide' })}>
              <option value="show">表示</option>
              <option value="dim">薄く</option>
              <option value="hide">隠す</option>
            </select>
          </label>
          <label><input type="checkbox" checked={clipAbove} onChange={(e) => useUi.setState({ clipAbove: e.target.checked })} /> 階より上を切断</label>
          <label title="遠近感のない平行投影で表示（右下の Y を押すたびに90°回転）">
            <input type="checkbox" checked={orthographic} onChange={(e) => useUi.setState({ orthographic: e.target.checked })} /> 平行投影
          </label>
          <label title="ノード・場所・エッジを建物より手前に描きます（建物の中のものも見えて選べます）">
            <input type="checkbox" checked={markersOnTop} onChange={(e) => useUi.setState({ markersOnTop: e.target.checked })} /> マーカー前面
          </label>
          <label><input type="checkbox" checked={translucent} onChange={(e) => useUi.setState({ modelTranslucent: e.target.checked })} /> モデル半透明</label>
          <label><input type="checkbox" checked={showLabels} onChange={(e) => useUi.setState({ showLabels: e.target.checked })} /> ラベル</label>
        </>
      )}
      <span className="grow" />
      <span className="tool-hint">
        {view === '3d' && tool === 'place' && (activePlace ? `「${activePlace.name}」を配置: 床面をクリック` : '一覧から場所を選択')}
        {view === '3d' && tool === 'node' && 'クリックでノード追加 / Shift+クリックで選択ノードから連結'}
        {view === '3d' && tool === 'edge' && (edgeFrom != null ? `始点 #${edgeFrom} → 終点ノードをクリック（Escで解除）` : '始点ノードをクリック')}
        {view === '3d' && tool === 'access' && (activePlace ? `「${activePlace.name}」の入口にするノードをクリック` : '一覧から場所を選択')}
      </span>
    </div>
  )
}
