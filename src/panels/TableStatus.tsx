import { useEffect, useRef, useState } from 'react'
import { useData } from '../store/dataStore'
import { EDITABLE_TABLES, REFERENCE_TABLES, TABLE_LABELS, type TableName } from '../schema/tables'

/** 作業に必須の参照テーブル */
const REQUIRED: TableName[] = ['buildings', 'floors', 'floorplans', 'places']
/** 仕様書にはあるがエディターでは扱わないテーブル */
const UNSUPPORTED = ['staff', 'place_staff', 'features', 'place_features']

const ALL: TableName[] = [...REFERENCE_TABLES, ...EDITABLE_TABLES]

function fmtTime(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** トップバーの「テーブル n/10」ボタンと、読み込み状況の一覧 */
export function TableStatusButton() {
  const tables = useData((s) => s.tables)
  const sources = useData((s) => s.sources)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const isLoaded = (t: TableName) => sources[t] != null || tables[t].length > 0
  const loadedCount = ALL.filter(isLoaded).length
  const missingRequired = REQUIRED.filter((t) => !isLoaded(t))

  const row = (t: TableName, kind: '参照' | '編集') => {
    const src = sources[t]
    const n = tables[t].length
    let status: React.ReactNode
    if (src) {
      status = (
        <>
          <span className="ok">✓ 読込済</span> <span className="muted">{src.file}・{src.rows}件・{fmtTime(src.at)}</span>
          {kind === '編集' && n !== src.rows && <span className="muted">（現在 {n}件）</span>}
        </>
      )
    } else if (n > 0) {
      // この機能より前に読み込んだデータや、エディターで作った行
      status = <><span className="ok">✓ データあり</span> <span className="muted">{n}件（読込元の記録なし）</span></>
    } else {
      status = <span className={REQUIRED.includes(t) ? 'err' : 'muted'}>未読込</span>
    }
    return (
      <tr key={t}>
        <td>
          <code>{t}</code>
          <div className="muted">{TABLE_LABELS[t]}{REQUIRED.includes(t) && <span className="err"> 必須</span>}</div>
        </td>
        <td className="muted">{kind}</td>
        <td>{status}</td>
      </tr>
    )
  }

  return (
    <div className="popover-anchor" ref={ref}>
      <button
        className={missingRequired.length ? 'warn-btn' : ''}
        onClick={() => setOpen((o) => !o)}
        title="読み込めるCSVと読み込み状況"
      >
        テーブル {loadedCount}/{ALL.length}
      </button>
      {open && (
        <div className="popover table-status">
          <p className="hint">
            ファイル名がテーブル名で始まるCSV（例: <code>places_rows.csv</code>）を「読み込み…」かドロップで読み込みます。
            参照テーブルは読み込むたびに置き換わり、編集テーブルを読み込むとエディター上の内容も置き換わります。
          </p>
          {missingRequired.length > 0 && (
            <p className="err">必須テーブルが未読込です: {missingRequired.join(', ')}</p>
          )}
          <table>
            <thead>
              <tr><th>テーブル</th><th>種別</th><th>状態</th></tr>
            </thead>
            <tbody>
              {REFERENCE_TABLES.map((t) => row(t, '参照'))}
              {EDITABLE_TABLES.map((t) => row(t, '編集'))}
            </tbody>
          </table>
          <p className="muted">対象外（読み込みません）: {UNSUPPORTED.join(', ')}</p>
        </div>
      )}
    </div>
  )
}
