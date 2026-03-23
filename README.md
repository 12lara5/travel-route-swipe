# 🗺️ Travel Route Swipe

A Tinder-style city attraction picker that generates an optimized walking route through the places you like.

---

## What it does

1. Enter a city name
2. Swipe through real attractions (Google Places API)
3. Select your favorite locations
4. Generate an optimized walking route

   * Loop (return to start)
   * Path (A → B)
   * Free order

---

## Tech stack

| Layer     | Tech                                  |
| --------- | ------------------------------------- |
| Frontend  | React + Vite + react-leaflet          |
| Backend   | Node.js + Express                     |
| Routing   | OpenRouteService (walking directions) |
| Places    | Google Places API                     |
| Geocoding | Nominatim                             |

---

## Features

* Route optimization using **Nearest Neighbor + 2-opt algorithms**
* Dynamic filtering of attractions based on popularity (review count percentile)
* Integration with real-world APIs (Google Places, OpenRouteService)
* Interactive map rendering with Leaflet
* Swipe-based UI for selecting points of interest

### Backend improvements

* Rate limiting to prevent API abuse
* Input validation for safer requests
* Error handling to avoid server crashes
* Deduplication of POI results
* API keys secured via environment variables

---

## Running locally

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/travel-route-swipe
cd travel-route-swipe
npm install
```

---

### 2. Create `.env`

In the root folder:

```
GOOGLE_PLACES_KEY=your_key
VITE_ORS_KEY=your_key
PORT=4001
```

---

### 3. Run the app

```bash
# Backend
node server.js

# Frontend
npm run dev
```

Open: http://localhost:5173

---

## Project structure

```
travel-route-swipe/
├── server.js          # Express backend (API integration, validation, security)
├── src/
│   ├── App.jsx        # Main React app
│   ├── lib/
│   │   ├── geo.js     # Distance calculations (Haversine)
│   │   ├── ors.js     # OpenRouteService integration
│   │   └── route.js   # Route optimization (NN + 2-opt)
│   └── components/
│       └── RecenterMap.jsx
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
├── env.example
└── README.md
```

---

## Security notes

* API keys are stored in `.env` (not committed to Git)
* External API calls are handled **only on the backend**
* Rate limiting is applied to prevent abuse
* Input validation protects against malformed requests
* Errors are handled safely without exposing internal details

---

## License

MIT — feel free to use or adapt.
