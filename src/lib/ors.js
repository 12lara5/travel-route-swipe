const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4001";

export async function getWalkingRouteLatLng(start, end) {
  const res = await fetch(`${API_URL}/api/route`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ start, end }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Server error ${res.status}: ${txt}`);
  }

  const geo = await res.json();
  return geo.features[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}