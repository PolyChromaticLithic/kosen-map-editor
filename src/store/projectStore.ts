import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_VOCAB, type Vocab } from '../domain/defaults'

/** エディター固有の設定。DBには入らない。localStorageに保存し、JSONでも入出力できる */
interface ProjectState {
  vocab: Vocab
  /** floorplan_id -> SVGファイル名（中身はIndexedDBに保存） */
  svgFiles: Record<number, string>
  setVocab: (key: keyof Vocab, values: string[]) => void
  setSvgFile: (floorplanId: number, fileName: string | null) => void
}

export const useProject = create<ProjectState>()(
  persist(
    (set) => ({
      vocab: DEFAULT_VOCAB,
      svgFiles: {},
      setVocab: (key, values) => set((s) => ({ vocab: { ...s.vocab, [key]: values } })),
      setSvgFile: (floorplanId, fileName) =>
        set((s) => {
          const svgFiles = { ...s.svgFiles }
          if (fileName) svgFiles[floorplanId] = fileName
          else delete svgFiles[floorplanId]
          return { svgFiles }
        }),
    }),
    { name: 'kosen-map-editor-project' },
  ),
)
