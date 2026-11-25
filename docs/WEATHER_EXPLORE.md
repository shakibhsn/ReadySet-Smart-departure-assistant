# Weather & Explore

Adds a weather dashboard, location search for Bangladesh, a location preference, nearby destination discovery, weather-aware suggestions and a Leaflet map to the existing ReadySet app. Nothing was rebuilt; no database change was applied.

## What it does
- **Weather card** (dashboard, compact; Explore page, full): current temperature and condition, feels-like, min/max, rain chance, wind, humidity, sunrise/sunset, last-updated time, next 24 hours, next 7 days, °C/°F switch, refresh, loading skeletons, error and empty states. Missing values show "Not available".
- **Location search**: debounced search through the Open-Meteo Geocoding API, Bangladesh by default (or "Anywhere"). Results show name, type (division, district, upazila…), and the administrative area so same-named places can be told apart. No Nominatim.
- **Location preference**: choose, change, clear; "Use my current location" asks the browser only when clicked and falls back to manual search if refused.
- **Explore Destinations**: cafes, restaurants, parks, attractions, museums, shopping, nature, useful places from OpenStreetMap (Overpass). Category filters, distance filter, cards (name, category, distance, address when present), details, Leaflet map, "Save to my places", "Plan a departure here" (pre-fills the new-event destination).
- **Dashboard** (kept short): a compact weather card with the next hours, a **weather-aware departure reminder** (the forecast for the hour of your next planned departure, shown only when the forecast covers that hour), quick links into Explore by category, and your saved places (top four).
- **Weather-aware hints** (rule-based, no AI): rain likely → consider indoor; severe weather → advisory; pleasant → outdoor places may suit; no forecast → no weather claims. Can use the forecast for the user's next planned departure. Wording is cautious ("may suit"), never "safe" or "guaranteed".

## Loading and resilience
- The Explore page is **lazy-loaded** (its own chunk, 168 kB / 50 kB gzip, holds Leaflet and its CSS): the dashboard does not download it.
- The map shows the chosen location immediately, **even when nearby places fail to load** (the error and "Try again" appear above it).
- `OVERPASS_URL` accepts several servers; each gets 12 s, then the next is tried.

## Files
Backend (new): `backend/src/services/explore/` (`providerHttp.js`, `locationHelpers.js`, `locationSearch.service.js`, `forecastHelpers.js`, `forecast.service.js`, `nearbyHelpers.js`, `nearby.service.js`), `backend/src/schemas/explore.schema.js`, `backend/src/routes/explore.routes.js`, tests `explorePure.test.js`, `explore.test.js`.
Backend (changed): `app.js` (mounts the routes before saved places), `config/env.js` and `.env.example` (`OVERPASS_URL`).
Frontend (new): `services/exploreApi.js`, `lib/weatherLocation.js`, `lib/exploreRules.js`, `hooks/{useWeatherLocation,useForecast,useRemoteData,useDebouncedValue}.js`, `components/weather/{WeatherIcon,LocationWeatherCard}.jsx`, `components/explore/{LocationSearch,ExploreMap,ExploreDestinations,DestinationCard}.jsx`, `pages/explore/ExplorePage.jsx`, tests `explore.test.jsx`, `exploreMap.test.jsx`, `exploreIntegration.test.jsx`.
Frontend (changed): `routes/{index.jsx,navigation.js}`, `pages/dashboard/DashboardPage.jsx`, `pages/events/CreateEventPage.jsx` (reads `?destination=`), `styles/index.css` (map pins), `test/fakeApi.js`, `.env.example`, `package.json` (+`leaflet`).

## APIs and providers
| Purpose | Provider | Key | Endpoint (ReadySet) |
|---|---|---|---|
| Weather | Open-Meteo Forecast | none | `GET /api/weather/forecast?latitude&longitude` |
| Location search | Open-Meteo Geocoding | none | `GET /api/locations/search?q&country=BD|ANY&count` |
| Nearby places | OpenStreetMap via Overpass | none | `GET /api/places/nearby?latitude&longitude&radius&category` |
| Map tiles | OpenStreetMap tile server | none | browser → `tile.openstreetmap.org` |

All ReadySet routes need a login and are rate limited. Bad input (coordinates outside ±90/±180, query not 2–80 characters, bad radius or category) is a 400; provider trouble is a normal 200 reply with a `status` (`provider_unavailable` / `timeout`) so the UI can show a message. Only coordinates or the search text are sent to providers; never a user id, name, email or token. Caching: forecast 10 minutes per ~1 km (a forecast up to 3 hours old is shown, labelled "not current", if the provider fails), geocoding 24 hours, nearby places 30 minutes per ~1 km cell; identical concurrent requests share one provider call.

## Environment variables
- Backend `OVERPASS_URL` (optional): one Overpass URL or several separated by commas, tried in order. Default: `https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter`.
- Frontend `VITE_MAP_TILE_URL` (optional): OpenStreetMap-compatible tile URL. Default: the public OSM tile server.
- No secrets, no paid services.

## Database change needed (NOT applied, not required to use the feature)
The chosen location is currently stored per user in the browser's `localStorage` (survives reloads and log-out/log-in **on the same browser**). ReadySet has nothing that can hold coordinates (saved places are address text only). To keep it on the server (any device), one additive change is proposed:
```sql
ALTER TABLE "user_preferences" ADD COLUMN "weather_location" JSONB;   -- {name, area, latitude, longitude, country, source}; NULL = not chosen
```
plus `weatherLocation Json? @map("weather_location")` in `schema.prisma` and a `PATCH /api/users/me/weather-location` endpoint; `lib/weatherLocation.js` is the only frontend file that would change. Rollback: `ALTER TABLE "user_preferences" DROP COLUMN "weather_location";` (never run without your approval). **Wait for approval before applying.**

## Known limitations
- **Public Overpass servers are shared and were very slow or unavailable while this was built** (queries took 30+ s or returned 504; one small query returned correctly after 38 s, and that real response was used to check the place mapping). When no server answers within 12 s each, the destinations panel shows a clear message and "Try again"; weather and search are unaffected. For real use, run your own Overpass instance or use a hosted one and set `OVERPASS_URL`.
- The public OpenStreetMap tile server is for light use only (see its tile usage policy); set `VITE_MAP_TILE_URL` for production.
- Open-Meteo geocoding (GeoNames data) covers cities, towns and many local areas, but small villages can be missing.
- "All" categories at once is capped at the nearest 40 places from at most 120 returned; pick a category for a fuller list.
- Destination weather is the forecast for the chosen location, not measured at the destination.
- Opening hours, ratings, prices and phone numbers are deliberately not shown.
- Marker names from OpenStreetMap are rendered as plain text (never HTML).

## Manual testing
1. Sign in → Dashboard shows "Choose a location" → open **Weather & Explore**.
2. Search "Savar": two results are listed with different districts; pick one. The weather card and destinations load; switch °F/°C; refresh.
3. Reload the page and log out/in: the location is remembered (same browser). Use "Clear selected location".
4. Try "Use my current location": deny permission → a message explains and search still works.
5. Pick a category (for example Parks) and a distance; click a card or a map marker; "Save to my places" (then see Saved Places); "Plan a departure here" opens the new-event form with the destination filled in.
6. With an event planned, choose "Weather for → My next departure" and read the suggestion and its reason.
7. Stop the backend or block the providers: each part shows an error with "Try again" and nothing breaks.
