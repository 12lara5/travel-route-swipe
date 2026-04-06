import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import pg from "pg"
import rateLimit from "express-rate-limit"

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

// Ruta za dohvaćanje rute (Proxy za OpenRouteService)
app.post("/api/route", async (req, res) => {
  const { start, end } = req.body;
  const key = process.env.ORS_KEY; 

  try {
    const response = await fetch("https://api.openrouteservice.org/v2/directions/foot-hiking/geojson", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": key,
      },
      body: JSON.stringify({
        coordinates: [
          [start.lng, start.lat],
          [end.lng, end.lat],
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("ORS Proxy Error:", error);
    res.status(500).json({ error: "Failed to fetch route from server" });
  }
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100, // max 100 requestova po IP-u
  message: {
    error: "Too many requests, try again later."
  }
})

app.use(limiter)

// ── Google Places config ─────────────────────────────────────────────────────
// Get your key: console.cloud.google.com → Enable "Places API (New)" → Create API Key
// Add to .env: GOOGLE_PLACES_KEY=AIza...
const GOOGLE_KEY = process.env.GOOGLE_PLACES_KEY

// Split into two batches — Google caps Nearby Search at 20 per request.
// We make 2 calls with different type groups then deduplicate, giving up to 40 results.
// No religious types — they flood results with every minor church in the city.
// Focus on things tourists actually seek out.
const TYPE_BATCH_1 = [
  "tourist_attraction",
  "museum",
  "art_gallery",
  "historical_landmark",
  "cultural_landmark",
]

const TYPE_BATCH_2 = [
  "monument",
  "castle",
  "national_park",
  "amphitheatre",
  "aquarium",
  "zoo",
  "amusement_park",
  "church",
  "mosque",
  "synagogue",
  "hindu_temple",
  "beach",
  "hiking_area",
  "botanical_garden",
  "marina",
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
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.primaryTypeDisplayName,places.photos,places.rating,places.userRatingCount,places.editorialSummary",
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

function isValidQuery(q) {
  if (!q) return false
  if (typeof q !== "string") return false
  if (q.length < 2 || q.length > 100) return false
  return true
}

// ── GET /api/geocode?q=address ───────────────────────────────────────────────
app.get("/api/geocode", async (req, res) => {
  const { q } = req.query

  if (!isValidQuery(q)) {
    return res.status(400).json({ error: "Invalid query" })
  } 
  try {
    const data = await geocode(q)
    if (!data.length) return res.status(404).json({ error: "Address not found" })
    const { lat, lon, display_name } = data[0]
    res.json({ lat: Number(lat), lng: Number(lon), display_name })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Server error" })
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
    // Scale the minimum review threshold by how many results Google returned.
    // Big cities return 40 places with thousands of reviews each — set bar high.
    // Small cities like Sibenik return fewer, lower-reviewed places — set bar low.
    // This way we always get a reasonable deck size regardless of city size.
    const reviewCounts = places
      .map((p) => p.userRatingCount ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => a - b)

    // Use the 30th percentile as the cutoff — keeps top 70% of results
    // but never goes below 50 (avoid truly unknown spots) or above 300
    const p30index = Math.floor(reviewCounts.length * 0.3)
    const dynamicMin = Math.min(300, Math.max(50, reviewCounts[p30index] ?? 50))

    console.log(`[pois] review threshold for ${cityQuery}: ${dynamicMin}`)

    const pois = places
      .filter((p) => {
        if (!p.location?.latitude || !p.displayName?.text) return false
        const reviews = p.userRatingCount ?? 0
        return reviews >= dynamicMin
      })
      .map((p) => ({
        id: p.id,
        name: p.displayName.text,
        category: extractCategory(p),
        lat: p.location.latitude,
        lng: p.location.longitude,
        photo: extractGooglePhoto(p),
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? null,
        description: p.editorialSummary?.text ?? null,
      }))
      .filter((p, index, self) =>
        index === self.findIndex((x) => x.id === p.id)
      )     
      // Sort by review count — most visited places first
      .sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0))

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
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err)
})

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err)
})