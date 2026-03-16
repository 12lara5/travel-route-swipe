export function haversineKm(a, b) {
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)

  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)

  const x =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return R * c
}

export function pointOfPoi(p) {
  return { lat: p.lat, lng: p.lng }
}

export function totalLoopKm(start, route) {
  if (!route || route.length === 0) return 0
  let sum = 0
  let prev = start
  for (const p of route) {
    const cur = pointOfPoi(p)
    sum += haversineKm(prev, cur)
    prev = cur
  }
  sum += haversineKm(prev, start)
  return sum
}

export function totalPathKm(start, end, route) {
  // start -> route... -> end
  if (!route || route.length === 0) return end ? haversineKm(start, end) : 0
  let sum = 0
  let prev = start
  for (const p of route) {
    const cur = pointOfPoi(p)
    sum += haversineKm(prev, cur)
    prev = cur
  }
  if (end) sum += haversineKm(prev, end)
  return sum
}