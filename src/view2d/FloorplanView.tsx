import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../store/dataStore'
import { useUi } from '../store/uiStore'
import { useProject } from '../store/projectStore'
import { loadSvg } from '../io/persist'
import { locationFloorplanId, nodeFloorplanId } from '../domain/heights'
import { floorplanLabel, placeShortLabel, nodeLabel } from '../domain/labels'
import { nodeColor } from '../domain/defaults'

type Pending = { kind: 'location'; id: number } | { kind: 'node'; id: number } | null
type Drag = { kind: 'location' | 'map'; id: number; moved: boolean; start: { x: number; y: number } } | null

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function svgSize(text: string, fallbackW: number | null, fallbackH: number | null) {
  const vb = text.match(/viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)/)
  if (vb) return { w: Number(vb[3]), h: Number(vb[4]) }
  const w = text.match(/<svg[^>]*\swidth\s*=\s*["']([\d.]+)/)
  const h = text.match(/<svg[^>]*\sheight\s*=\s*["']([\d.]+)/)
  if (w && h) return { w: Number(w[1]), h: Number(h[1]) }
  return { w: fallbackW ?? 1000, h: fallbackH ?? 1000 }
}

/**
 * 平面図SVG上で map_x / map_y を手動配置する2Dビュー。
 * 座標はSVG全体を 0〜1 に正規化（左上原点, x→右, y→下）。
 */
export function FloorplanView() {
  const fpId = useUi((s) => s.activeFloorplanId)
  const sel = useUi((s) => s.selection)
  const lk = useData((s) => s.lookup)
  const t = useData((s) => s.tables)
  const svgFile = useProject((s) => (fpId != null ? s.svgFiles[fpId] : undefined))
  const fp = fpId != null ? lk.floorplans.get(fpId) : undefined

  const [svgText, setSvgText] = useState<string | null>(null)
  const [view, setView] = useState({ s: 1, x: 0, y: 0 })
  const [pending, setPending] = useState<Pending>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const drag = useRef<Drag>(null)
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  useEffect(() => {
    let alive = true
    setSvgText(null)
    if (fpId != null) loadSvg(fpId).then((s) => alive && setSvgText(s ?? null))
    return () => {
      alive = false
    }
  }, [fpId, svgFile])

  const size = useMemo(
    () => (svgText ? svgSize(svgText, fp?.viewbox_width ?? null, fp?.viewbox_height ?? null) : { w: fp?.viewbox_width ?? 1000, h: fp?.viewbox_height ?? 1000 }),
    [svgText, fp],
  )
  const dataUrl = useMemo(() => (svgText ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}` : null), [svgText])

  // 表示領域にフィット
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const s = Math.min(r.width / size.w, r.height / size.h) * 0.95
    setView({ s, x: (r.width - size.w * s) / 2, y: (r.height - size.h * s) / 2 })
  }, [size, fpId])

  const { placedLocs, unplacedLocs, placedNodes, unplacedNodes, edges } = useMemo(() => {
    const placedLocs = t.place_locations.filter((l) => l.floorplan_id === fpId && l.map_x != null && l.map_y != null)
    const unplacedLocs = t.place_locations.filter((l) => (l.floorplan_id == null || l.map_x == null) && fpId != null && locationFloorplanId(lk, l) === fpId)
    const mapByNode = new Map(t.route_node_map_positions.filter((m) => m.floorplan_id === fpId).map((m) => [m.route_node_id, m]))
    const nodeById = new Map(t.route_nodes.map((n) => [n.id, n]))
    const placedNodes = [...mapByNode.values()].map((m) => ({ m, n: nodeById.get(m.route_node_id) }))
    const unplacedNodes = t.route_nodes.filter((n) => fpId != null && nodeFloorplanId(lk, n) === fpId && !mapByNode.has(n.id))
    const edges = t.route_edges
      .map((e) => ({ e, a: mapByNode.get(e.from_node_id), b: mapByNode.get(e.to_node_id) }))
      .filter((x) => x.a && x.b)
    return { placedLocs, unplacedLocs, placedNodes, unplacedNodes, edges }
  }, [t, lk, fpId])

  if (fpId == null || !fp) {
    return <div className="view2d empty">左の「平面図」タブ、または上部のセレクタで平面図を選んでください（屋外には2D平面図がありません）</div>
  }

  const toMap = (clientX: number, clientY: number) => {
    const ctm = gRef.current!.getScreenCTM()!.inverse()
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm)
    return { x: clamp01(p.x / size.w), y: clamp01(p.y / size.h) }
  }

  const setPos = (d: NonNullable<Drag>, p: { x: number; y: number }) => {
    const data = useData.getState()
    if (d.kind === 'location') data.update('place_locations', d.id, { floorplan_id: fpId, map_x: p.x, map_y: p.y })
    else data.update('route_node_map_positions', d.id, { map_x: p.x, map_y: p.y })
  }

  const placePending = (p: { x: number; y: number }) => {
    if (!pending) return
    const data = useData.getState()
    if (pending.kind === 'location') {
      data.update('place_locations', pending.id, { floorplan_id: fpId, map_x: p.x, map_y: p.y })
      useUi.getState().select({ kind: 'location', id: pending.id })
    } else {
      data.insert('route_node_map_positions', { route_node_id: pending.id, floorplan_id: fpId, map_x: p.x, map_y: p.y })
      useUi.getState().select({ kind: 'node', id: pending.id })
    }
    setPending(null)
  }

  const r = 7 / view.s // 画面上で一定サイズ

  const startDrag = (e: React.PointerEvent, d: NonNullable<Drag>, select: () => void) => {
    e.stopPropagation()
    select()
    drag.current = d
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  return (
    <div className="view2d">
      <div className="view2d-side">
        <h4>{floorplanLabel(lk, fpId)}</h4>
        {!dataUrl && <p className="callout">SVG未割当です。平面図タブで「選択」するか、SVGファイルをドロップしてください（asset_path: {fp.asset_path}）。座標配置は可能です。</p>}
        {pending && <p className="callout">配置先をクリックしてください（Escで取消）</p>}
        <h5>2D未配置の場所 ({unplacedLocs.length})</h5>
        {unplacedLocs.map((l) => {
          const p = lk.places.get(l.place_id)
          return (
            <div key={l.id} className={`item ${pending?.kind === 'location' && pending.id === l.id ? 'active' : ''}`} onClick={() => setPending({ kind: 'location', id: l.id })}>
              {p ? placeShortLabel(lk, p) : l.place_id} {p?.room_number ? `#${p.room_number}` : ''}
            </div>
          )
        })}
        <h5>2D未配置のノード ({unplacedNodes.length})</h5>
        {unplacedNodes.map((n) => (
          <div key={n.id} className={`item ${pending?.kind === 'node' && pending.id === n.id ? 'active' : ''}`} onClick={() => setPending({ kind: 'node', id: n.id })}>
            <span className="dot" style={{ background: nodeColor(n.node_type) }} />
            <span className="grow">{nodeLabel(lk, n)}</span>
          </div>
        ))}
        <p className="hint">3Dで場所を配置していないものはここに出ません。ホイールで拡大、右ドラッグ/中ドラッグで移動。</p>
      </div>
      <svg
        ref={svgRef}
        className={`view2d-canvas ${pending ? 'placing' : ''}`}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Escape' && setPending(null)}
        onWheel={(e) => {
          const rect = svgRef.current!.getBoundingClientRect()
          const mx = e.clientX - rect.left
          const my = e.clientY - rect.top
          const k = Math.exp(-e.deltaY * 0.0015)
          setView((v) => ({ s: v.s * k, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }))
        }}
        onPointerDown={(e) => {
          if (e.button === 1 || e.button === 2 || (e.button === 0 && !pending)) {
            pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
            ;(e.target as Element).setPointerCapture(e.pointerId)
          }
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            if (!drag.current.moved) {
              drag.current.moved = true
              useData.temporal.getState().pause()
            }
            setPos(drag.current, toMap(e.clientX, e.clientY))
          } else if (pan.current) {
            const p = pan.current
            setView((v) => ({ ...v, x: p.vx + e.clientX - p.x, y: p.vy + e.clientY - p.y }))
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current
          if (d?.moved) {
            // ドラッグ全体を1回の履歴にまとめる: 開始位置に戻してから履歴を再開し、終了位置を確定
            const end = toMap(e.clientX, e.clientY)
            setPos(d, d.start)
            useData.temporal.getState().resume()
            setPos(d, end)
          }
          drag.current = null
          pan.current = null
        }}
        onClick={(e) => {
          if (pending && !drag.current) placePending(toMap(e.clientX, e.clientY))
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g ref={gRef} transform={`translate(${view.x} ${view.y}) scale(${view.s})`}>
          <rect width={size.w} height={size.h} fill="#fff" stroke="#94a3b8" strokeWidth={1 / view.s} />
          {dataUrl && <image href={dataUrl} width={size.w} height={size.h} preserveAspectRatio="none" />}
          {edges.map(({ e, a, b }) => (
            <line
              key={e.id}
              x1={a!.map_x * size.w} y1={a!.map_y * size.h} x2={b!.map_x * size.w} y2={b!.map_y * size.h}
              stroke={sel?.kind === 'edge' && sel.id === e.id ? '#eab308' : e.wheelchair_accessible ? '#0284c7' : '#ea580c'}
              strokeWidth={3 / view.s}
              strokeDasharray={e.wheelchair_accessible ? undefined : `${6 / view.s} ${4 / view.s}`}
              onClick={(ev) => {
                ev.stopPropagation()
                useUi.getState().select({ kind: 'edge', id: e.id })
              }}
            />
          ))}
          {placedNodes.map(({ m, n }) => {
            const selected = sel?.kind === 'node' && sel.id === m.route_node_id
            return (
              <g key={m.id} transform={`translate(${m.map_x * size.w} ${m.map_y * size.h})`}>
                <circle
                  r={r * (selected ? 1.4 : 1)}
                  fill={n ? nodeColor(n.node_type) : '#000'}
                  stroke={selected ? '#eab308' : '#fff'}
                  strokeWidth={2 / view.s}
                  className="draggable"
                  onPointerDown={(e) => startDrag(e, { kind: 'map', id: m.id, moved: false, start: { x: m.map_x, y: m.map_y } }, () => useUi.getState().select({ kind: 'node', id: m.route_node_id }))}
                />
                {n && (n.name || n.code) && (
                  <text y={-r * 1.6} fontSize={11 / view.s} textAnchor="middle" className="map-label">{n.name || n.code}</text>
                )}
              </g>
            )
          })}
          {placedLocs.map((l) => {
            const p = lk.places.get(l.place_id)
            const selected = sel?.kind === 'location' && sel.id === l.id
            return (
              <g key={l.id} transform={`translate(${l.map_x! * size.w} ${l.map_y! * size.h})`}>
                <path
                  d={`M0 0 L${-r} ${-r * 1.8} A${r} ${r} 0 1 1 ${r} ${-r * 1.8} Z`}
                  fill={selected ? '#eab308' : '#ef4444'}
                  stroke="#fff"
                  strokeWidth={1.5 / view.s}
                  className="draggable"
                  onPointerDown={(e) =>
                    startDrag(e, { kind: 'location', id: l.id, moved: false, start: { x: l.map_x!, y: l.map_y! } }, () =>
                      useUi.setState({ selection: { kind: 'location', id: l.id }, activePlaceId: l.place_id }),
                    )
                  }
                />
                {/* 正確な設置点 */}
                <circle r={2.5 / view.s} fill="#fff" stroke="#0f172a" strokeWidth={1 / view.s} pointerEvents="none" />
                <text y={-r * 3.2} fontSize={12 / view.s} textAnchor="middle" className="map-label">
                  {p ? `${p.name}${p.room_number ? ' #' + p.room_number : ''}` : l.place_id}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
