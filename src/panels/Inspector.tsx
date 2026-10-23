import { useData, findRow } from '../store/dataStore'
import { useUi } from '../store/uiStore'
import { useProject } from '../store/projectStore'
import { constrainedYForLocation, constrainedYForNode, locationFloorplanId, nodeFloorplanId } from '../domain/heights'
import { floorLabel, floorplanLabel, nodeLabel, placeLabel, sortedFloors } from '../domain/labels'
import { BoolField, NumberField, SelectField, TextField } from './Fields'
import { deleteSelection } from '../viewport/actions'
import type { Place, PlaceLocation, RouteEdge, RouteNode, PlaceAccessNode } from '../schema/tables'

function Link({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="link" onClick={onClick}>
      {children}
    </button>
  )
}

function DeleteButton({ label = '削除 (Del)' }: { label?: string }) {
  return (
    <button className="danger" onClick={deleteSelection}>
      {label}
    </button>
  )
}

export function Inspector() {
  const sel = useUi((s) => s.selection)
  const tables = useData((s) => s.tables)
  if (!sel) return <div className="inspector empty">何も選択されていません</div>
  switch (sel.kind) {
    case 'place': {
      const p = useData.getState().lookup.places.get(sel.id)
      return p ? <PlaceInspector place={p} /> : null
    }
    case 'location': {
      const r = findRow(tables, 'place_locations', sel.id)
      return r ? <LocationInspector loc={r} /> : null
    }
    case 'node': {
      const r = findRow(tables, 'route_nodes', sel.id)
      return r ? <NodeInspector node={r} /> : null
    }
    case 'edge': {
      const r = findRow(tables, 'route_edges', sel.id)
      return r ? <EdgeInspector edge={r} /> : null
    }
    case 'access': {
      const r = findRow(tables, 'place_access_nodes', sel.id)
      return r ? <AccessInspector access={r} /> : null
    }
  }
}

/* ---------------- place（参照のみ） ---------------- */

function PlaceInspector({ place }: { place: Place }) {
  const lk = useData((s) => s.lookup)
  const t = useData((s) => s.tables)
  const ui = useUi.getState()
  const locs = t.place_locations.filter((l) => l.place_id === place.id)
  const access = t.place_access_nodes.filter((a) => a.place_id === place.id)
  const aliases = lk.aliasesByPlace.get(place.id) ?? []
  return (
    <div className="inspector">
      <h3>場所 <small>places #{place.id}（読み取り専用）</small></h3>
      <div className="place-title">{placeLabel(lk, place)}</div>
      <dl className="kv">
        <dt>種別</dt><dd>{place.place_type}</dd>
        <dt>読み</dt><dd>{place.reading ?? '—'}</dd>
        <dt>別名</dt><dd>{aliases.join(', ') || '—'}</dd>
        <dt>階</dt><dd>{floorLabel(lk, place.floor_id)}</dd>
        <dt>状態</dt><dd>{place.is_active ? '有効' : '無効'}{place.is_searchable ? '' : '・検索対象外'}</dd>
      </dl>
      <h4>表示位置 ({locs.length})</h4>
      {locs.map((l) => (
        <div key={l.id}>
          <Link onClick={() => ui.select({ kind: 'location', id: l.id })}>
            #{l.id} {l.is_primary ? '★主' : ''} ({l.world_x.toFixed(1)}, {l.world_y.toFixed(1)}, {l.world_z.toFixed(1)})
            {l.floorplan_id != null ? ' 2D済' : ''}
          </Link>
        </div>
      ))}
      <div className="buttons">
        <button onClick={() => ui.setTool('place')}>{locs.length ? '3Dで位置を変更 (P)' : '3Dで配置 (P)'}</button>
        <button
          onClick={() => {
            const id = useData.getState().insert('place_locations', {
              place_id: place.id, world_x: 0, world_y: 0, world_z: 0,
              floorplan_id: null, map_x: null, map_y: null, is_primary: locs.length === 0,
            })
            ui.select({ kind: 'location', id })
          }}
        >
          位置を追加
        </button>
      </div>
      <h4>入口ノード ({access.length})</h4>
      {access.map((a) => {
        const n = findRow(t, 'route_nodes', a.route_node_id)
        return (
          <div key={a.id}>
            <Link onClick={() => ui.select({ kind: 'access', id: a.id })}>
              {a.is_primary ? '★' : ''}{a.access_type}: {n ? nodeLabel(lk, n) : `(不明 ${a.route_node_id})`}
            </Link>
          </div>
        )
      })}
      <div className="buttons">
        <button onClick={() => ui.setTool('access')}>ノードをクリックして入口に紐付け (A)</button>
      </div>
    </div>
  )
}

