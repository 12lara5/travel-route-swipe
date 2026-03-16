# 🗺️ Travel Route Swipe

A Tinder-style city attraction picker that generates an optimised walking route through the places you liked.

**[Live demo →](https://your-app.vercel.app)** ← replace with your Vercel URL after deploying

![App screenshot](screenshot.png)

---

## What it does

1. Type a city name
2. Swipe through real attractions (powered by Google Places)
3. Generate an optimised walking route through your liked spots
4. Choose loop (return to start), path (A→B), or free order

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + react-leaflet |
| Backend | Node.js + Express |
| Routing | OpenRouteService (walking directions) |
| Places | Google Places API (New) |
| Geocoding | Nominatim (free, no key needed) |
| Frontend hosting | Vercel |
| Backend hosting | Railway |

---

## Running locally

### 1. Clone the repo
```bash
git clone https://github.com/yourusername/travel-route-swipe
cd travel-route-swipe
npm install
```

### 2. Get your API keys

**Google Places API (for attractions + photos)**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "travel-route-swipe")
3. Go to **APIs & Services → Library** → search "Places API (New)" → Enable it
4. Go to **APIs & Services → Credentials → + Create Credentials → API Key**
5. Copy the key
6. (Recommended) Click the key → under **API restrictions** select "Places API (New)" only
7. (Recommended) Set a **daily quota cap**: APIs & Services → Places API (New) → Quotas → set max ~200/day

**OpenRouteService (for walking route lines)**
1. Sign up free at [openrouteservice.org](https://openrouteservice.org)
2. Go to Dashboard → API Keys → copy your key

### 3. Create your `.env` file
In the project root (same folder as `server.js`):
```
GOOGLE_PLACES_KEY=AIzaSy...
VITE_ORS_KEY=eyJ...
PORT=4001
```

### 4. Run both servers
```bash
# Terminal 1 — backend
node server.js

# Terminal 2 — frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Deploying to the web

### Backend → Railway

1. Push your code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select your repo
4. Go to your service → **Variables** tab → add:
   ```
   GOOGLE_PLACES_KEY=AIzaSy...
   PORT=4001
   ```
5. Railway will auto-deploy. Copy the generated URL (e.g. `https://travel-route-swipe.up.railway.app`)

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select your repo
3. Go to **Settings → Environment Variables** → add:
   ```
   VITE_ORS_KEY=eyJ...
   VITE_API_URL=https://travel-route-swipe.up.railway.app
   ```
4. Deploy

> ⚠️ After deploying the backend, update the API URL in your frontend from `http://localhost:4001` to your Railway URL. See the note in `App.jsx`.

---

## Project structure

```
travel-route-swipe/
├── server.js          # Express backend — API keys live here only
├── src/
│   ├── App.jsx        # Main React app
│   ├── lib/
│   │   ├── geo.js     # Haversine distance, route distance helpers
│   │   ├── ors.js     # OpenRouteService walking directions
│   │   └── route.js   # Nearest-neighbor + 2-opt route optimisation
│   └── components/
│       └── RecenterMap.jsx
├── railway.json       # Railway deployment config
├── vercel.json        # Vercel deployment config
├── .gitignore         # Keeps .env out of git
└── README.md
```

---

## Security notes

- API keys are **only in `.env`** which is in `.gitignore` — never committed to git
- The Google Places key only lives on the server (Railway) — never sent to the browser
- Set a daily quota cap in Google Cloud Console to prevent surprise bills
- For extra safety, restrict your Google key to only the Places API in the Cloud Console

---

## License

MIT — feel free to use this for your own projects.
