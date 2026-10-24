export const MAP_CLUSTER_DIAMETER_PX = 52
export const MAP_CLUSTER_SPLIT_RATIO = 1.35
export const MAP_CLUSTER_MIN_ZOOM_STEP = 1
export const MAP_SPOT_MAX_ZOOM = 14
export const MAP_CLUSTER_UNSPLITTABLE_PX = 1

export type ProjectedMapSpot = {
  id: string
  x: number
  y: number
}

export type MapSpotCluster = {
  id: string
  members: ProjectedMapSpot[]
  anchorId: string
  diameter: number
}

type WorkingCluster = {
  members: ProjectedMapSpot[]
}

function pointDistance(a: ProjectedMapSpot, b: ProjectedMapSpot) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clusterDiameter(members: ProjectedMapSpot[]) {
  let result = 0
  for (let first = 0; first < members.length; first += 1) {
    for (let second = first + 1; second < members.length; second += 1) result = Math.max(result, pointDistance(members[first], members[second]))
  }
  return result
}

function anchorFor(members: ProjectedMapSpot[]) {
  const center = members.reduce((result, point) => ({ x: result.x + point.x / members.length, y: result.y + point.y / members.length }), { x: 0, y: 0 })
  return [...members].sort((a, b) => pointDistance(a, center as ProjectedMapSpot) - pointDistance(b, center as ProjectedMapSpot) || a.id.localeCompare(b.id))[0].id
}

export function clusterMapSpots(points: ProjectedMapSpot[], maximumDiameter = MAP_CLUSTER_DIAMETER_PX): MapSpotCluster[] {
  const clusters: WorkingCluster[] = []
  const orderedPoints = [...points].sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id))
  for (const point of orderedPoints) {
    let best: { cluster: WorkingCluster; distance: number; tie: string } | undefined
    for (const cluster of clusters) {
      let maximumDistance = 0
      for (const member of cluster.members) {
        maximumDistance = Math.max(maximumDistance, pointDistance(point, member))
        if (maximumDistance > maximumDiameter) break
      }
      if (maximumDistance > maximumDiameter) continue
      const tie = cluster.members.map((member) => member.id).sort().join('|')
      if (!best || maximumDistance < best.distance || (maximumDistance === best.distance && tie < best.tie)) best = { cluster, distance: maximumDistance, tie }
    }
    if (best) best.cluster.members.push(point)
    else clusters.push({ members: [point] })
  }

  return clusters.map(({ members }) => {
    const ids = members.map((point) => point.id).sort()
    return { id: ids.join('|'), members, anchorId: anchorFor(members), diameter: clusterDiameter(members) }
  }).sort((a, b) => a.id.localeCompare(b.id))
}

export function clusterExpansionZoom(currentZoom: number, diameter: number, maximumZoom = MAP_SPOT_MAX_ZOOM) {
  if (diameter <= MAP_CLUSTER_UNSPLITTABLE_PX || currentZoom >= maximumZoom) return undefined
  const scaleNeeded = MAP_CLUSTER_DIAMETER_PX * MAP_CLUSTER_SPLIT_RATIO / diameter
  return Math.min(maximumZoom, Math.max(currentZoom + MAP_CLUSTER_MIN_ZOOM_STEP, currentZoom + Math.log2(Math.max(1, scaleNeeded))))
}