/* ---------------- place_locations ---------------- */

function LocationInspector({ loc }: { loc: PlaceLocation }) {
  const lk = useData((s) => s.lookup)
  const heights = useData((s) => s.heights)
  const update = (patch: Partial<PlaceLocation>) => useData.getState().update('place_locations', loc.id, patch)
  const place = lk.places.get(loc.place_id)
  const lockedY = constrainedYForLocation(lk, heights, loc)
  const fpId = locationFloorplanId(lk, loc)
  const floorFps = place?.floor_id != null ? lk.floorplansByFloor.get(place.floor_id) ?? [] : [...lk.floorplans.values()]
  const ui = useUi.getState()
  return (
    <div className="inspector">
      <h3>表示位置 <small>place_locations #{loc.id}</small></h3>
      <div className="place-title">
        {place ? (
          <Link onClick={() => ui.select({ kind: 'place', id: place.id })}>{placeLabel(lk, place, loc.floorplan_id)}</Link>
        ) : (
          <span className="err">place_id {loc.place_id} は places に存在しません</span>
        )}
      </div>
      <NumberField live label="world_x" value={loc.world_x} onCommit={(v) => update({ world_x: v! })} />
      <NumberField
        live
        label="world_y"
        value={loc.world_y}
        disabled={lockedY != null}
        hint={lockedY != null ? `平面図 ${floorplanLabel(lk, fpId)} の高さに固定` : '屋外: 自由'}
        onCommit={(v) => update({ world_y: v! })}
      />
      <NumberField live label="world_z" value={loc.world_z} onCommit={(v) => update({ world_z: v! })} />
      <SelectField<number>
        label="floorplan_id"
        value={loc.floorplan_id}
        options={[{ value: null, label: '（なし: 2D未配置/屋外）' }, ...floorFps.map((fp) => ({ value: fp.id, label: floorplanLabel(lk, fp.id) }))]}
        hint="2Dビューで位置を置くと自動で設定されます"
        onCommit={(v) => update(v == null ? { floorplan_id: null, map_x: null, map_y: null } : { floorplan_id: v, map_x: loc.map_x ?? 0.5, map_y: loc.map_y ?? 0.5 })}
      />
      <NumberField live label="map_x" value={loc.map_x} nullable step={0.001} disabled={loc.floorplan_id == null} onCommit={(v) => update({ map_x: v })} />
      <NumberField live label="map_y" value={loc.map_y} nullable step={0.001} disabled={loc.floorplan_id == null} onCommit={(v) => update({ map_y: v })} />
      <BoolField
        label="is_primary（主表示位置）"
        value={loc.is_primary}
        onCommit={(v) => {
          const d = useData.getState()
          // 1場所につき主表示位置は1つ
          if (v) for (const o of d.tables.place_locations) if (o.place_id === loc.place_id && o.id !== loc.id && o.is_primary) d.update('place_locations', o.id, { is_primary: false })
          update({ is_primary: v })
        }}
      />
      <div className="buttons">
        {fpId != null && (
          <button onClick={() => useUi.setState({ view: '2d', activeFloorplanId: fpId })}>2Dビューで配置</button>
        )}
        <DeleteButton />
      </div>
    </div>
  )
}

/* ---------------- route_nodes ---------------- */

