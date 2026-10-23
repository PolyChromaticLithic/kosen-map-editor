import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { restoreData, startAutosave, loadModelFile } from './io/persist'
import { collectNodeNames, loadModel } from './io/model'
import { useUi } from './store/uiStore'
import './styles.css'

async function boot() {
  // 前回の作業を復元してから自動保存を開始する
  await restoreData().catch((e) => console.error('restore failed', e))
  startAutosave()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  const file = await loadModelFile().catch(() => undefined)
  if (file) {
    try {
      const { scene } = await loadModel([file])
      useUi.setState({ model: scene, modelFileName: file.name, modelNodeNames: collectNodeNames(scene) })
    } catch (e) {
      console.error('model restore failed', e)
    }
  }
}

void boot()
