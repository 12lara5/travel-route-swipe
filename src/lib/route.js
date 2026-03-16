import { haversineKm, pointOfPoi, totalLoopKm } from "./geo.js"

export function nearestNeighborLoop(start, liked) {
  const unvisited = [...liked]
  const route = []
  let cur = start

  while (unvisited.length > 0) {
    let bestIdx = 0
    let bestDist = haversineKm(cur, pointOfPoi(unvisited[0]))

    for (let i = 1; i < unvisited.length; i++) {
      const d = haversineKm(cur, pointOfPoi(unvisited[i]))
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }

    const nextPoi = unvisited.splice(bestIdx, 1)[0]
    route.push(nextPoi)
    cur = pointOfPoi(nextPoi)
  }

  return route
}

export function nearestNeighborPath(start, liked) {
  // same as NN loop but without closing; end handling is in distance calc
  const unvisited = [...liked]
  const route = []
  let cur = start

  while (unvisited.length > 0) {
    let bestIdx = 0
    let bestDist = haversineKm(cur, pointOfPoi(unvisited[0]))

    for (let i = 1; i < unvisited.length; i++) {
      const d = haversineKm(cur, pointOfPoi(unvisited[i]))
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }

    const nextPoi = unvisited.splice(bestIdx, 1)[0]
    route.push(nextPoi)
    cur = pointOfPoi(nextPoi)
  }

  return route
}

function reverseSegment(arr, i, k) {
  const copy = [...arr]
  while (i < k) {
    const tmp = copy[i]
    copy[i] = copy[k]
    copy[k] = tmp
    i++
    k--
  }
  return copy
}

export function twoOptLoop(start, route) {
  if (!route || route.length < 4) return route || []

  let best = route
  let bestLen = totalLoopKm(start, best)
  let improved = true

  while (improved) {
    improved = false

    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = reverseSegment(best, i, k)
        const candLen = totalLoopKm(start, candidate)
        if (candLen + 1e-9 < bestLen) {
          best = candidate
          bestLen = candLen
          improved = true
        }
      }
    }
  }

  return best
}