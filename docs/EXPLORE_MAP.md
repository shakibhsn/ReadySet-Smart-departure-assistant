# Bangladesh destination map (Explore)

The Explore page has an interactive map of all of Bangladesh. A destination can be chosen entirely by clicking: **Bangladesh → Division → District → Upazila → Destination**. Typing is optional (the existing location search stays on the left).

## Geographic data and licence
| Level | Units | Source | Licence |
|---|---|---|---|
| Division (ADM1) | 8 | geoBoundaries gbOpen (Wikimedia Commons), year 2015 | CC0 1.0 (public domain) |
| District (ADM2) | 64 | geoBoundaries gbOpen from Bangladesh Bureau of Statistics (BBS) / OCHA ROAP, year 2020 | CC BY 3.0 IGO |
| Upazila (ADM3) | 544 | same | CC BY 3.0 IGO |

geoBoundaries: <https://www.geoboundaries.org> (gbOpen is the openly licensed release). **Attribution is required** for the CC BY 3.0 IGO levels: it is shown in the map's attribution control and under the map. Map tiles are © OpenStreetMap contributors (ODbL); place data (destinations) is from OpenStreetMap through the existing nearby-places service.

The exact source files, licences and build date are recorded in `public/geo/SOURCE.json`.

Notes on accuracy: the files are the *simplified* geoBoundaries geometry, rounded to about 110 m, so outlines are good for choosing an area, not for surveying. The division layer (2015) and the district layer (2020) come from different releases, so a district edge can differ from its division edge by a small sliver. geoBoundaries spells three division names the old way (Chittagong, Barisal, "Rajshani"); the build script maps them to the official current spellings (Chattogram, Barishal, Rajshahi). No Bangla names are in this dataset, so Bangla area names are not shown on the map; the optional search box uses Open-Meteo's geocoder, whatever it supports.

## How the data is delivered
- `scripts/build-geo-data.mjs` downloads the geoBoundaries files and writes static JSON under `public/geo/`; the output is committed, so the app never depends on that service at run time. Re-run it only to refresh the data.
- `bd-divisions.json` (33 KB) is loaded when Explore opens; `bd-districts.json` (about 600 KB) right after (for the district lines and "Use my location"); each district's upazilas (`upazilas/<id>.json`) only when that district is opened. Every file is fetched at most once per visit. They are static files, not part of the JavaScript bundle.
- Each area has a `centre` point that is guaranteed to be inside its boundary; every district belongs to a division and every upazila to a district (checked by tests).

## Behaviour
- **Overview:** all divisions (clickable) with district lines; zoom and pan with the controls, drag, double-click or pinch. Scroll-wheel zoom is off so the page can still scroll.
- **Division:** zooms to it, outlines it, shows its districts (map and list), the forecast for its centre, and Save / Plan actions.
- **District:** zooms to it, shows its upazilas (map and chips), and destinations from the existing nearby-places service around the district's centre (default 10 km, the service's maximum, so large districts are only covered near the centre; the text says so). Selecting a card or marker shows details, weather, **Save to my places** and **Plan a departure here** (the existing functions).
- **Upazila:** the same around the upazila's centre (default 5 km).
- **Suggestions** use real data only: OpenStreetMap places, the forecast (weather-aware hints, as before), and the user's own saved places whose label or address *mentions* the area name (their places have no coordinates). If nothing is available the page says so.
- **Travel time** is never shown: ReadySet has no routing service.
- **Use my location:** a button; the browser permission is requested only when it is pressed. The point is matched to a division, district and upazila locally. Denied, unavailable, outside Bangladesh or still loading: a message, and everything else keeps working.
- Selecting on the map never changes the saved weather location used by the dashboard.
- **Failures:** if the boundary files cannot be loaded the card explains it, offers "Try again" and the rest of the page (location search, weather, nearby places) keeps working.

Screenshots: `docs/screenshots/bangladesh-map/`.

## Files
`src/components/explore/BangladeshExplorer.jsx` (state, lists, actions), `BangladeshMap.jsx` (Leaflet layers), `mapShared.js`; `src/lib/geo/` (`boundaries.js` loaders, `geometry.js` point-in-polygon and bounds, `mapColors.js` theme colours); `public/geo/`; tests `src/test/bangladeshExplorer.test.jsx`, `e2e/bangladesh-map-browser-check.mjs`.

## Not done / limits
- Destinations are limited to what OpenStreetMap returns near the centre of the chosen area (the nearby-places service takes a point and a radius up to 10 km). Whole-district destination lists would need a backend change (not made).
- No routing, so no travel times; no curated "verified destination" list exists, so none is invented.
- Bangla names are not in the boundary data.
