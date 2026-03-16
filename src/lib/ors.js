export async function getWalkingRouteLatLng(start, end) {
  const key = import.meta.env.VITE_ORS_KEY
  if (!key) throw new Error("Missing VITE_ORS_KEY")

  const res = await fetch(
    "https://api.openrouteservice.org/v2/directions/foot-hiking/geojson",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: key,
      },
      body: JSON.stringify({
        coordinates: [
          [start.lng, start.lat],
          [end.lng, end.lat],
        ],
      }),
    }
  )

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`ORS error ${res.status}: ${txt}`)
  }

  const geo = await res.json()
  return geo.features[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
}