import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { Group } from 'three'

let loader: GLTFLoader | null = null

function getLoader() {
  if (!loader) {
    const draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
    loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder)
  }
  return loader
}

/**
 * GLB または .gltf を読み込む。
 * .gltf の外部 .bin / テクスチャは一緒に選択されたファイルから解決する。
 */
export async function loadModel(files: File[]): Promise<{ scene: Group; main: File }> {
  const main = files.find((f) => /\.(glb|gltf)$/i.test(f.name))
  if (!main) throw new Error('.glb / .gltf ファイルが選択されていません')
  const urls = new Map<string, string>()
  for (const f of files) urls.set(f.name, URL.createObjectURL(f))
  const manager = getLoader().manager
  manager.setURLModifier((url) => {
    const name = decodeURIComponent(url.replace(/^.*[\\/]/, ''))
    return urls.get(name) ?? url
  })
  try {
    const buf = await main.arrayBuffer()
    const gltf = await getLoader().parseAsync(buf, '')
    return { scene: gltf.scene, main }
  } finally {
    manager.setURLModifier(undefined)
    // テクスチャはparse中に読み込み済み
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 5000)
  }
}

export function collectNodeNames(root: Group): string[] {
  const names = new Set<string>()
  root.traverse((o) => {
    if (o.name) names.add(o.name)
  })
  return [...names].sort()
}
