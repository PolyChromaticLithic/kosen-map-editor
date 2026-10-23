import { useRef } from 'react'
import { Canvas, events as createPointerEvents, type ThreeEvent } from '@react-three/fiber'
import type * as THREE from 'three'
import { Grid, MapControls, GizmoHelper } from '@react-three/drei'
import { useUi } from '../store/uiStore'
import { useData } from '../store/dataStore'
import { ModelLayer } from './ModelLayer'
import { AccessLinks, LocationMarkers, RouteEdges, RouteNodes } from './Markers'
import { Gizmo } from './Gizmo'
import { Labels, LabelLegend } from './Labels'
import { CameraRig, ViewGizmo } from './CameraRig'
import { DropProbe } from './PlaceDrop'
import { PICK_PRIORITY_KEY } from './pick'
import { addNodeAt, placeActivePlaceAt } from './actions'

/**
 * ノード・場所・エッジなどのマーカーを、手前にある建物モデルより先に拾う
 * （建物の中と外のノードを結ぶとき、モデルに判定を取られないように）。
 */
function pickPriority(o: THREE.Object3D | null): number {
  for (let x = o; x; x = x.parent) {
    const p = x.userData[PICK_PRIORITY_KEY]
    if (typeof p === 'number') return p
  }
  return 0
}
const pointerEvents: typeof createPointerEvents = (store) => ({
  ...createPointerEvents(store),
  // 優先度順（同じ優先度の中では近い順のまま）に並べ替える
  filter: (items) =>
    items
      .map((it, i) => ({ it, i, p: pickPriority(it.object) }))
      .sort((a, b) => a.p - b.p || a.i - b.i)
      .map((x) => x.it),
})

function handleSurfaceClick(e: ThreeEvent<MouseEvent>, source: 'model' | 'plane') {
  if (e.delta >= 4) return
  const ui = useUi.getState()
  // 屋内階で作業中はモデル表面ではなく階の平面で位置を決める
  if (source === 'model' && ui.activeFloorplanId != null) return
  e.stopPropagation()
  const p = e.point
  if (ui.tool === 'place') placeActivePlaceAt(p)
  else if (ui.tool === 'node') {
    const from = e.shiftKey && ui.selection?.kind === 'node' ? ui.selection.id : null
    addNodeAt(p, from)
  } else if (ui.tool === 'select') ui.select(null)
  else if (ui.tool === 'edge') useUi.setState({ edgeFrom: null })
}

function FloorPlane() {
  const activeFp = useUi((s) => s.activeFloorplanId)
  const h = useData((s) => (activeFp != null ? s.heights[activeFp] ?? 0 : 0))
  const indoor = activeFp != null
  return (
    <group position={[0, h, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} userData={{ [PICK_PRIORITY_KEY]: 2 }} onClick={(e) => handleSurfaceClick(e, 'plane')}>
        <planeGeometry args={[20000, 20000]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={indoor ? 0.06 : 0} depthWrite={false} />
      </mesh>
      <Grid
        position={[0, 0.01, 0]}
        infiniteGrid
        cellSize={1}
        sectionSize={10}
        cellColor={indoor ? '#3b82f6' : '#475569'}
        sectionColor={indoor ? '#1d4ed8' : '#334155'}
        fadeDistance={400}
        cellThickness={0.5}
        sectionThickness={1}
      />
    </group>
  )
}

export function Scene() {
  const tool = useUi((s) => s.tool)
  const labelLayer = useRef<HTMLDivElement>(null)
  return (
    <>
      <Canvas
        events={pointerEvents}
        camera={{ position: [60, 80, 60], fov: 50, near: 0.1, far: 10000 }}
        className={`viewport tool-${tool}`}
        onPointerMissed={(e) => {
          if (e.type !== 'click') return
          const ui = useUi.getState()
          if (ui.tool === 'select') ui.select(null)
          if (ui.tool === 'edge') useUi.setState({ edgeFrom: null })
        }}
      >
        <color attach="background" args={['#0f172a']} />
        <hemisphereLight args={['#ffffff', '#334155', 1.2]} />
        <directionalLight position={[100, 200, 80]} intensity={1.5} />
        <CameraRig />
        <DropProbe />
        <MapControls makeDefault screenSpacePanning={false} maxPolarAngle={Math.PI * 0.49} />
        <ModelLayer onSurfaceClick={(e) => handleSurfaceClick(e, 'model')} />
        <FloorPlane />
        <RouteEdges />
        <RouteNodes />
        <LocationMarkers />
        <AccessLinks />
        <Gizmo />
        <Labels container={labelLayer} />
        <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
          <ViewGizmo />
        </GizmoHelper>
      </Canvas>
      <div ref={labelLayer} className="label-layer" />
      <LabelLegend />
    </>
  )
}
