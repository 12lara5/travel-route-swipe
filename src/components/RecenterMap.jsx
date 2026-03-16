import { useEffect } from "react"
import { useMap } from "react-leaflet"

export default function RecenterMap({ center }) {
  const map = useMap()

  useEffect(() => {
    if (!center) return
    map.setView([center.lat, center.lng], map.getZoom(), { animate: true })
  }, [center, map])

  return null
}