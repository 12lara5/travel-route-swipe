# 🗺️ Travel Route Swipe

> A Tinder-style city explorer — swipe through real attractions, generate an optimized walking route.



https://github.com/user-attachments/assets/35267c91-3cca-42da-b807-114cb75c2634


---

## What it does

You enter a city name. The app fetches real attractions via the Google Places API, lets you swipe through them Tinder-style, then computes an optimized walking route through the ones you liked — rendered live on an interactive map.


<img width="590" height="589" alt="image" src="https://github.com/user-attachments/assets/21c78b94-a037-4788-846f-031a600d8371" />




<img width="815" height="604" alt="image" src="https://github.com/user-attachments/assets/748865aa-944b-4a43-a76f-f167b3a2444d" />

---

## Technical highlights

### Route optimization — custom implementation

Route optimization is solved with **Nearest Neighbor heuristic + 2-opt local search**, written from scratch without any external routing library:

- **Nearest Neighbor** builds an initial greedy route in O(n²)
- **2-opt** iteratively reverses sub-segments to eliminate crossings, converging to a near-optimal solution
- Supports three modes: **loop** (return to start), **path** (A→B), and **free order**
- Distance calculations use the **Haversine formula** for accurate great-circle distances

```js
// 2-opt: swap segments until no improvement found
while (improved) {
  for (let i = 0; i < best.length - 1; i++) {
    for (let k = i + 1; k < best.length; k++) {
      const candidate = reverseSegment(best, i, k)
      if (totalLoopKm(start, candidate) < bestLen) { ... }
    }
  }
}
```

### Smart POI filtering

Raw Google Places results vary wildly between cities — a search in Paris returns 40 places with 10k+ reviews each, while a smaller city returns 15 places with 200 reviews. A fixed minimum review threshold would either flood small-city results or filter out everything in large ones.

Solution: **dynamic 30th-percentile thresholding** — the cutoff is computed per-request from the actual result distribution, keeping the top 70% while clamping between 50 and 300 reviews.

```js
const p30index = Math.floor(reviewCounts.length * 0.3)
const dynamicMin = Math.min(300, Math.max(50, reviewCounts[p30index] ?? 50))
```

### Parallel API batching

Google Places caps Nearby Search at 20 results per request and limits type filters. The app **runs two batches in parallel** with different type groups (landmarks, museums, galleries vs. parks, beaches, monuments) and merges + deduplicates the results — effectively doubling coverage with no extra latency.

```js
const [batch1, batch2] = await Promise.all([
  nearbySearch(lat, lng, TYPE_BATCH_1),
  nearbySearch(lat, lng, TYPE_BATCH_2),
])
```

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + react-leaflet |
| Backend | Node.js + Express |
| Walking directions | OpenRouteService API (proxied through backend) |
| Place search | Google Places API (New) |
| Geocoding | Nominatim (OpenStreetMap) |
| Route optimization | Custom NN + 2-opt (no external lib) |

---

## Architecture

```
Browser (React)
    │
    ├── Swipe UI  ──────────── GET /api/pois?city=...
    │                              │
    │                         Geocode city (Nominatim)
    │                         Parallel Places fetch (Google)
    │                         Dynamic review threshold
    │                         Return normalized POI array
    │
    └── Map View ──────────── POST /api/route
                                   │
                              Proxy to OpenRouteService
                              Return GeoJSON polyline
```

The frontend never touches external APIs directly — all keys stay server-side.

---

## Security & backend hardening

- API keys stored in `.env`, never exposed to the client
- All external API calls proxied through the Express backend
- **Rate limiting** — 100 requests / 15 min per IP (express-rate-limit)
- **Input validation** on all query params before hitting external APIs
- **Graceful error handling** — errors are caught and returned as structured JSON without leaking internal details
- Deduplication of POI results by Google Place ID

---

## Running locally

### 1. Clone & install

```bash
git clone https://github.com/yourusername/travel-route-swipe
cd travel-route-swipe
npm install
```

### 2. Set up environment variables

```bash
cp env.example .env
```

```
GOOGLE_PLACES_KEY=your_key   # console.cloud.google.com → enable "Places API (New)"
ORS_KEY=your_key             # openrouteservice.org → free tier available
PORT=4001
```

### 3. Run

```bash
node server.js    # backend → http://localhost:4001
npm run dev       # frontend → http://localhost:5173
```

---

## Project structure

```
travel-route-swipe/
├── server.js              # Express backend — API proxy, validation, rate limiting
├── src/
│   ├── App.jsx            # Main React app — swipe UI, state management, map
│   └── lib/
│       ├── geo.js         # Haversine distance, path/loop distance helpers
│       ├── ors.js         # OpenRouteService client (via backend proxy)
│       └── route.js       # NN + 2-opt route optimization
├── env.example
└── README.md
```

---

## License

MIT
