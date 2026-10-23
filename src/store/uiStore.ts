import { create } from 'zustand'
import type { Group } from 'three'

export type Selection =
  | { kind: 'place'; id: number }
  | { kind: 'location'; id: number }
  | { kind: 'node'; id: number }
  | { kind: 'edge'; id: number }
  | { kind: 'access'; id: number }
  | null

export type SnapRef = { kind: 'node' | 'location'; id: number } | null

export type Tool = 'select' | 'place' | 'node' | 'edge' | 'access'

export const TOOL_LABELS: Record<Tool, string> = {
  select: '選択/移動 (V)',
  place: '場所を配置 (P)',
  node: 'ノード追加 (N)',
  edge: 'エッジ追加 (E)',
  access: '入口紐付け (A)',
}

interface UiState {
  view: '3d' | '2d'
  tool: Tool
  selection: Selection
  /** 配置/入口紐付けの対象 place */
  activePlaceId: number | null
  /** エッジ追加中の始点ノード */
  edgeFrom: number | null
  /** スナップの基準（ノードか場所の表示位置。右クリックで設定）。他を動かすとき、この X/Y/Z にスナップする */
  snapRef: SnapRef
  /** 作業中の階。null は屋外 */
  activeFloorplanId: number | null
  /** 他の階の要素: show=通常, dim=薄く, hide=非表示 */
  otherFloors: 'show' | 'dim' | 'hide'
  clipAbove: boolean
  /** ノード・場所・エッジを建物モデルより手前に描く（建物に隠れても見える） */
  markersOnTop: boolean
  /** 場所一覧を作業中の階だけに絞る */
  placeListFloorOnly: boolean
  /** 平行投影（正射影）で表示する */
  orthographic: boolean
  modelTranslucent: boolean
  showLabels: boolean
  lastNodeType: string
  model: Group | null
  modelFileName: string | null
  modelNodeNames: string[]
  messages: { id: number; text: string; level: 'info' | 'warn' | 'error' }[]

  set: (p: Partial<UiState>) => void
  select: (s: Selection) => void
  setTool: (t: Tool) => void
  notify: (text: string, level?: 'info' | 'warn' | 'error') => void
  dismiss: (id: number) => void
}

let msgId = 0

export const useUi = create<UiState>()((set) => ({
  view: '3d',
  tool: 'select',
  selection: null,
  activePlaceId: null,
  edgeFrom: null,
  snapRef: null,
  activeFloorplanId: null,
  otherFloors: 'dim',
  clipAbove: false,
  markersOnTop: true,
  placeListFloorOnly: false,
  orthographic: false,
  modelTranslucent: false,
  showLabels: true,
  lastNodeType: 'hallway',
  model: null,
  modelFileName: null,
  modelNodeNames: [],
  messages: [],

  set: (p) => set(p),
  select: (selection) =>
    set((s) => ({
      selection,
      activePlaceId: selection?.kind === 'place' ? selection.id : s.activePlaceId,
    })),
  setTool: (tool) => set({ tool, edgeFrom: null }),
  notify: (text, level = 'info') => {
    const id = ++msgId
    set((s) => ({ messages: [...s.messages, { id, text, level }] }))
    setTimeout(() => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })), level === 'info' ? 3000 : 8000)
  },
  dismiss: (id) => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
}))
