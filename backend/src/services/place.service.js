import { prisma } from '../config/database.js'
import { AppError } from '../utils/apiResponse.js'

// Saved places (home, office, university...). PRIVATE location data:
//  - every query filters by userId from the verified JWT (an id alone never reveals or changes another user's place);
//  - addresses are never logged (the logger takes no request data, and database errors are logged by name/code only);
//  - an event copies the address text into its own destination field, so places are never joined into other users' data.

export const MAX_PLACES = 30
const notFound = () => new AppError(404, 'Place not found')

const toPublic = (p, defaultId) => ({ id: p.id, label: p.label, kind: p.kind, address: p.address, isDefaultStart: p.id === defaultId, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })

async function defaultIdOf(userId) {
  return (await prisma.userPreference.findUnique({ where: { userId }, select: { defaultStartPlaceId: true } }))?.defaultStartPlaceId ?? null
}

async function guard(fn) {
  try {
    return await fn()
  } catch (err) {
    if (err.code === 'P2002') throw new AppError(409, 'You already have a place with this name', [{ field: 'label', message: 'Name already used' }])
    throw err
  }
}

export async function listPlaces(userId) {
  const [rows, defaultId] = await Promise.all([prisma.savedPlace.findMany({ where: { userId }, orderBy: [{ label: 'asc' }, { id: 'asc' }], take: MAX_PLACES }), defaultIdOf(userId)])
  return { places: rows.map((p) => toPublic(p, defaultId)), defaultStartPlaceId: defaultId }
}

export async function createPlace(userId, { label, kind, address, makeDefault }) {
  if ((await prisma.savedPlace.count({ where: { userId } })) >= MAX_PLACES) throw new AppError(409, `You can save at most ${MAX_PLACES} places`)
  const row = await guard(() => prisma.savedPlace.create({ data: { userId, label, kind, address } }))
  if (makeDefault) await prisma.userPreference.updateMany({ where: { userId }, data: { defaultStartPlaceId: row.id } })
  return { place: toPublic(row, makeDefault ? row.id : await defaultIdOf(userId)) }
}

export async function updatePlace(userId, id, patch) {
  const result = await guard(() => prisma.savedPlace.updateMany({ where: { id, userId }, data: patch }))
  if (result.count === 0) throw notFound()
  return { place: toPublic(await prisma.savedPlace.findFirst({ where: { id, userId } }), await defaultIdOf(userId)) }
}

export async function deletePlace(userId, id) {
  // user_preferences.default_start_place_id is ON DELETE SET NULL, so deleting the default place clears the default.
  const result = await prisma.savedPlace.deleteMany({ where: { id, userId } })
  if (result.count === 0) throw notFound()
  return { defaultStartPlaceId: await defaultIdOf(userId) }
}

/** placeId = one of MY places, or null to clear the default starting location. */
export async function setDefaultStart(userId, placeId) {
  if (placeId !== null && !(await prisma.savedPlace.findFirst({ where: { id: placeId, userId }, select: { id: true } }))) throw notFound()
  const result = await prisma.userPreference.updateMany({ where: { userId }, data: { defaultStartPlaceId: placeId } })
  if (result.count === 0) throw new AppError(404, 'Preferences not found')
  return { defaultStartPlaceId: placeId }
}
