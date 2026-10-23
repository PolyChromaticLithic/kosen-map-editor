import { useMemo, useState } from 'react'
import { useData } from '../store/dataStore'
import { useUi } from '../store/uiStore'
import { contextText, floorLabel, placeContext, placeMatches, sortedFloors } from '../domain/labels'
import { primaryFloorplanOfFloor } from '../domain/lookup'
import type { Place } from '../schema/tables'
import { PLACE_MIME } from '../viewport/PlaceDrop'

type Filter = 'all' | 'no3d' | 'no2d' | 'noaccess'

export function selectPlace(place: Place) {
  const lk = useData.getState().lookup
  const fp = primaryFloorplanOfFloor(lk, place.floor_id)
  useUi.setState({ activeFloorplanId: fp?.id ?? null })
  useUi.getState().select({ kind: 'place', id: place.id })
}

export function PlaceList() {
  const lk = useData((s) => s.lookup)
  const locations = useData((s) => s.tables.place_locations)
  const access = useData((s) => s.tables.place_access_nodes)
  const activePlaceId = useUi((s) => s.activePlaceId)
  const floorOnly = useUi((s) => s.placeListFloorOnly)
  const activeFp = useUi((s) => s.activeFloorplanId)
  /** 作業中の階の floor_id（屋外/全体のときは null = 屋外の場所） */
  const activeFloorId = activeFp != null ? lk.floorplans.get(activeFp)?.floor_id ?? null : null
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showInactive, setShowInactive] = useState(false)

  const status = useMemo(() => {
    const s = new Map<number, { has3d: boolean; has2d: boolean; hasAccess: boolean }>()
    const get = (id: number) => s.get(id) ?? (s.set(id, { has3d: false, has2d: false, hasAccess: false }), s.get(id)!)
    for (const l of locations) {
      const st = get(l.place_id)
      st.has3d = true
      if (l.floorplan_id != null) st.has2d = true
    }
    for (const a of access) get(a.place_id).hasAccess = true
    return s
  }, [locations, access])

  const groups = useMemo(() => {
    const byFloor = new Map<number | null, Place[]>()
    for (const p of lk.places.values()) {
      if (!showInactive && !p.is_active) continue
      if (floorOnly && (p.floor_id ?? null) !== activeFloorId) continue
      if (!placeMatches(lk, p, q)) continue
      const st = status.get(p.id)
      if (filter === 'no3d' && st?.has3d) continue
      if (filter === 'no2d' && (p.floor_id == null || st?.has2d)) continue
      if (filter === 'noaccess' && st?.hasAccess) continue
      const key = p.floor_id != null && lk.floors.has(p.floor_id) ? p.floor_id : null
      byFloor.set(key, [...(byFloor.get(key) ?? []), p])
    }
    for (const list of byFloor.values())
      list.sort((a, b) => (a.room_number ?? '').localeCompare(b.room_number ?? '', 'ja', { numeric: true }) || a.name.localeCompare(b.name, 'ja'))
    const order: (number | null)[] = [...sortedFloors(lk).map((f) => f.id), null]
    return order.filter((k) => byFloor.has(k)).map((k) => ({ floorId: k, places: byFloor.get(k)! }))
  }, [lk, q, filter, showInactive, status, floorOnly, activeFloorId])

  // 同じ名前が複数ある場合は強調して区別しやすくする
  const dupNames = useMemo(() => {
    const count = new Map<string, number>()
    for (const p of lk.places.values()) count.set(p.name, (count.get(p.name) ?? 0) + 1)
    return count
  }, [lk])

  if (lk.places.size === 0) return <div className="empty">places.csv を読み込んでください</div>

  return (
    <div className="list-panel">
      <input className="search" placeholder="名前・読み・別名・部屋番号で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="filters">
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">すべて</option>
          <option value="no3d">3D未配置</option>
          <option value="no2d">2D未配置（屋内）</option>
          <option value="noaccess">入口未設定</option>
        </select>
        <label>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> 無効も表示
        </label>
        <label title="ツールバーの「作業階」の場所だけを表示（屋外/全体のときは屋外の場所）">
          <input type="checkbox" checked={floorOnly} onChange={(e) => useUi.setState({ placeListFloorOnly: e.target.checked })} /> 作業階のみ
        </label>
      </div>
      <div className="tree">
        {groups.length === 0 && <div className="muted">該当する場所はありません</div>}
        {groups.map((g) => (
          <details key={g.floorId ?? 'outdoor'} open>
            <summary>
              {floorLabel(lk, g.floorId)}
              {g.floorId != null && primaryFloorplanOfFloor(lk, g.floorId) && (
                <span className="muted"> [{primaryFloorplanOfFloor(lk, g.floorId)!.name}]</span>
              )}
              <span className="count">{g.places.length}</span>
            </summary>
            {g.places.map((p) => {
              const st = status.get(p.id)
              const dup = (dupNames.get(p.name) ?? 0) > 1
              return (
                <div
                  key={p.id}
                  className={`item ${activePlaceId === p.id ? 'active' : ''} ${p.is_active ? '' : 'inactive'}`}
                  onClick={() => selectPlace(p)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(PLACE_MIME, String(p.id))
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  title={`places #${p.id} — ${contextText(placeContext(lk, p), p.room_number)}`}
                >
                  <span className="status">
                    <i className={st?.has3d ? 'on' : 'off'} title="3D表示位置">3D</i>
                    {p.floor_id != null && <i className={st?.has2d ? 'on' : 'off'} title="2D平面図位置">2D</i>}
                    <i className={st?.hasAccess ? 'on' : 'off'} title="入口ノード">入</i>
                  </span>
                  <span className={dup ? 'name dup' : 'name'}>{p.name}</span>
                  {p.room_number && <span className="muted"> #{p.room_number}</span>}
                  {dup && <span className="ctx">{contextText(placeContext(lk, p), null)}</span>}
                </div>
              )
            })}
          </details>
        ))}
      </div>
    </div>
  )
}
