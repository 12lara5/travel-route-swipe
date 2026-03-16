import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import pg from "pg"

dotenv.config()

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection (non-fatal):", err)
})

const { Pool } = pg

let pool = null
try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
    pool.on("error", (err) => console.error("Postgres pool error:", err.message))
    console.log("Postgres pool created")
  } else {
    console.warn("DATABASE_URL not set — DB features disabled")
  }
} catch (err) {
  console.warn("DB pool init failed (non-fatal):", err.message)
}

const app = express()
app.use(cors())
app.use(express.json())

// ── Google Places config ─────────────────────────────────────────────────────
// Get your key: console.cloud.google.com → Enable "Places API (New)" → Create API Key
// Add to .env: GOOGLE_PLACES_KEY=AIza...
const GOOGLE_KEY = process.env.GOOGLE_PLACES_KEY

// Split into two batches — Google caps Nearby Search at 20 per request.
// We make 2 calls with different type groups then deduplicate, giving up to 40 results.
const TYPE_BATCH_1 = [
  "tourist_attraction",
  "museum",
  "art_gallery",
  "historical_landmark",
  "cultural_landmark",
  "monument",
]

const TYPE_BATCH_2 = [
  "church",
  "hindu_temple",
  "mosque",
  "synagogue",
  "castle",
  "national_park",
  "amphitheatre",
]

// ── Nominatim geocode (free, no key needed) ──────────────────────────────────
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=1&addressdetails=1`
  const res = await fetch(url, {
    headers: { "User-Agent": "travel-route-swipe/1.0", "Accept-Language": "hr,en" },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`)
  try { return JSON.parse(text) } catch { throw new Error("Nominatim returned non-JSON") }
}

// ── Google Places: Nearby Search (New) ──────────────────────────────────────
// Google caps at 20 results per call, so we make 2 calls with different type
// batches and merge them, giving up to 40 unique results per city.
async function nearbySearch(lat, lng, types) {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.primaryTypeDisplayName,places.photos,places.rating,places.editorialSummary",
      },
      body: JSON.stringify({
        includedTypes: types,
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 2000.0,
          },
        },
        rankPreference: "POPULARITY",
      }),
    }
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Google Places error ${res.status}: ${txt.slice(0, 300)}`)
  }
  const data = await res.json()
  return data.places ?? []
}

async function fetchGooglePOIs(lat, lng) {
  if (!GOOGLE_KEY) throw new Error("GOOGLE_PLACES_KEY not set in .env")

  // Run both batches in parallel
  const [batch1, batch2] = await Promise.all([
    nearbySearch(lat, lng, TYPE_BATCH_1),
    nearbySearch(lat, lng, TYPE_BATCH_2),
  ])

  // Deduplicate by place id
  const seen = new Set()
  const merged = []
  for (const place of [...batch1, ...batch2]) {
    if (!seen.has(place.id)) {
      seen.add(place.id)
      merged.push(place)
    }
  }
  return merged
}

// ── Google Places: get photo URL ─────────────────────────────────────────────
// The photo name is a resource path like "places/ChIJ.../photos/AXCi..."
// We build a direct media URL — the browser loads it straight from Google CDN.
// Do NOT add skipHttpRedirect=true — that returns JSON instead of an image.
function extractGooglePhoto(place) {
  const photos = place.photos
  if (!photos?.length) return null
  const ref = photos[0].name
  return `https://places.googleapis.com/v1/${ref}/media?maxHeightPx=600&maxWidthPx=800&key=${GOOGLE_KEY}`
}

function extractCategory(place) {
  return place.primaryTypeDisplayName?.text?.toLowerCase() ?? "attraction"
}

// ── GET /api/geocode?q=address ───────────────────────────────────────────────
app.get("/api/geocode", async (req, res) => {
  const q = String(req.query.q || "").trim()
  if (!q) return res.status(400).json({ error: "q is required" })
  try {
    const data = await geocode(q)
    if (!data.length) return res.status(404).json({ error: "Address not found" })
    const { lat, lon, display_name } = data[0]
    res.json({ lat: Number(lat), lng: Number(lon), display_name })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/pois?city=... ───────────────────────────────────────────────────
app.get("/api/pois", async (req, res) => {
  const cityQuery = String(req.query.city || "").trim()
  if (!cityQuery) return res.status(400).json({ error: "city is required" })

  try {
    // 1. Geocode city name → lat/lng
    const geoData = await geocode(cityQuery)
    if (!geoData.length) return res.status(404).json({ error: "City not found" })
    const { lat, lon } = geoData[0]

    // 2. Fetch from Google Places
    const places = await fetchGooglePOIs(Number(lat), Number(lon))

    // 3. Shape into our POI format
    const pois = places
      .filter((p) => p.location?.latitude && p.displayName?.text)
      .map((p) => ({
        id: p.id,
        name: p.displayName.text,
        category: extractCategory(p),
        lat: p.location.latitude,
        lng: p.location.longitude,
        photo: extractGooglePhoto(p),
        rating: p.rating ?? null,
        description: p.editorialSummary?.text ?? null,
      }))

    console.log(`[pois] "${cityQuery}" → ${pois.length} Google Places results`)

    res.json({
      city: { name: cityQuery, lat: Number(lat), lng: Number(lon) },
      count: pois.length,
      pois,
    })
  } catch (err) {
    console.error("[pois] error:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/test", async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not configured" })
  try {
    const result = await pool.query("SELECT NOW()")
    res.json({ ok: true, dbTime: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4001

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  if (!GOOGLE_KEY) console.warn("⚠️  GOOGLE_PLACES_KEY not set — /api/pois will fail")
})

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n❌  Port ${PORT} is already in use.\n` +
      `   Kill the old process first:\n` +
      `     Mac/Linux:  lsof -ti :${PORT} | xargs kill -9\n` +
      `     Windows:    netstat -ano | findstr ${PORT}  → then taskkill /PID <pid> /F\n`
    )
  } else {
    console.error("Server error:", err)
  }
  process.exit(1)
})