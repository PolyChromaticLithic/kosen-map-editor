import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useData } from '../store/dataStore'

/** 入力中は履歴に積まず、確定（blur / Enter）で onCommit する */
function useDraft<T>(value: T, editing?: { current: boolean }) {
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value))
  // 入力中は外からの値で上書きしない（"1." のような途中の文字列を壊さないため）
  useEffect(() => {
    if (!editing?.current) setDraft(value == null ? '' : String(value))
  }, [value, editing])
  return [draft, setDraft] as const
}

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">{children}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function NumberField(props: {
  label: string; value: number | null; nullable?: boolean; disabled?: boolean; step?: number; hint?: ReactNode
  /** true: 入力中も onCommit して見た目を即時に反映する。履歴は確定時に1件だけ積む */
  live?: boolean
  onCommit: (v: number | null) => void
}) {
  const { label, value, nullable, disabled, step, hint, live, onCommit } = props
  const editing = useRef(false)
  const [draft, setDraft] = useDraft(value, editing)
  /** ライブ編集中なら編集開始時の値（履歴は一時停止中） */
  const liveStart = useRef<{ value: number | null } | null>(null)
  const cancel = useRef(false)

  /** 確定: ライブ編集中なら一旦開始値に戻してから履歴を再開し、最終値を1回だけ書く */
  const finish = (final: number | null) => {
    const start = liveStart.current
    liveStart.current = null
    if (!start) {
      if (final !== value) onCommit(final)
      return
    }
    onCommit(start.value)
    useData.temporal.getState().resume()
    if (final !== start.value) onCommit(final)
  }
  const finishRef = useRef(finish)
  finishRef.current = finish
  const lastLive = useRef<number | null>(null)
  // 入力中に選択が変わってアンマウントされても、履歴の一時停止を残さない
  useEffect(() => () => void (liveStart.current && finishRef.current(lastLive.current)), [])

  const onChange = (s: string) => {
    setDraft(s)
    if (!live || s.trim() === '') return
    const n = Number(s)
    if (!Number.isFinite(n) || n === value) return
    if (!liveStart.current) {
      liveStart.current = { value }
      useData.temporal.getState().pause()
    }
    lastLive.current = n
    onCommit(n)
  }

  const commit = () => {
    editing.current = false
    const base = liveStart.current ? liveStart.current.value : value
    let final = base
    const s = draft.trim()
    if (cancel.current) cancel.current = false
    else if (s === '') final = nullable ? null : base
    else if (Number.isFinite(Number(s))) final = Number(s)
    setDraft(final == null ? '' : String(final))
    finish(final)
  }
  return (
    <Row label={label} hint={hint}>
      <input
        type="number"
        step={step ?? 0.1}
        value={draft}
        disabled={disabled}
        placeholder={nullable ? 'NULL' : ''}
        onFocus={() => (editing.current = true)}
        onChange={(e) => onChange(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel.current = true
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
        }}
      />
    </Row>
  )
}

export function TextField(props: {
  label: string; value: string | null; nullable?: boolean; options?: string[]; disabled?: boolean; hint?: ReactNode
  onCommit: (v: string | null) => void
}) {
  const { label, value, nullable, options, disabled, hint, onCommit } = props
  const [draft, setDraft] = useDraft(value)
  const listId = options ? `dl-${label}` : undefined
  const commit = () => {
    const v = draft === '' && nullable ? null : draft
    if (v !== value) onCommit(v)
  }
  return (
    <Row label={label} hint={hint}>
      <input
        type="text"
        list={listId}
        value={draft}
        disabled={disabled}
        placeholder={nullable ? 'NULL' : ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {options && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </Row>
  )
}

export function BoolField(props: { label: string; value: boolean; disabled?: boolean; onCommit: (v: boolean) => void }) {
  return (
    <label className="field bool">
      <input type="checkbox" checked={props.value} disabled={props.disabled} onChange={(e) => props.onCommit(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  )
}

export function SelectField<T extends string | number>(props: {
  label: string; value: T | null; options: { value: T | null; label: string }[]; hint?: ReactNode
  onCommit: (v: T | null) => void
}) {
  const { label, value, options, hint, onCommit } = props
  const idx = options.findIndex((o) => o.value === value)
  return (
    <Row label={label} hint={hint}>
      <select value={idx} onChange={(e) => onCommit(options[Number(e.target.value)].value)}>
        {idx === -1 && <option value={-1}>（不明: {String(value)}）</option>}
        {options.map((o, i) => (
          <option key={i} value={i}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  )
}
