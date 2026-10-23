import type { Lookup } from './lookup'
import { locationFloorplanId, nodeFloorplanId } from './heights'
import type { PlaceLocation, RouteNode } from '../schema/tables'

export type Visibility = 'normal' | 'dim' | 'hidden'

/** アクティブ階との関係から表示状態を決める（屋外要素は常に通常表示） */
export function visibilityFor(
  fp: number | null,
  activeFloorplanId: number | null,
  otherFloors: 'show' | 'dim' | 'hide',
): Visibility {
  if (fp == null || activeFloorplanId == null || fp === activeFloorplanId || otherFloors === 'show') return 'normal'
  return otherFloors === 'dim' ? 'dim' : 'hidden'
}

export const locationVisibility = (lk: Lookup, loc: PlaceLocation, active: number | null, other: 'show' | 'dim' | 'hide') =>
  visibilityFor(locationFloorplanId(lk, loc), active, other)

export const nodeVisibility = (lk: Lookup, n: RouteNode, active: number | null, other: 'show' | 'dim' | 'hide') =>
  visibilityFor(nodeFloorplanId(lk, n), active, other)
