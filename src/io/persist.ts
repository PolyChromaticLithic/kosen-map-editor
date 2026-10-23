import { get, set, del } from 'idb-keyval'
import { useData } from '../store/dataStore'

const KEY_DATA = 'kme:data'
const KEY_MODEL = 'kme:model'
const svgKey = (floorplanId: number) => `kme:svg:${floorplanId}`

export async function restoreData(): Promise<boolean> {
  const saved = await get(KEY_DATA)
  if (!saved) return false
  useData.getState().restore(saved)
  return true
}

/** テーブル・高さを IndexedDB に自動保存する（変更後 500ms で書き込み） */
export function startAutosave() {
  let timer: ReturnType<typeof setTimeout> | undefined
  return useData.subscribe((s, prev) => {
    if (s.tables === prev.tables && s.heights === prev.heights && s.storyHeight === prev.storyHeight && s.sources === prev.sources) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      const { tables, heights, idCounters, storyHeight, sources } = useData.getState()
      void set(KEY_DATA, { tables, heights, idCounters, storyHeight, sources })
    }, 500)
  })
}

export const saveModelFile = (file: File) => set(KEY_MODEL, file)
export const loadModelFile = () => get<File>(KEY_MODEL)
export const clearModelFile = () => del(KEY_MODEL)

export const saveSvg = (floorplanId: number, text: string) => set(svgKey(floorplanId), text)
export const loadSvg = (floorplanId: number) => get<string>(svgKey(floorplanId))
export const deleteSvg = (floorplanId: number) => del(svgKey(floorplanId))

export async function clearAll() {
  await del(KEY_DATA)
  await del(KEY_MODEL)
}