function NodeInspector({ node }: { node: RouteNode }) {
  const lk = useData((s) => s.lookup)
  const t = useData((s) => s.tables)
  const heights = useData((s) => s.heights)
  const vocab = useProject((s) => s.vocab)
  const ui = useUi.getState()
  const update = (patch: Partial<RouteNode>) => useData.getState().update('route_nodes', node.id, patch)
  const lockedY = constrainedYForNode(lk, heights, node)
  const edges = t.route_edges.filter((e) => e.from_node_id === node.id || e.to_node_id === node.id)
  const access = t.place_access_nodes.filter((a) => a.route_node_id === node.id)
  const maps = t.route_node_map_positions.filter((m) => m.route_node_id === node.id)
  const fpId = nodeFloorplanId(lk, node)
  return (
    <div className="inspector">
      <h3>経路ノード <small>route_nodes #{node.id}</small></h3>
      <TextField label="code" value={node.code} nullable onCommit={(v) => update({ code: v })} />
      <TextField label="name" value={node.name} nullable onCommit={(v) => update({ name: v })} />
      <TextField
        label="node_type"
        value={node.node_type}
        options={vocab.node_type}
        onCommit={(v) => {
          update({ node_type: v ?? '' })
          if (v) useUi.setState({ lastNodeType: v })
        }}
      />
      <SelectField<number>
        label="floor_id"
        value={node.floor_id}
        options={[{ value: null, label: '屋外 (NULL)' }, ...sortedFloors(lk).map((f) => ({ value: f.id, label: floorLabel(lk, f.id) }))]}
        onCommit={(v) => update({ floor_id: v })}
      />
      <NumberField live label="world_x" value={node.world_x} onCommit={(v) => update({ world_x: v! })} />
      <NumberField
        live
        label="world_y"
        value={node.world_y}
        disabled={lockedY != null}
        hint={lockedY != null ? `平面図 ${floorplanLabel(lk, fpId)} の高さに固定` : '屋外: 自由'}
        onCommit={(v) => update({ world_y: v! })}
      />
      <NumberField live label="world_z" value={node.world_z} onCommit={(v) => update({ world_z: v! })} />
      <BoolField label="is_active" value={node.is_active} onCommit={(v) => update({ is_active: v })} />

      <h4>接続エッジ ({edges.length})</h4>
      {edges.map((e) => {
        const otherId = e.from_node_id === node.id ? e.to_node_id : e.from_node_id
        const other = findRow(t, 'route_nodes', otherId)
        return (
          <div key={e.id}>
            <Link onClick={() => ui.select({ kind: 'edge', id: e.id })}>
              {e.edge_type} → {other ? nodeLabel(lk, other) : otherId}
            </Link>
          </div>
        )
      })}
      <h4>入口として使う場所 ({access.length})</h4>
      {access.map((a) => {
        const p = lk.places.get(a.place_id)
        return (
          <div key={a.id}>
            <Link onClick={() => ui.select({ kind: 'access', id: a.id })}>{p ? placeLabel(lk, p) : `(不明 ${a.place_id})`}</Link>
          </div>
        )
      })}
      <h4>2D位置 ({maps.length})</h4>
      {maps.map((m) => (
        <div key={m.id} className="row-inline">
          <span>{floorplanLabel(lk, m.floorplan_id)} ({m.map_x.toFixed(3)}, {m.map_y.toFixed(3)})</span>
          <button className="small danger" onClick={() => useData.getState().remove('route_node_map_positions', [m.id])}>×</button>
        </div>
      ))}
      <div className="buttons">
        {fpId != null && <button onClick={() => useUi.setState({ view: '2d', activeFloorplanId: fpId })}>2Dビューで配置</button>}
        <DeleteButton label="削除（接続エッジ・入口も削除）" />
      </div>
    </div>
  )
}

/* ---------------- route_edges ---------------- */

