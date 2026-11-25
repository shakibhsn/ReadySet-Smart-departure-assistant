// Builds the Bangladesh administrative boundary files used by the Explore map (public/geo/*).
//   node scripts/build-geo-data.mjs
// Source: geoBoundaries gbOpen (https://www.geoboundaries.org), simplified geometry. Divisions (ADM1) are CC0;
// districts (ADM2) and upazilas (ADM3) are CC BY 3.0 IGO (attribution required: shown on the map and in docs/EXPLORE_MAP.md).
// The output is committed so the app never depends on that service at run time; rerun this only to refresh the data.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { findContaining, interiorPoint, roundGeometry, vertexDistance } from '../src/lib/geo/geometry.js'

const API = (level) => `https://www.geoboundaries.org/api/current/gbOpen/BGD/${level}/`
// geoBoundaries uses the old spellings for some divisions (and "Rajshani" is a typo); these are the official current ones.
const DIVISION_NAMES = { Chittagong: 'Chattogram', Barisal: 'Barishal', Rajshani: 'Rajshahi' }

const meta = {}
const load = async (level) => {
  const info = await (await fetch(API(level))).json()
  meta[level] = { license: info.boundaryLicense, year: info.boundaryYearRepresented, source: info.boundarySource, count: info.admUnitCount, file: info.simplifiedGeometryGeoJSON }
  return (await (await fetch(info.simplifiedGeometryGeoJSON)).json()).features
}

// The interior point decides the parent; the rare border case falls back to the nearest boundary vertex.
const parentOf = (point, parents) =>
  findContaining(parents, point[0], point[1]) ??
  parents.reduce((best, f) => (vertexDistance(point[0], point[1], f.geometry) < vertexDistance(point[0], point[1], best.geometry) ? f : best))

const adm1 = await load('ADM1')
const adm2 = await load('ADM2')
const adm3 = await load('ADM3')

const feature = (f, name, props) => ({ type: 'Feature', id: f.properties.shapeID, properties: { id: f.properties.shapeID, name, ...props }, geometry: roundGeometry(f.geometry) })

const divisions = adm1.map((f) => feature(f, DIVISION_NAMES[f.properties.shapeName] ?? f.properties.shapeName, { centre: interiorPoint(f.geometry) }))
const districts = adm2.map((f) => {
  const centre = interiorPoint(f.geometry)
  return feature(f, f.properties.shapeName, { centre, divisionId: parentOf(centre, adm1).properties.shapeID })
})
const upazilas = adm3.map((f) => {
  const centre = interiorPoint(f.geometry)
  return feature(f, f.properties.shapeName, { centre, districtId: parentOf(centre, adm2).properties.shapeID })
})

const out = new URL('../public/geo/', import.meta.url)
rmSync(out, { recursive: true, force: true })
mkdirSync(new URL('upazilas/', out), { recursive: true })
const write = (name, features) => writeFileSync(new URL(name, out), JSON.stringify({ type: 'FeatureCollection', features }))
write('bd-divisions.json', divisions)
write('bd-districts.json', districts)
for (const d of districts) write(`upazilas/${d.id}.json`, upazilas.filter((u) => u.properties.districtId === d.id))
writeFileSync(new URL('SOURCE.json', out), JSON.stringify({ dataset: 'geoBoundaries gbOpen, Bangladesh', website: 'https://www.geoboundaries.org', builtOn: new Date().toISOString().slice(0, 10), levels: meta }, null, 2))

const count = (items, key) => [...items.reduce((m, f) => m.set(f.properties[key], (m.get(f.properties[key]) ?? 0) + 1), new Map()).values()]
console.log('divisions', divisions.length, 'districts', districts.length, 'upazilas', upazilas.length)
console.log('districts per division', count(districts, 'divisionId').join(','))
console.log('districts that have upazilas', count(upazilas, 'districtId').length)
