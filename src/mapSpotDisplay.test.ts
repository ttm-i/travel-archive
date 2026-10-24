import { describe, expect, it } from 'vitest'
import { clusterExpansionZoom, clusterMapSpots, MAP_CLUSTER_DIAMETER_PX } from './mapSpotDisplay'

describe('map spot display clustering', () => {
  it('prevents a chain of nearby spots from becoming one wide cluster', () => {
    const result = clusterMapSpots([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 40, y: 0 },
      { id: 'c', x: 80, y: 0 },
    ], 50)
    expect(result.map((cluster) => cluster.members.map((point) => point.id))).toEqual([['a', 'b'], ['c']])
    expect(Math.max(...result.map((cluster) => cluster.diameter))).toBeLessThanOrEqual(50)
  })

  it('uses the real spot nearest the center as the cluster position', () => {
    const result = clusterMapSpots([
      { id: 'left', x: 0, y: 0 },
      { id: 'middle', x: 20, y: 0 },
      { id: 'right', x: 40, y: 0 },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].anchorId).toBe('middle')
  })

  it('returns the same result regardless of input order', () => {
    const spots = [{ id: 'c', x: 45, y: 2 }, { id: 'a', x: 0, y: 0 }, { id: 'b', x: 20, y: 1 }]
    expect(clusterMapSpots(spots)).toEqual(clusterMapSpots([...spots].reverse()))
  })

  it('calculates a progressive zoom and detects an unsplittable cluster', () => {
    expect(clusterExpansionZoom(6, MAP_CLUSTER_DIAMETER_PX / 2)).toBeGreaterThan(7)
    expect(clusterExpansionZoom(13.5, 20)).toBeLessThanOrEqual(14)
    expect(clusterExpansionZoom(8, 0)).toBeUndefined()
    expect(clusterExpansionZoom(14, 20)).toBeUndefined()
  })
})