function EdgeInspector({ edge }: { edge: RouteEdge }) {
  const lk = useData((s) => s.lookup)
  const t = useData((s) => s.tables)
  const vocab = useProject((s) => s.vocab)
  const ui = useUi.getState()
  const update = (patch: Partial<RouteEdge>) => useData.getState().update('route_edges', edge.id, patch)
  const a = findRow(t, 'route_nodes', edge.from_node_id)
  const b = findRow(t, 'route_nodes', edge.to_node_id)
  const dist = a && b ? Math.hypot(a.world_x - b.world_x, a.world_y - b.world_y, a.world_z - b.world_z) : null
  return (
    <div className="inspector">
      <h3>経路エッジ <small>route_edges #{edge.id}</small></h3>
      <div>
        from: {a ? <Link onClick={() => ui.select({ kind: 'node', id: a.id })}>{nodeLabel(lk, a)}</Link> : <span className="err">{edge.from_node_id} なし</span>}
      </div>
      <div>
        to: {b ? <Link onClick={() => ui.select({ kind: 'node', id: b.id })}>{nodeLabel(lk, b)}</Link> : <span className="err">{edge.to_node_id} なし</span>}
      </div>
      <TextField label="edge_type" value={edge.edge_type} options={vocab.edge_type} onCommit={(v) => update({ edge_type: v ?? '' })} />
      <BoolField label="is_bidirectional（双方向）" value={edge.is_bidirectional} onCommit={(v) => update({ is_bidirectional: v })} />
      <NumberField
        label="distance_m"
        value={edge.distance_m}
        nullable
        hint={dist != null ? `3D距離: ${dist.toFixed(2)} m（NULLならアプリ側で算出）` : undefined}
        onCommit={(v) => update({ distance_m: v })}
      />
      <NumberField label="cost_multiplier" value={edge.cost_multiplier} onCommit={(v) => update({ cost_multiplier: v! })} />
      <NumberField label="extra_cost" value={edge.extra_cost} onCommit={(v) => update({ extra_cost: v! })} />
      <BoolField label="wheelchair_accessible（車椅子可）" value={edge.wheelchair_accessible} onCommit={(v) => update({ wheelchair_accessible: v })} />
      <BoolField label="is_indoor（屋内）" value={edge.is_indoor} onCommit={(v) => update({ is_indoor: v })} />
      <BoolField label="is_covered（屋根あり）" value={edge.is_covered} onCommit={(v) => update({ is_covered: v })} />
      <NumberField label="slope_percent" value={edge.slope_percent} nullable onCommit={(v) => update({ slope_percent: v })} />
      <NumberField label="min_width_m" value={edge.min_width_m} nullable onCommit={(v) => update({ min_width_m: v })} />
      <TextField label="access_level" value={edge.access_level} options={vocab.access_level} onCommit={(v) => update({ access_level: v ?? '' })} />
      <BoolField label="is_active" value={edge.is_active} onCommit={(v) => update({ is_active: v })} />
      <TextField label="note" value={edge.note} nullable onCommit={(v) => update({ note: v })} />
      <div className="buttons">
        {dist != null && <button onClick={() => update({ distance_m: Math.round(dist * 100) / 100 })}>3D距離で distance_m を埋める</button>}
        <button onClick={() => update({ from_node_id: edge.to_node_id, to_node_id: edge.from_node_id })}>向きを反転</button>
        <DeleteButton />
      </div>
    </div>
  )
}

/* ---------------- place_access_nodes ---------------- */

function AccessInspector({ access }: { access: PlaceAccessNode }) {
  const lk = useData((s) => s.lookup)
  const t = useData((s) => s.tables)
  const vocab = useProject((s) => s.vocab)
  const ui = useUi.getState()
  const update = (patch: Partial<PlaceAccessNode>) => useData.getState().update('place_access_nodes', access.id, patch)
  const place = lk.places.get(access.place_id)
  const node = findRow(t, 'route_nodes', access.route_node_id)
  return (
    <div className="inspector">
      <h3>入口ノード <small>place_access_nodes #{access.id}</small></h3>
      <div>
        場所: {place ? <Link onClick={() => ui.select({ kind: 'place', id: place.id })}>{placeLabel(lk, place)}</Link> : <span className="err">place_id {access.place_id} なし</span>}
      </div>
      <div>
        ノード: {node ? <Link onClick={() => ui.select({ kind: 'node', id: node.id })}>{nodeLabel(lk, node)}</Link> : <span className="err">{access.route_node_id} なし</span>}
      </div>
      <TextField label="access_type" value={access.access_type} options={vocab.access_type} onCommit={(v) => update({ access_type: v ?? '' })} />
      <BoolField
        label="is_primary（主入口）"
        value={access.is_primary}
        onCommit={(v) => {
          const d = useData.getState()
          if (v) for (const o of d.tables.place_access_nodes) if (o.place_id === access.place_id && o.id !== access.id && o.is_primary) d.update('place_access_nodes', o.id, { is_primary: false })
          update({ is_primary: v })
        }}
      />
      <BoolField label="wheelchair_accessible（車椅子可）" value={access.wheelchair_accessible} onCommit={(v) => update({ wheelchair_accessible: v })} />
      <TextField label="note" value={access.note} nullable onCommit={(v) => update({ note: v })} />
      <div className="buttons">
        <DeleteButton />
      </div>
    </div>
  )
}
