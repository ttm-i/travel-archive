type SnapshotKind = 'trip' | 'spot' | 'prefecture'

const snapshots = new Map<string, unknown>()
const MAX_SNAPSHOTS = 40

function key(kind: SnapshotKind, id: string | number) {
  return `${kind}:${id}`
}

export function getNavigationSnapshot<T>(kind: SnapshotKind, id: string | number) {
  const snapshotKey = key(kind, id)
  const value = snapshots.get(snapshotKey) as T | undefined
  if (value !== undefined) {
    snapshots.delete(snapshotKey)
    snapshots.set(snapshotKey, value)
  }
  return value
}

export function setNavigationSnapshot<T>(kind: SnapshotKind, id: string | number, value: T) {
  const snapshotKey = key(kind, id)
  snapshots.delete(snapshotKey)
  snapshots.set(snapshotKey, value)
  while (snapshots.size > MAX_SNAPSHOTS) {
    const oldest = snapshots.keys().next().value as string | undefined
    if (!oldest) break
    snapshots.delete(oldest)
  }
}

export function mergeNavigationSnapshot<T extends object>(kind: SnapshotKind, id: string | number, value: Partial<T>) {
  const current = getNavigationSnapshot<T>(kind, id)
  setNavigationSnapshot(kind, id, { ...current, ...value } as T)
}

export function clearNavigationSnapshots() {
  snapshots.clear()
}
