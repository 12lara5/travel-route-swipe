import { useState, useRef } from "react"
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet"
import RecenterMap from "./components/RecenterMap.jsx"
import { totalLoopKm, totalPathKm } from "./lib/geo.js"
import { getWalkingRouteLatLng } from "./lib/ors"
import { nearestNeighborLoop, nearestNeighborPath, twoOptLoop } from "./lib/route.js"

const API = import.meta.env.VITE_API_URL || "http://localhost:4001"

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#f2f2f7",
  card: "#ffffff",
  primary: "#007aff",
  primaryLight: "#e8f0fe",
  green: "#34c759",
  red: "#ff3b30",
  label: "#1c1c1e",
  secondary: "#6b7280",
  border: "rgba(0,0,0,0.08)",
  shadow: "0 2px 20px rgba(0,0,0,0.08)",
  shadowMd: "0 8px 32px rgba(0,0,0,0.14)",
}

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif"

// ─── Route modes ──────────────────────────────────────────────────────────────
const MODES = {
  loop: { label: "Loop", icon: "🔄", desc: "Return to start" },
  path: { label: "Path", icon: "➡️", desc: "Start → End" },
  free: { label: "Free", icon: "🎲", desc: "No location" },
}

// ─── Category filters — chosen on splash BEFORE search ───────────────────────
const CATEGORY_FILTERS = [
  { id: "all",        label: "Everything",  icon: "✨" },
  { id: "attraction", label: "Attractions", icon: "⭐" },
  { id: "museum",     label: "Museums",     icon: "🏛️" },
  { id: "church",     label: "Churches",    icon: "⛪" },
  { id: "nature",     label: "Nature",      icon: "🌿" },
  { id: "beach",      label: "Beaches",     icon: "🏖️" },
]

function matchesFilter(poi, filterId) {
  if (filterId === "all") return true
  const cat = (poi.category || "").toLowerCase()
  if (filterId === "nature")     return cat.includes("park") || cat.includes("nature") || cat.includes("hiking") || cat.includes("garden") || cat.includes("reserve")
  if (filterId === "beach")      return cat.includes("beach") || cat.includes("marina")
  if (filterId === "church")     return cat.includes("church") || cat.includes("mosque") || cat.includes("synagogue") || cat.includes("temple") || cat.includes("cathedral")
  if (filterId === "museum")     return cat.includes("museum") || cat.includes("gallery") || cat.includes("art")
  if (filterId === "attraction") return cat.includes("tourist") || cat.includes("landmark") || cat.includes("monument") || cat.includes("castle") || cat.includes("historical") || cat.includes("cultural") || cat.includes("amphitheatre")
  return true
}

const CATEGORY_EMOJI = {
  "tourist attraction": "⭐", museum: "🏛️", "art gallery": "🖼️",
  church: "⛪", mosque: "🕌", synagogue: "🕍", "hindu temple": "🛕",
  "historical landmark": "🏛️", "cultural landmark": "🏺", monument: "🗿",
  castle: "🏰", "national park": "🌲", amphitheatre: "🎭",
  beach: "🏖️", park: "🌳", "nature reserve": "🌿", hiking: "🥾",
}

function categoryEmoji(cat) {
  const c = (cat || "").toLowerCase()
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJI)) {
    if (c.includes(key)) return emoji
  }
  return "📍"
}

// ─── Pill button ──────────────────────────────────────────────────────────────
function Pill({ active, onClick, children, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? "5px 12px" : "7px 16px", borderRadius: 20, border: "none",
      cursor: disabled ? "default" : "pointer",
      background: active ? C.primary : C.card,
      color: active ? "#fff" : C.label,
      fontSize: small ? 12 : 13, fontWeight: 600,
      boxShadow: active ? "none" : C.shadow,
      opacity: disabled && !active ? 0.35 : 1,
      transition: "all 0.15s ease", whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  )
}

