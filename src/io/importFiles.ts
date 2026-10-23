import { detectTableFromFileName, detectTableFromHeader, parseTableCsv } from './csv'
import { collectNodeNames, loadModel } from './model'
import { saveModelFile, saveSvg } from './persist'
import { TABLE_LABELS, type TableName, type Tables } from '../schema/tables'
import { useData, type TableSources } from '../store/dataStore'
import { useUi } from '../store/uiStore'
import { useProject } from '../store/projectStore'

const baseName = (p: string) => p.replace(/^.*[\\/]/, '').replace(/[?#].*$/, '')

/** ドロップ/選択されたファイル群を種類ごとに振り分けて取り込む */
export async function importFiles(files: File[]) {
  const ui = useUi.getState()
  const csvs = files.filter((f) => /\.csv$/i.test(f.name))
  const modelFiles = files.filter((f) => /\.(glb|gltf|bin|png|jpe?g|webp|ktx2)$/i.test(f.name))
  const svgs = files.filter((f) => /\.svg$/i.test(f.name))
  const jsons = files.filter((f) => /\.json$/i.test(f.name))

  for (const j of jsons) await importProjectJson(j)

  if (csvs.length) {
    const partial: Partial<Tables> = {}
    const sources: TableSources = {}
    const at = new Date().toISOString()
    const loaded: string[] = []
    for (const f of csvs) {
      const text = await f.text()
      let table = detectTableFromFileName(f.name)
      if (!table) table = detectTableFromHeader(text.split(/\r?\n/)[0].replace(/^﻿/, '').split(','))
      if (!table) {
        ui.notify(`${f.name}: どのテーブルか判別できません（ファイル名をテーブル名にしてください）`, 'error')
        continue
      }
      const res = parseTableCsv(table, text)
      if (res.errors.length) {
        ui.notify(`${f.name}: ${res.errors.slice(0, 3).join(' / ')}${res.errors.length > 3 ? ` 他${res.errors.length - 3}件` : ''}`, 'error')
        if (res.rows.length === 0) continue
      }
      ;(partial as Record<TableName, unknown>)[table] = res.rows
      sources[table] = { file: f.name, rows: res.rows.length, at }
      loaded.push(`${TABLE_LABELS[table]} ${res.rows.length}件`)
    }
    if (loaded.length) {
      useData.getState().loadTables(partial, sources)
      ui.notify(`読み込み: ${loaded.join(', ')}`)
    }
  }

  if (modelFiles.some((f) => /\.(glb|gltf)$/i.test(f.name))) {
    try {
      const { scene, main } = await loadModel(modelFiles)
      useUi.setState({ model: scene, modelFileName: main.name, modelNodeNames: collectNodeNames(scene) })
      if (/\.glb$/i.test(main.name)) await saveModelFile(main)
      ui.notify(`3Dモデルを読み込みました: ${main.name}`)
    } catch (e) {
      ui.notify(`3Dモデルの読み込みに失敗しました: ${(e as Error).message}`, 'error')
    }
  }

  if (svgs.length) {
    const { floorplans } = useData.getState().tables
    let matched = 0
    for (const f of svgs) {
      const hits = floorplans.filter((fp) => baseName(fp.asset_path).toLowerCase() === f.name.toLowerCase())
      for (const fp of hits) {
        await saveSvg(fp.id, await f.text())
        useProject.getState().setSvgFile(fp.id, f.name)
        matched++
      }
      if (!hits.length) ui.notify(`${f.name}: asset_path が一致する平面図がありません（平面図パネルから手動で割り当ててください）`, 'warn')
    }
    if (matched) ui.notify(`平面図SVGを${matched}件割り当てました`)
  }
}

export interface ProjectFile {
  kind: 'kosen-map-editor-project'
  version: 1
  heights: Record<number, number>
  storyHeight: number
  vocab: ReturnType<typeof useProject.getState>['vocab']
  svgFiles: Record<number, string>
}

export function buildProjectJson(): ProjectFile {
  const d = useData.getState()
  const p = useProject.getState()
  return { kind: 'kosen-map-editor-project', version: 1, heights: d.heights, storyHeight: d.storyHeight, vocab: p.vocab, svgFiles: p.svgFiles }
}

async function importProjectJson(f: File) {
  const ui = useUi.getState()
  try {
    const json = JSON.parse(await f.text()) as ProjectFile
    if (json.kind !== 'kosen-map-editor-project') throw new Error('エディターのプロジェクトファイルではありません')
    useData.setState({ storyHeight: json.storyHeight })
    for (const [fp, y] of Object.entries(json.heights)) useData.getState().setHeight(Number(fp), y)
    useProject.setState({ vocab: json.vocab, svgFiles: json.svgFiles })
    ui.notify(`プロジェクト設定を読み込みました: ${f.name}`)
  } catch (e) {
    ui.notify(`${f.name}: ${(e as Error).message}`, 'error')
  }
}
