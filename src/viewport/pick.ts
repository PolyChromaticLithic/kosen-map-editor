/**
 * クリック判定の優先度を Object3D.userData に入れるキー（Scene の events.filter が参照する）。
 * 0（既定）: マーカー類, 1: 建物モデル, 2: 階のクリック面。小さいほど先に判定する。
 */
export const PICK_PRIORITY_KEY = 'pickPriority'