// ─── AddressPicker with confirmation ─────────────────────────────────────────
// Shows a green confirmed state with the resolved name so user knows it worked.
function AddressPicker({ label, onConfirm, dark = false }) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(null)  // { name, lat, lng }
  const [error, setError] = useState(null)

  const inputStyle = {
    flex: 1, padding: "10px 14px", borderRadius: 12, fontSize: 14, outline: "none",
    border: confirmed ? `1.5px solid ${C.green}` : `1.5px solid ${dark ? "rgba(255,255,255,0.2)" : C.border}`,
    background: dark ? "rgba(255,255,255,0.1)" : confirmed ? "#f0fdf4" : C.bg,
    color: dark ? "#fff" : C.label,
  }

  async function resolve(q) {
    if (!q.trim()) return
    setLoading(true); setError(null); setConfirmed(null)
    try {
      const res = await fetch(`${API}/api/geocode?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) { setError("Not found"); return }
      setConfirmed({ name: data.display_name, lat: data.lat, lng: data.lng })
      setQuery("")
      onConfirm({ lat: data.lat, lng: data.lng })
    } catch { setError("Server unreachable") }
    finally { setLoading(false) }
  }

  function useGPS() {
    if (!navigator.geolocation) { alert("Geolocation not supported"); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setConfirmed({ name: `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`, ...loc })
        setQuery("")
        onConfirm(loc)
      },
      () => setError("Location access denied")
    )
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: dark ? "rgba(255,255,255,0.45)" : C.secondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </div>

      {/* Confirmed state — shows what was set with option to change */}
      {confirmed ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 12, background: dark ? "rgba(52,199,89,0.15)" : "#f0fdf4", border: `1.5px solid ${C.green}` }}>
          <span style={{ fontSize: 14 }}>✅</span>
          <span style={{ flex: 1, fontSize: 13, color: dark ? "#a7f3d0" : "#166534", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {confirmed.name}
          </span>
          <button onClick={() => { setConfirmed(null); setQuery("") }} style={{ fontSize: 11, color: dark ? "rgba(255,255,255,0.5)" : C.secondary, background: "none", border: "none", cursor: "pointer", padding: "2px 4px", whiteSpace: "nowrap" }}>
            Change
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && resolve(query)}
            placeholder="Type an address or place…"
            style={inputStyle}
          />
          <button onClick={() => resolve(query)} disabled={loading} style={{ padding: "10px 13px", borderRadius: 12, background: C.primary, color: "#fff", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600 }}>
            {loading ? "…" : "→"}
          </button>
          <button onClick={useGPS} title="Use GPS" style={{ padding: "10px 13px", borderRadius: 12, background: dark ? "rgba(52,199,89,0.2)" : "#f0fdf4", color: C.green, border: `1.5px solid ${dark ? "rgba(52,199,89,0.3)" : C.green}`, cursor: "pointer", fontSize: 15 }}>
            📍
          </button>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>⚠ {error}</div>}
    </div>
  )
}

// ─── SwipeCard ────────────────────────────────────────────────────────────────
function SwipeCard({ poi, onLike, onDislike, cardIndex, total }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, dragging: false })
  const [exiting, setExiting] = useState(null)
  const startPos = useRef(null)
  const THRESHOLD = 80

  function pointerDown(e) { startPos.current = { x: e.clientX, y: e.clientY }; setDrag({ x: 0, y: 0, dragging: true }) }
  function pointerMove(e) {
    if (!drag.dragging || !startPos.current) return
    setDrag({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y, dragging: true })
  }
  function pointerUp() {
    if (!drag.dragging) return
    if (drag.x > THRESHOLD) triggerExit("right")
    else if (drag.x < -THRESHOLD) triggerExit("left")
    else setDrag({ x: 0, y: 0, dragging: false })
    startPos.current = null
  }
  function triggerExit(dir) {
    setExiting(dir); setDrag({ x: 0, y: 0, dragging: false })
    setTimeout(() => { setExiting(null); dir === "right" ? onLike() : onDislike() }, 300)
  }

  const rotate = drag.x / 20
  const likeOp = Math.min(1, Math.max(0, drag.x / THRESHOLD))
  const nopeOp = Math.min(1, Math.max(0, -drag.x / THRESHOLD))
  let transform = `rotate(${rotate}deg) translate(${drag.x}px, ${drag.y * 0.25}px)`
  let transition = drag.dragging ? "none" : "transform 0.2s cubic-bezier(0.25,0.46,0.45,0.94)"
  if (exiting === "right") { transform = "rotate(22deg) translate(130vw, -30px)"; transition = "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)" }
  if (exiting === "left")  { transform = "rotate(-22deg) translate(-130vw, -30px)"; transition = "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)" }

  const emoji = categoryEmoji(poi.category)

  return (
    <div
      onMouseDown={pointerDown} onMouseMove={pointerMove} onMouseUp={pointerUp} onMouseLeave={pointerUp}
      onTouchStart={(e) => pointerDown(e.touches[0])}
      onTouchMove={(e) => { e.preventDefault(); pointerMove(e.touches[0]) }}
      onTouchEnd={pointerUp}
      style={{ position: "relative", width: "100%", maxWidth: 400, margin: "0 auto", borderRadius: 24, overflow: "hidden", boxShadow: C.shadowMd, background: C.card, cursor: drag.dragging ? "grabbing" : "grab", userSelect: "none", transform, transition, touchAction: "none" }}
    >
      <div style={{ position: "relative", height: 340, background: C.bg }}>
        {poi.photo
          ? <img src={poi.photo} alt={poi.name} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />
          : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80, color: "#d1d5db" }}>{emoji}</div>
        }
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, transparent 35%, rgba(0,0,0,0.62) 100%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 32, left: 20, border: "3px solid #34c759", color: "#34c759", borderRadius: 10, padding: "4px 16px", fontSize: 26, fontWeight: 800, transform: "rotate(-15deg)", opacity: likeOp, pointerEvents: "none" }}>LIKE</div>
        <div style={{ position: "absolute", top: 32, right: 20, border: "3px solid #ff3b30", color: "#ff3b30", borderRadius: 10, padding: "4px 16px", fontSize: 26, fontWeight: 800, transform: "rotate(15deg)", opacity: nopeOp, pointerEvents: "none" }}>NOPE</div>
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.38)", backdropFilter: "blur(8px)", color: "#fff", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
          {cardIndex + 1} / {total}
        </div>
        <div style={{ position: "absolute", bottom: 14, left: 16, right: 16, pointerEvents: "none" }}>
          <div style={{ color: "#fff", fontSize: 21, fontWeight: 700, lineHeight: 1.25, textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>{poi.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ color: "rgba(255,255,255,0.82)", fontSize: 13 }}>{emoji} {poi.category}</span>
            {poi.rating && <span style={{ color: "#fbbf24", fontSize: 13, fontWeight: 600 }}>★ {poi.rating.toFixed(1)}</span>}
            {poi.reviews && <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>({poi.reviews.toLocaleString()})</span>}
          </div>
          {poi.description && (
            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {poi.description}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, justifyContent: "center", alignItems: "center", padding: "14px 24px 18px", background: C.card }}>
        <button onClick={(e) => { e.stopPropagation(); triggerExit("left") }}
          style={{ width: 56, height: 56, borderRadius: "50%", border: "none", background: "#fff2f2", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 12px rgba(255,59,48,0.18)", transition: "transform 0.12s" }}
          onMouseDown={(e) => { e.stopPropagation(); e.currentTarget.style.transform = "scale(0.88)" }}
          onMouseUp={(e) => e.currentTarget.style.transform = ""}>👎</button>
        <button onClick={(e) => { e.stopPropagation(); triggerExit("right") }}
          style={{ width: 56, height: 56, borderRadius: "50%", border: "none", background: "#f0fdf4", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 12px rgba(52,199,89,0.18)", transition: "transform 0.12s" }}
          onMouseDown={(e) => { e.stopPropagation(); e.currentTarget.style.transform = "scale(0.88)" }}
          onMouseUp={(e) => e.currentTarget.style.transform = ""}>👍</button>
      </div>
    </div>
  )
}

// ─── Route summary horizontal scroll ──────────────────────────────────────────
function RouteSummary({ route }) {
  if (!route?.length) return null
  return (
    <div style={{ overflowX: "auto", display: "flex", gap: 10, paddingBottom: 4, scrollbarWidth: "none" }}>
      {route.map((p, i) => (
        <div key={`${p.name}-${i}`} style={{ flexShrink: 0, background: C.card, borderRadius: 14, padding: "10px 14px", boxShadow: C.shadow, display: "flex", alignItems: "center", gap: 10, minWidth: 155, maxWidth: 200 }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.label, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
            <div style={{ fontSize: 11, color: C.secondary, marginTop: 1 }}>{categoryEmoji(p.category)} {p.category}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Generate route panel — shown DURING swiping ──────────────────────────────
function GeneratePanel({ liked, generating, onGenerate }) {
  if (liked.length === 0) return null
  return (
    <div style={{ background: C.card, borderRadius: 18, padding: "14px 16px", marginTop: 14, boxShadow: C.shadow, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.label }}>
          {liked.length} place{liked.length !== 1 ? "s" : ""} liked
        </div>
        <div style={{ fontSize: 12, color: C.secondary, marginTop: 1 }}>Ready to generate your route</div>
      </div>
      <button
        onClick={onGenerate}
        disabled={generating}
        style={{ padding: "10px 18px", borderRadius: 12, background: generating ? C.secondary : C.primary, color: "#fff", border: "none", cursor: generating ? "default" : "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 2px 10px rgba(0,122,255,0.25)" }}
      >
        {generating ? "…" : "Generate route →"}
      </button>
    </div>
  )
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // Splash state — set before first search
  const [splashDone, setSplashDone] = useState(false)
  const [splashCategories, setSplashCategories] = useState(new Set(["all"]))
  const [splashMode, setSplashMode] = useState("loop")
  const [splashStart, setSplashStart] = useState(null)   // { lat, lng } or null
  const [splashEnd, setSplashEnd] = useState(null)

  const [allPois, setAllPois] = useState([])
  const [city, setCity] = useState("")
  const [loadingCity, setLoadingCity] = useState(false)

  const [index, setIndex] = useState(0)
  const [start, setStart] = useState({ lat: 43.7346, lng: 15.8897 })
  const [end, setEnd] = useState({ lat: 43.7346, lng: 15.8897 })
  const [routeMode, setRouteMode] = useState("loop")
  const [activeCategories, setActiveCategories] = useState(new Set(["all"]))

  const [liked, setLiked] = useState([])
  const [disliked, setDisliked] = useState([])

  const [route, setRoute] = useState(null)
  const [totalKm, setTotalKm] = useState(null)
  const [walkLine, setWalkLine] = useState([])
  const [generating, setGenerating] = useState(false)
  const [showRoute, setShowRoute] = useState(false)  // jump to route view mid-swipe

  const pois = allPois.filter((p) => activeCategories.has('all') || [...activeCategories].some(f => matchesFilter(p, f)))
  const current = pois[index]
  const isEnd = pois.length > 0 && index >= pois.length
  const isModeLocked = liked.length + disliked.length > 0

  const poiDotStyle = { radius: 8, fillColor: C.primary, color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.95 }
  const mapCenter = routeMode === "free" && liked.length > 0 ? { lat: liked[0].lat, lng: liked[0].lng } : start

  async function loadCity() {
    if (!city.trim()) { alert("Enter a city name"); return }
    try {
      setLoadingCity(true)
      const res = await fetch(`${API}/api/pois?city=${encodeURIComponent(city)}`)
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Failed to load city"); return }

      // Apply splash settings
      setRouteMode(splashMode)
      setActiveCategories(new Set(splashCategories))
      if (splashStart) { setStart(splashStart) } else if (data.city) { setStart({ lat: data.city.lat, lng: data.city.lng }) }
      if (splashEnd) { setEnd(splashEnd) } else if (data.city) { setEnd({ lat: data.city.lat, lng: data.city.lng }) }

      setAllPois(data.pois || [])
      setIndex(0); setLiked([]); setDisliked([])
      setRoute(null); setTotalKm(null); setWalkLine([])
      setShowRoute(false)
      setSplashDone(true)
    } catch { alert("Failed to load city — is the server running?") }
    finally { setLoadingCity(false) }
  }

  function like() { setLiked((p) => [...p, current]); setIndex((i) => i + 1) }
  function dislike() { setDisliked((p) => [...p, current]); setIndex((i) => i + 1) }

  function resetAll() {
    setIndex(0); setLiked([]); setDisliked([])
    setRoute(null); setTotalKm(null); setWalkLine([])
    setShowRoute(false)
    setSplashDone(false) // go back to splash to reconfigure
  }

  async function generate() {
    if (liked.length === 0) { setRoute([]); setTotalKm(0); setWalkLine([]); setShowRoute(true); return }
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
      setRoute(finalRoute); setTotalKm(km); setShowRoute(true)
      let mergedLine = []
      for (let i = 0; i < routePoints.length - 1; i++) {
        const seg = await getWalkingRouteLatLng(routePoints[i], routePoints[i + 1])
        if (mergedLine.length > 0) seg.shift()
        mergedLine = [...mergedLine, ...seg]
      }
      setWalkLine(mergedLine)
    } catch (err) { alert("Route generation failed: " + err.message) }
    finally { setGenerating(false) }
  }

  // Shared sticky header with city search
  const Header = (
    <div style={{ background: C.card, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadCity()}
          placeholder="Search a city…"
          style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "none", fontSize: 15, outline: "none", background: C.bg }} />
        <button onClick={loadCity} disabled={loadingCity}
          style={{ padding: "10px 18px", borderRadius: 12, background: C.primary, color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
          {loadingCity ? "…" : "Go"}
        </button>
      </div>
    </div>
  )

  // ── Screen 1: Splash — pick categories + mode BEFORE searching ───────────────
  if (!splashDone) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: FONT }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ fontSize: 60, marginBottom: 10 }}>🗺️</div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>RouteSwipe</h1>
            <p style={{ color: "rgba(255,255,255,0.45)", margin: "8px 0 0", fontSize: 15 }}>Swipe. Like. Explore.</p>
          </div>

          <div style={{ background: "rgba(255,255,255,0.07)", backdropFilter: "blur(20px)", borderRadius: 24, padding: 22, border: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* 1. City search */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>City</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadCity()}
                  placeholder="e.g. Split, Dubrovnik, Paris…"
                  style={{ flex: 1, padding: "12px 16px", borderRadius: 14, border: "none", fontSize: 15, outline: "none", background: "rgba(255,255,255,0.12)", color: "#fff", caretColor: C.primary }} />
                <button onClick={loadCity} disabled={loadingCity}
                  style={{ padding: "12px 20px", borderRadius: 14, background: C.primary, color: "#fff", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 700 }}>
                  {loadingCity ? "…" : "→"}
                </button>
              </div>
            </div>

            {/* 2. Category filter — chosen before search */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                What do you want to see?
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CATEGORY_FILTERS.map((f) => {
                  const isActive = splashCategories.has(f.id)
                  return (
                    <button key={f.id} onClick={() => {
                      setSplashCategories(prev => {
                        const next = new Set(prev)
                        if (f.id === "all") return new Set(["all"])
                        next.delete("all") // deselect "all" when picking specific
                        if (next.has(f.id)) {
                          next.delete(f.id)
                          if (next.size === 0) return new Set(["all"]) // fallback to all
                        } else {
                          next.add(f.id)
                        }
                        return next
                      })
                    }} style={{
                      padding: "8px 14px", borderRadius: 20, border: "1.5px solid",
                      borderColor: isActive ? C.primary : "rgba(255,255,255,0.18)",
                      background: isActive ? "rgba(0,122,255,0.3)" : "rgba(255,255,255,0.06)",
                      color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}>
                      {isActive ? "✓ " : ""}{f.icon} {f.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 3. Route mode */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Route mode</div>
              <div style={{ display: "flex", gap: 8 }}>
                {Object.entries(MODES).map(([key, { icon, label, desc }]) => (
                  <button key={key} onClick={() => setSplashMode(key)} style={{
                    flex: 1, padding: "10px 6px", borderRadius: 12, border: "1.5px solid",
                    borderColor: splashMode === key ? C.primary : "rgba(255,255,255,0.15)",
                    background: splashMode === key ? "rgba(0,122,255,0.25)" : "rgba(255,255,255,0.06)",
                    cursor: "pointer", color: "#fff", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 18 }}>{icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>{label}</div>
                    <div style={{ fontSize: 10, opacity: 0.45, marginTop: 1 }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Location — only if not free mode */}
            {splashMode !== "free" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <AddressPicker label="Start location" dark onConfirm={(loc) => setSplashStart(loc)} />
                {splashMode === "path" && (
                  <AddressPicker label="End location" dark onConfirm={(loc) => setSplashEnd(loc)} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Screen: Route view (triggered mid-swipe OR at end) ───────────────────────
  if (showRoute || isEnd) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT }}>
        {Header}
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px" }}>

          <div style={{ background: C.card, borderRadius: 18, padding: "16px 20px", marginBottom: 14, boxShadow: C.shadow, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, color: C.label }}>
                {isEnd ? "🎉 All done!" : "🗺️ Your route"}
              </div>
              <div style={{ color: C.secondary, fontSize: 13, marginTop: 2 }}>
                Liked <b style={{ color: C.green }}>{liked.length}</b> of {pois.length} places
                {!isEnd && <span style={{ color: C.secondary }}> · {pois.length - index} cards left</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!isEnd && (
                <button onClick={() => setShowRoute(false)} style={{ padding: "8px 14px", borderRadius: 12, background: C.primaryLight, color: C.primary, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  ← Keep swiping
                </button>
              )}
              <button onClick={resetAll} style={{ padding: "8px 14px", borderRadius: 12, background: C.bg, color: C.label, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                ↩ Start over
              </button>
            </div>
          </div>

          {/* Mode pills */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
            {Object.entries(MODES).map(([key, { icon, label }]) => (
              <Pill key={key} active={routeMode === key} onClick={() => setRouteMode(key)}>{icon} {label}</Pill>
            ))}
          </div>

          {/* Location pickers */}
          {routeMode !== "free" && (
            <div style={{ background: C.card, borderRadius: 18, padding: "16px 20px", marginBottom: 14, boxShadow: C.shadow, display: "flex", flexDirection: "column", gap: 14 }}>
              <AddressPicker label="Start" onConfirm={setStart} />
              {routeMode === "path" && <AddressPicker label="End" onConfirm={setEnd} />}
            </div>
          )}

          <button onClick={generate} disabled={generating} style={{ width: "100%", padding: "14px", borderRadius: 16, background: generating ? C.secondary : C.primary, color: "#fff", border: "none", cursor: generating ? "default" : "pointer", fontSize: 16, fontWeight: 700, marginBottom: 14, boxShadow: "0 4px 16px rgba(0,122,255,0.25)" }}>
            {generating ? "Generating route…" : route ? "Re-generate route" : "Generate route"}
          </button>

          {totalKm !== null && (
            <div style={{ background: C.primaryLight, borderRadius: 14, padding: "12px 18px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>🚶</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>{totalKm.toFixed(2)} km total</div>
                <div style={{ fontSize: 12, color: C.secondary }}>~{Math.round(totalKm * 12)} min walking</div>
              </div>
            </div>
          )}

          {route && route.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.secondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Route stops</div>
              <RouteSummary route={route} />
            </div>
          )}

          <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={13} style={{ height: 380, width: "100%", borderRadius: 20, overflow: "hidden", boxShadow: C.shadowMd }}>
            <RecenterMap center={mapCenter} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {routeMode !== "free" && <Marker position={[start.lat, start.lng]}><Popup>Start</Popup></Marker>}
            {routeMode === "path" && <Marker position={[end.lat, end.lng]}><Popup>End</Popup></Marker>}
            {route?.map((p, i) => (
              <CircleMarker key={`${p.name}-${i}`} center={[p.lat, p.lng]} pathOptions={poiDotStyle} radius={8}><Popup>{p.name}</Popup></CircleMarker>
            ))}
            {walkLine.length > 1 && <Polyline positions={walkLine} color={C.primary} weight={4} opacity={0.85} />}
          </MapContainer>
        </div>
      </div>
    )
  }

  // ── Screen 2: Swiping ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT }}>
      {Header}
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "14px 16px 32px" }}>

        {/* Mode pills — lockable */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
          {Object.entries(MODES).map(([key, { icon, label }]) => (
            <Pill key={key} small active={routeMode === key} onClick={() => !isModeLocked && setRouteMode(key)} disabled={isModeLocked && routeMode !== key}>
              {icon} {label}
            </Pill>
          ))}
          {isModeLocked && <span style={{ fontSize: 11, color: C.secondary, alignSelf: "center", whiteSpace: "nowrap" }}>locked</span>}
        </div>

        {/* No results for filter */}
        {pois.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.secondary }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>No places in this category</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>Try a different filter or city</div>
          </div>
        ) : (
          <>
            <SwipeCard poi={current} onLike={like} onDislike={dislike} cardIndex={index} total={pois.length} />

            {/* Score row */}
            <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 12, fontSize: 13, color: C.secondary }}>
              <span>👍 {liked.length}</span>
              <span>👎 {disliked.length}</span>
              <span>📍 {pois.length - index} left</span>
            </div>

            {/* Generate route panel — appears as soon as 1 place is liked */}
            <GeneratePanel liked={liked} generating={generating} onGenerate={generate} />

            {/* Mini map */}
            <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={14} style={{ height: 190, width: "100%", marginTop: 14, borderRadius: 18, overflow: "hidden", boxShadow: C.shadow }}>
              <RecenterMap center={mapCenter} />
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {routeMode !== "free" && <Marker position={[start.lat, start.lng]}><Popup>Start</Popup></Marker>}
              <CircleMarker center={[current.lat, current.lng]} pathOptions={{ ...poiDotStyle, fillColor: C.red }} radius={11}><Popup>{current.name}</Popup></CircleMarker>
              {liked.map((p, i) => (
                <CircleMarker key={`${p.name}-${i}`} center={[p.lat, p.lng]} pathOptions={poiDotStyle} radius={8}><Popup>{p.name}</Popup></CircleMarker>
              ))}
            </MapContainer>
          </>
        )}
      </div>
    </div>
  )
}
