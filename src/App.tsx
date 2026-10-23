import { useEffect, useState } from 'react'
import { Scene } from './viewport/Scene'
import { FloorplanView } from './view2d/FloorplanView'
import { TopBar, ToolBar } from './panels/TopBar'
import { PlaceList } from './panels/PlaceList'
import { NodeList } from './panels/NodeList'
import { FloorplanPanel } from './panels/FloorplanPanel'
import { ValidationPanel, useIssues } from './panels/ValidationPanel'
import { Inspector } from './panels/Inspector'
import { useUi, type Tool } from './store/uiStore'
import { undo, redo } from './store/dataStore'
import { deleteSelection } from './viewport/actions'
import { importFiles } from './io/importFiles'
import { PLACE_MIME, dropPlaceAt } from './viewport/PlaceDrop'

type LeftTab = 'places' | 'nodes' | 'floorplans' | 'validation'

const TOOL_KEYS: Record<string, Tool> = { v: 'select', p: 'place', n: 'node', e: 'edge', a: 'access' }

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) return e.preventDefault(), undo()
      if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) return e.preventDefault(), redo()
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (k === 'delete' || k === 'backspace') return deleteSelection()
      if (k === 'escape') return useUi.setState({ edgeFrom: null, tool: 'select' })
      if (TOOL_KEYS[k] && useUi.getState().view === '3d') useUi.getState().setTool(TOOL_KEYS[k])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Messages() {
  const messages = useUi((s) => s.messages)
  return (
    <div className="toasts">
      {messages.map((m) => (
        <div key={m.id} className={`toast ${m.level}`} onClick={() => useUi.getState().dismiss(m.id)}>
          {m.text}
        </div>
      ))}
    </div>
  )
}

export function App() {
  const [tab, setTab] = useState<LeftTab>('places')
  const [dragging, setDragging] = useState(false)
  const view = useUi((s) => s.view)
  const issues = useIssues()
  const errors = issues.filter((i) => i.level === 'error').length
  useShortcuts()

  return (
    <div
      className="app"
      onDragOver={(e) => {
        // ファイル以外（場所一覧からのドラッグなど）はここでは受けない
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(false)
        void importFiles([...e.dataTransfer.files])
      }}
    >
      <TopBar onShowValidation={() => setTab('validation')} />
      <ToolBar />
      <div className="main">
        <aside className="left">
          <div className="tabs">
            <button className={tab === 'places' ? 'active' : ''} onClick={() => setTab('places')}>場所</button>
            <button className={tab === 'nodes' ? 'active' : ''} onClick={() => setTab('nodes')}>ノード</button>
            <button className={tab === 'floorplans' ? 'active' : ''} onClick={() => setTab('floorplans')}>平面図/高さ</button>
            <button className={tab === 'validation' ? 'active' : ''} onClick={() => setTab('validation')}>
              検証{errors > 0 && <span className="badge">{errors}</span>}
            </button>
          </div>
          {tab === 'places' && <PlaceList />}
          {tab === 'nodes' && <NodeList />}
          {tab === 'floorplans' && <FloorplanPanel />}
          {tab === 'validation' && <ValidationPanel />}
        </aside>
        <section className="center">
          {/* 3Dは2D表示中もアンマウントせず、カメラ位置を保つ */}
          <div
            className="view3d"
            hidden={view !== '3d'}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(PLACE_MIME)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={(e) => {
              const id = Number(e.dataTransfer.getData(PLACE_MIME))
              if (!id) return
              e.preventDefault()
              dropPlaceAt(id, e.clientX, e.clientY)
            }}
          >
            <Scene />
          </div>
          {view === '2d' && <FloorplanView />}
        </section>
        <aside className="right">
          <Inspector />
        </aside>
      </div>
      {dragging && <div className="dropzone">CSV / GLB / SVG / editor-project.json をドロップ</div>}
      <Messages />
    </div>
  )
}
