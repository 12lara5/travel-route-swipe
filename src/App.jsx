import { useState, useRef } from "react"
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet"
import RecenterMap from "./components/RecenterMap.jsx"
import { totalLoopKm, totalPathKm } from "./lib/geo.js"
import { getWalkingRouteLatLng } from "./lib/ors"
import { nearestNeighborLoop, nearestNeighborPath, twoOptLoop } from "./lib/route.js"

// API base URL — locally falls back to localhost:4001
// On Vercel: add VITE_API_URL=https://your-app.up.railway.app in environment variables
const API = import.meta.env.VITE_API_URL || "http://localhost:4001"


// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MODES = {
  loop: { label: "🔄 Loop", desc: "Return to start" },
  path: { label: "➡️ Path", desc: "Start → End" },
  free: { label: "🎲 Free", desc: "No location needed" },
}

const CATEGORY_EMOJI = {
  museum: "🏛️", attraction: "⭐", monument: "🗿", church: "⛪",
  castle: "🏰", ruins: "🏚️", archaeological_site: "🔍", gallery: "🖼️",
  viewpoint: "🌄", city_gate: "🚪", landmark: "📍",
}

// ─────────────────────────────────────────────────────────────────────────────
// AddressPicker — type an address, hit Enter or Search, resolves via server
// ─────────────────────────────────────────────────────────────────────────────
function AddressPicker({ label, value, onChange, disabled }) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [resolved, setResolved] = useState(null) // display_name of last resolved address
  const [error, setError] = useState(null)

  async function resolve() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/geocode?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Not found"); return }
      onChange({ lat: data.lat, lng: data.lng })
      setResolved(data.display_name)
      setQuery("")
    } catch {
      setError("Server unreachable")
    } finally {
      setLoading(false)
    }
  }

  function useGPS() {
    if (!navigator.geolocation) { alert("Geolocation not supported"); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setResolved(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`)
      },
      () => alert("Location access denied")
    )
  }

  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          disabled={disabled}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && resolve()}
          placeholder="Type an address…"
          style={{
            flex: 1, padding: "8px 10px", borderRadius: 8,
            border: "1.5px solid #e5e7eb", fontSize: 13,
            background: disabled ? "#f3f4f6" : "#fff",
            outline: "none",
          }}
        />
        <button
          onClick={resolve}
          disabled={disabled || loading}
          style={{ padding: "8px 10px", borderRadius: 8, background: "#6366f1", color: "#fff", border: "none", cursor: "pointer", fontSize: 13 }}
        >
          {loading ? "…" : "🔍"}
        </button>
        <button
          onClick={useGPS}
          disabled={disabled}
          title="Use my GPS location"
          style={{ padding: "8px 10px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none", cursor: "pointer", fontSize: 13 }}
        >
          📍
        </button>
      </div>
      {resolved && !error && (
        <div style={{ fontSize: 11, color: "#10b981", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ✓ {resolved}
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 3 }}>⚠️ {error}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SwipeCard — the tinder card with drag + button swipe
// ─────────────────────────────────────────────────────────────────────────────
function SwipeCard({ poi, onLike, onDislike, cardIndex, total }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, dragging: false })
  const [exiting, setExiting] = useState(null) // "left" | "right" | null
  const startPos = useRef(null)

  const THRESHOLD = 80 // px before it counts as a swipe

  function pointerDown(e) {
    startPos.current = { x: e.clientX, y: e.clientY }
    setDrag({ x: 0, y: 0, dragging: true })
  }

  function pointerMove(e) {
    if (!drag.dragging || !startPos.current) return
    setDrag({
      x: e.clientX - startPos.current.x,
      y: e.clientY - startPos.current.y,
      dragging: true,
    })
  }

  function pointerUp() {
    if (!drag.dragging) return
    if (drag.x > THRESHOLD) triggerExit("right")
    else if (drag.x < -THRESHOLD) triggerExit("left")
    else setDrag({ x: 0, y: 0, dragging: false })
    startPos.current = null
  }

  function triggerExit(dir) {
    setExiting(dir)
    setDrag({ x: 0, y: 0, dragging: false })
    setTimeout(() => {
      setExiting(null)
      if (dir === "right") onLike()
      else onDislike()
    }, 320)
  }

  const rotate = drag.x / 18
  const likeOpacity = Math.min(1, Math.max(0, drag.x / THRESHOLD))
  const nopeOpacity = Math.min(1, Math.max(0, -drag.x / THRESHOLD))

  let transform = `rotate(${rotate}deg) translate(${drag.x}px, ${drag.y * 0.3}px)`
  let transition = drag.dragging ? "none" : "transform 0.2s ease"

  if (exiting === "right") {
    transform = "rotate(20deg) translate(120vw, -20px)"
    transition = "transform 0.32s ease"
  } else if (exiting === "left") {
    transform = "rotate(-20deg) translate(-120vw, -20px)"
    transition = "transform 0.32s ease"
  }

  const emoji = CATEGORY_EMOJI[poi.category] || "📍"

  return (
    <div
      onMouseDown={pointerDown}
      onMouseMove={pointerMove}
      onMouseUp={pointerUp}
      onMouseLeave={pointerUp}
      onTouchStart={(e) => pointerDown(e.touches[0])}
      onTouchMove={(e) => { e.preventDefault(); pointerMove(e.touches[0]) }}
      onTouchEnd={pointerUp}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 420,
        margin: "0 auto",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        background: "#fff",
        cursor: drag.dragging ? "grabbing" : "grab",
        userSelect: "none",
        transform,
        transition,
        touchAction: "none",
      }}
    >
      {/* Photo */}
      <div style={{ position: "relative", height: 340, background: "#e5e7eb" }}>
        {poi.photo ? (
          <img
            src={poi.photo}
            alt={poi.name}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
          />
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72, color: "#9ca3af" }}>
            {emoji}
          </div>
        )}

        {/* Gradient overlay */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 140, background: "linear-gradient(transparent, rgba(0,0,0,0.75))" }} />

        {/* LIKE stamp */}
        <div style={{
          position: "absolute", top: 28, left: 24,
          border: "4px solid #22c55e", color: "#22c55e",
          borderRadius: 8, padding: "4px 14px", fontSize: 28, fontWeight: 800,
          transform: "rotate(-15deg)",
          opacity: likeOpacity,
          pointerEvents: "none",
          textShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }}>
          LIKE
        </div>

        {/* NOPE stamp */}
        <div style={{
          position: "absolute", top: 28, right: 24,
          border: "4px solid #ef4444", color: "#ef4444",
          borderRadius: 8, padding: "4px 14px", fontSize: 28, fontWeight: 800,
          transform: "rotate(15deg)",
          opacity: nopeOpacity,
          pointerEvents: "none",
        }}>
          NOPE
        </div>

        {/* Name on photo */}
        <div style={{ position: "absolute", bottom: 16, left: 18, right: 18 }}>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
            {poi.name}
          </div>
          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 2 }}>
            {emoji} {poi.category}
          </div>
        </div>

        {/* Counter */}
        <div style={{ position: "absolute", top: 14, right: 16, background: "rgba(0,0,0,0.45)", color: "#fff", borderRadius: 20, padding: "3px 10px", fontSize: 12 }}>
          {cardIndex + 1} / {total}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 20, justifyContent: "center", padding: "16px 20px 20px" }}>
        <button
          onClick={() => triggerExit("left")}
          style={{
            width: 62, height: 62, borderRadius: "50%",
            border: "2px solid #fca5a5", background: "#fff",
            fontSize: 26, cursor: "pointer",
            boxShadow: "0 2px 10px rgba(239,68,68,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "transform 0.1s",
          }}
          onMouseDown={(e) => { e.stopPropagation(); e.currentTarget.style.transform = "scale(0.92)" }}
          onMouseUp={(e) => { e.currentTarget.style.transform = "" }}
        >
          👎
        </button>
        <button
          onClick={() => triggerExit("right")}
          style={{
            width: 62, height: 62, borderRadius: "50%",
            border: "2px solid #86efac", background: "#fff",
            fontSize: 26, cursor: "pointer",
            boxShadow: "0 2px 10px rgba(34,197,94,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "transform 0.1s",
          }}
          onMouseDown={(e) => { e.stopPropagation(); e.currentTarget.style.transform = "scale(0.92)" }}
          onMouseUp={(e) => { e.currentTarget.style.transform = "" }}
        >
          👍
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [pois, setPois] = useState([])
  const [city, setCity] = useState("")
  const [loadingCity, setLoadingCity] = useState(false)

  const [index, setIndex] = useState(0)
  const [start, setStart] = useState({ lat: 43.7346, lng: 15.8897 })
  const [end, setEnd] = useState({ lat: 43.7346, lng: 15.8897 })
  const [routeMode, setRouteMode] = useState("loop")

  const [liked, setLiked] = useState([])
  const [disliked, setDisliked] = useState([])

  const [route, setRoute] = useState(null)
  const [totalKm, setTotalKm] = useState(null)
  const [walkLine, setWalkLine] = useState([])
  const [generating, setGenerating] = useState(false)

  const current = pois[index]
  const isEnd = pois.length > 0 && index >= pois.length
  const isModeLocked = liked.length + disliked.length > 0

  const poiDotStyle = { radius: 8, fillColor: "#6366f1", color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.95 }
  const mapCenter = routeMode === "free" && liked.length > 0
    ? { lat: liked[0].lat, lng: liked[0].lng }
    : start

  // ── loadCity ────────────────────────────────────────────────────────────────
  async function loadCity() {
    if (!city.trim()) { alert("Enter a city name"); return }
    try {
      setLoadingCity(true)
      const res = await fetch(`${API}/api/pois?city=${encodeURIComponent(city)}`)
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Failed to load city"); return }

      setPois(data.pois || [])
      setIndex(0)
      setLiked([])
      setDisliked([])
      setRoute(null)
      setTotalKm(null)
      setWalkLine([])

      if (data.city) {
        const center = { lat: data.city.lat, lng: data.city.lng }
        setStart(center)
        setEnd(center)
      }
    } catch (err) {
      console.error(err)
      alert("Failed to load city — is the server running?")
    } finally {
      setLoadingCity(false)
    }
  }

  function like() { setLiked((p) => [...p, current]); setIndex((i) => i + 1) }
  function dislike() { setDisliked((p) => [...p, current]); setIndex((i) => i + 1) }

  function resetAll() {
    setIndex(0)
    setLiked([])
    setDisliked([])
    setRoute(null)
    setTotalKm(null)
    setWalkLine([])
  }

  // ── generate ────────────────────────────────────────────────────────────────
  async function generate() {
    if (liked.length === 0) { setRoute([]); setTotalKm(0); setWalkLine([]); return }
    setGenerating(true)
    try {
      let finalRoute, km, routePoints

      if (routeMode === "loop") {
        finalRoute = twoOptLoop(start, nearestNeighborLoop(start, liked))
        km = totalLoopKm(start, finalRoute)
        routePoints = [start, ...finalRoute, start]
      } else if (routeMode === "path") {
        finalRoute = nearestNeighborPath(start, liked)
        km = totalPathKm(start, end, finalRoute)
        routePoints = [start, ...finalRoute, end]
      } else {
        const s = { lat: liked[0].lat, lng: liked[0].lng }
        if (liked.length === 1) { finalRoute = liked; km = 0; routePoints = [s] }
        else {
          const rest = nearestNeighborPath(s, liked.slice(1))
          finalRoute = [liked[0], ...rest]
          km = totalPathKm(s, { lat: rest.at(-1).lat, lng: rest.at(-1).lng }, rest)
          routePoints = finalRoute.map((p) => ({ lat: p.lat, lng: p.lng }))
        }
      }

      setRoute(finalRoute)
      setTotalKm(km)

      let mergedLine = []
      for (let i = 0; i < routePoints.length - 1; i++) {
        const seg = await getWalkingRouteLatLng(routePoints[i], routePoints[i + 1])
        if (mergedLine.length > 0) seg.shift()
        mergedLine = [...mergedLine, ...seg]
      }
      setWalkLine(mergedLine)
    } catch (err) {
      console.error(err)
      alert("Route generation failed: " + err.message)
    } finally {
      setGenerating(false)
    }
  }

  // ── Shared top bar ───────────────────────────────────────────────────────────
  const TopBar = (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input
        value={city}
        onChange={(e) => setCity(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && loadCity()}
        placeholder="Enter a city, e.g. Split"
        style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 15, outline: "none" }}
      />
      <button
        onClick={loadCity}
        disabled={loadingCity}
        style={{ padding: "10px 18px", borderRadius: 10, background: "#6366f1", color: "#fff", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600 }}
      >
        {loadingCity ? "Loading…" : "Search"}
      </button>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // Screen 1: No city loaded
  // ─────────────────────────────────────────────────────────────────────────────
  if (pois.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 24, padding: 32, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 48 }}>🗺️</div>
            <h1 style={{ margin: "8px 0 4px", fontSize: 26, fontWeight: 800, color: "#1f2937" }}>Travel Route Swipe</h1>
            <p style={{ color: "#6b7280", margin: 0, fontSize: 14 }}>Swipe through attractions, generate your perfect walk</p>
          </div>

          {TopBar}

          {/* Route mode */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Route mode</div>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(MODES).map(([key, { label, desc }]) => (
                <button
                  key={key}
                  onClick={() => setRouteMode(key)}
                  style={{
                    flex: 1, padding: "10px 6px", borderRadius: 10, border: "2px solid",
                    borderColor: routeMode === key ? "#6366f1" : "#e5e7eb",
                    background: routeMode === key ? "#eef2ff" : "#fff",
                    cursor: "pointer", textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, color: routeMode === key ? "#6366f1" : "#374151" }}>{label}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Location pickers */}
          {routeMode !== "free" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <AddressPicker label="🚩 Start" value={start} onChange={setStart} />
              {routeMode === "path" && <AddressPicker label="🏁 End" value={end} onChange={setEnd} />}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Screen 3: Done swiping
  // ─────────────────────────────────────────────────────────────────────────────
  if (isEnd) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 24 }}>🎉 All done!</h2>
        <p style={{ color: "#6b7280", margin: "0 0 16px" }}>Liked <b>{liked.length}</b> out of {pois.length} places</p>

        {TopBar}

        {/* Mode pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {Object.entries(MODES).map(([key, { label }]) => (
            <button key={key} onClick={() => setRouteMode(key)} style={{
              padding: "6px 14px", borderRadius: 20, border: "2px solid",
              borderColor: routeMode === key ? "#6366f1" : "#e5e7eb",
              background: routeMode === key ? "#6366f1" : "#fff",
              color: routeMode === key ? "#fff" : "#374151",
              cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>

        {/* Location pickers */}
        {routeMode !== "free" && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <AddressPicker label="🚩 Start" value={start} onChange={setStart} />
            {routeMode === "path" && <AddressPicker label="🏁 End" value={end} onChange={setEnd} />}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            onClick={generate}
            disabled={generating}
            style={{ padding: "12px 24px", borderRadius: 10, background: "#6366f1", color: "#fff", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 700 }}
          >
            {generating ? "Generating…" : route ? "Re-generate route" : "Generate route"}
          </button>
          <button onClick={resetAll} style={{ padding: "12px 18px", borderRadius: 10, background: "#f3f4f6", color: "#374151", border: "none", cursor: "pointer", fontSize: 15 }}>
            ↩ Swipe again
          </button>
        </div>

        {totalKm !== null && (
          <div style={{ background: "#eef2ff", borderRadius: 10, padding: "10px 16px", marginBottom: 12, fontSize: 14, color: "#4338ca" }}>
            🚶 Total walking distance: <b>{totalKm.toFixed(2)} km</b>
          </div>
        )}

        {route && route.length > 0 && (
          <ol style={{ margin: "0 0 16px", padding: "0 0 0 20px", lineHeight: 2 }}>
            {route.map((p, i) => (
              <li key={`${p.name}-${i}`} style={{ fontSize: 14, color: "#374151" }}>
                {CATEGORY_EMOJI[p.category] || "📍"} {p.name}
              </li>
            ))}
          </ol>
        )}

        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={13}
          style={{ height: 400, width: "100%", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
        >
          <RecenterMap center={mapCenter} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {routeMode !== "free" && <Marker position={[start.lat, start.lng]}><Popup>Start</Popup></Marker>}
          {routeMode === "path" && <Marker position={[end.lat, end.lng]}><Popup>End</Popup></Marker>}
          {route?.map((p, i) => (
            <CircleMarker key={`${p.name}-${i}`} center={[p.lat, p.lng]} pathOptions={poiDotStyle} radius={8}>
              <Popup>{p.name}</Popup>
            </CircleMarker>
          ))}
          {walkLine.length > 1 && <Polyline positions={walkLine} color="#6366f1" weight={4} opacity={0.8} />}
        </MapContainer>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Screen 2: Swiping
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "16px 16px 24px", fontFamily: "system-ui" }}>
      {TopBar}

      {/* Mode + location row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {Object.entries(MODES).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => !isModeLocked && setRouteMode(key)}
            title={isModeLocked ? "Locked while swiping" : ""}
            style={{
              padding: "5px 12px", borderRadius: 20, border: "2px solid",
              borderColor: routeMode === key ? "#6366f1" : "#e5e7eb",
              background: routeMode === key ? "#6366f1" : "#fff",
              color: routeMode === key ? "#fff" : "#374151",
              cursor: isModeLocked ? "default" : "pointer",
              opacity: isModeLocked && routeMode !== key ? 0.4 : 1,
              fontSize: 12, fontWeight: 600,
            }}
          >{label}</button>
        ))}
      </div>

      {routeMode !== "free" && !isModeLocked && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <AddressPicker label="🚩 Start" value={start} onChange={setStart} />
          {routeMode === "path" && <AddressPicker label="🏁 End" value={end} onChange={setEnd} />}
        </div>
      )}

      {/* Swipe card */}
      <SwipeCard
        poi={current}
        onLike={like}
        onDislike={dislike}
        cardIndex={index}
        total={pois.length}
      />

      {/* Score bar */}
      <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 14, fontSize: 14, color: "#6b7280" }}>
        <span>👍 {liked.length}</span>
        <span>👎 {disliked.length}</span>
        <span>📍 {pois.length - index} left</span>
      </div>

      {/* Mini map */}
      <MapContainer
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={14}
        style={{ height: 220, width: "100%", marginTop: 16, borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.1)" }}
      >
        <RecenterMap center={mapCenter} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {routeMode !== "free" && <Marker position={[start.lat, start.lng]}><Popup>Start</Popup></Marker>}
        <CircleMarker center={[current.lat, current.lng]} pathOptions={{ ...poiDotStyle, fillColor: "#ef4444" }} radius={11}>
          <Popup>{current.name}</Popup>
        </CircleMarker>
        {liked.map((p, i) => (
          <CircleMarker key={`${p.name}-${i}`} center={[p.lat, p.lng]} pathOptions={poiDotStyle} radius={8}>
            <Popup>{p.name}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
