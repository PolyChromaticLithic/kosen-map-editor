// fixtures/test-campus.glb を生成する（箱を並べただけの検証用モデル）。
// ノード名は fixtures/buildings_rows.csv の model_object_name と一致させている。
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const out = fileURLToPath(new URL('../fixtures/test-campus.glb', import.meta.url))

// 単位立方体 (0..1)。面ごとに頂点を分けて法線を持たせる
const faces = [
  { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
]
const pos = [], nor = [], idx = []
faces.forEach((f, i) => {
  for (const v of f.v) pos.push(...v), nor.push(...f.n)
  const b = i * 4
  idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
})
const posBuf = Buffer.from(new Float32Array(pos).buffer)
const norBuf = Buffer.from(new Float32Array(nor).buffer)
const idxBuf = Buffer.from(new Uint16Array(idx).buffer)
const bin = Buffer.concat([posBuf, norBuf, idxBuf])

const materials = [
  { name: 'wall', pbrMetallicRoughness: { baseColorFactor: [0.82, 0.8, 0.75, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
  { name: 'gym', pbrMetallicRoughness: { baseColorFactor: [0.6, 0.72, 0.85, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
  { name: 'ground', pbrMetallicRoughness: { baseColorFactor: [0.35, 0.55, 0.3, 1], metallicFactor: 0, roughnessFactor: 1 } },
]
const meshes = materials.map((m, i) => ({
  name: `box_${m.name}`,
  primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: i }],
}))
const nodes = [
  { name: 'Ground', mesh: 2, translation: [-20, -0.2, -20], scale: [140, 0.2, 120] },
  { name: 'Building_1', mesh: 0, translation: [0, 0, 0], scale: [30, 7.2, 12] },
  { name: 'Building_2', mesh: 0, translation: [0, 0, 30], scale: [30, 7.2, 12] },
  { name: 'Gym', mesh: 1, translation: [50, 0, 0], scale: [30, 10, 25] },
]

const gltf = {
  asset: { version: '2.0', generator: 'kosen-map-editor fixtures' },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes,
  materials,
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
    { buffer: 0, byteOffset: posBuf.length, byteLength: norBuf.length, target: 34962 },
    { buffer: 0, byteOffset: posBuf.length + norBuf.length, byteLength: idxBuf.length, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] },
    { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
  ],
}

const pad = (buf, fill) => (buf.length % 4 ? Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4), fill)]) : buf)
const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20)
const binP = pad(bin, 0)
const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + json.length + 8 + binP.length, 8)
const chunk = (type, data) => {
  const h = Buffer.alloc(8)
  h.writeUInt32LE(data.length, 0)
  h.writeUInt32LE(type, 4)
  return Buffer.concat([h, data])
}
writeFileSync(out, Buffer.concat([header, chunk(0x4e4f534a, json), chunk(0x004e4942, binP)]))
console.log('wrote', out)
