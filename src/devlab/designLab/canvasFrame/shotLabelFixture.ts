export type ShotLabelFixture = {
  kind: 'empty' | 'image' | 'video' | 'scene'
  zoom: number
  selected: boolean
  details?: boolean
}

/** Drives the mounted laboratory host, keeping its store instance authoritative. */
export function setShotLabelFixture(detail: ShotLabelFixture): void {
  window.dispatchEvent(new CustomEvent('nomi-label-fixture', { detail }))
}
