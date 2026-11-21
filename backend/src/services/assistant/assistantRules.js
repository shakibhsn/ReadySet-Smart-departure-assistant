import { createHmac, timingSafeEqual } from 'node:crypto'
import { DateTime } from 'luxon'

// PURE rules for the AI Departure Assistant (no database, no network, no clock: everything is passed in).
//
// SAFETY MODEL
//  - A question is mapped to ONE of a few fixed intents by plain keyword rules. The model never chooses a tool or a query.
//  - The model (optional) only REPHRASES an answer that the server already built from real data. Its reply is
//    validated against the facts and thrown away if anything in it is not backed by them.
//  - Event titles/destinations are user-controlled text, so they are sanitised and treated as data, never as instructions.
//  - Anything that would change data is a PROPOSAL with a signed, short-lived token; nothing happens until the user confirms.

export const INTENTS = ['start_prep', 'packing', 'conflicts', 'late_risk']
export const MAX_QUESTION_LENGTH = 300
export const CONFIRM_TTL_MS = 10 * 60_000

const STOP = new Set(['the', 'and', 'for', 'my', 'me', 'next', 'what', 'when', 'should', 'start', 'preparing', 'prepare', 'pack', 'tomorrow', 'today', 'trip', 'event', 'events', 'have', 'any', 'am', 'i', 'is', 'are', 'likely', 'late', 'schedule', 'conflicts', 'about', 'with', 'from', 'that', 'this', 'get', 'ready', 'bring', 'need', 'take', 'time', 'does', 'do', 'to', 'a', 'an', 'of', 'on', 'in', 'at'])

const clean = (q) => String(q ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Which supported question is this? Order matters: the more specific intents win. */
export function classify(question) {
  const q = clean(question)
  if (/\b(conflicts?|clash(es)?|overlap(s|ping)?|double[- ]?book(ed|ing)?)\b/.test(q)) return 'conflicts'
  if (/\b(pack|packing|bring|carry|take with me)\b|what (do|should) i (need|take)/.test(q)) return 'packing'
  if (/\b(late|on time|in time|make it|running behind)\b/.test(q)) return 'late_risk'
  if (/\b(prepar\w*|get(ting)? ready|start)\b/.test(q)) return 'start_prep'
  return null
}

/** "today" | "tomorrow" | "week" | null */
export function dateHint(question) {
  const q = clean(question)
  if (/\btomorrow\b/.test(q)) return 'tomorrow'
  if (/\btoday\b|\btonight\b/.test(q)) return 'today'
  if (/\b(this week|next 7 days|next week)\b/.test(q)) return 'week'
  return null
}

/** Local date range [from, to) for a hint, in the user's timezone. */
export function rangeFor(hint, { now, timezone }) {
  const day = DateTime.fromJSDate(now, { zone: timezone }).startOf('day')
  if (hint === 'tomorrow') return { from: day.plus({ days: 1 }).toJSDate(), to: day.plus({ days: 2 }).toJSDate(), label: 'tomorrow' }
  if (hint === 'week') return { from: now, to: day.plus({ days: 7 }).toJSDate(), label: 'the next 7 days' }
  return { from: now, to: day.plus({ days: 1 }).toJSDate(), label: 'today' } // default: the rest of today
}

/** Untrusted text (titles, destinations) -> a short single line without control characters. */
export function sanitizeText(value, max = 80) {
  const noControl = Array.from(String(value ?? ''), (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('')
  return noControl.replace(/\s+/g, ' ').trim().slice(0, max)
}

const words = (s) => clean(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w))

/**
 * Which of the user's OWN upcoming occurrences does the question mean?
 * @param candidates [{ id, title, category, startAt: ISO }] sorted by start (already limited to this user)
 * @returns { event } | { ambiguous: [...] } | { none: true }
 */
export function resolveEvent(question, candidates, { now, timezone }) {
  if (candidates.length === 0) return { none: true }
  const q = clean(question)
  const qWords = new Set(words(q))
  const scored = candidates.map((c) => ({ c, score: words(c.title).filter((w) => qWords.has(w)).length + (qWords.has(c.category) ? 1 : 0) }))
  const best = Math.max(...scored.map((s) => s.score))
  if (best > 0) {
    const top = scored.filter((s) => s.score === best).map((s) => s.c)
    // Same series twice (several occurrences): the soonest one is the natural meaning.
    const distinct = new Map(top.map((c) => [c.id, c]))
    return distinct.size === 1 ? { event: top[0] } : { ambiguous: top.slice(0, 5) }
  }
  const hint = dateHint(q)
  if (hint && !/\bnext\b/.test(q)) {
    const { from, to } = rangeFor(hint, { now, timezone })
    const onDay = candidates.filter((c) => new Date(c.startAt) >= from && new Date(c.startAt) < to)
    if (onDay.length === 1) return { event: onDay[0] }
    if (onDay.length > 1) return { ambiguous: onDay.slice(0, 5) }
    return { none: true, reason: 'no_event_in_range' }
  }
  return { event: candidates[0] } // "my next event"
}

// ---------- model output validation ----------

const numberTokens = (text) => new Set((String(text).match(/\d+(?::\d{2})?/g) ?? []).map((t) => t.replace(/^0+(?=\d)/, '')))

/**
 * A model answer is accepted only if it is short, plain text, links nothing, and every number / clock time in it
 * already appears in the facts (or in the server's own template answer). Anything else -> use the template.
 */
export function validateModelAnswer(answer, { factsText, templateAnswer }) {
  if (typeof answer !== 'string') return null
  const text = answer.replace(/\s+\n/g, '\n').trim()
  if (text.length < 10 || text.length > 900) return null
  if (/https?:\/\/|www\.|<\/?[a-z]|```|\bselect\b.+\bfrom\b|\bdrop\s+table\b/i.test(text)) return null
  const allowed = new Set([...numberTokens(factsText), ...numberTokens(templateAnswer)])
  for (const t of numberTokens(text)) if (!allowed.has(t)) return null
  return text
}

// ---------- signed confirmation tokens (no database row needed) ----------

const b64 = (buf) => Buffer.from(buf).toString('base64url')
const sign = (payload, secret) => createHmac('sha256', `readyset-assistant-action:${secret}`).update(payload).digest()

/** payload: { u: userId, a: action, e: eventId, v: newValue, o: oldValue } -> "payload.signature" valid for CONFIRM_TTL_MS */
export function signAction(payload, secret, now = new Date()) {
  const body = b64(JSON.stringify({ ...payload, x: now.getTime() + CONFIRM_TTL_MS }))
  return `${body}.${b64(sign(body, secret))}`
}

/** Returns the payload, or null for a malformed / tampered / expired token. */
export function verifyAction(token, secret, now = new Date()) {
  if (typeof token !== 'string' || token.length > 1000 || !/^[\w-]+\.[\w-]+$/.test(token)) return null
  const [body, sig] = token.split('.')
  const expected = sign(body, secret)
  let given
  try {
    given = Buffer.from(sig, 'base64url')
  } catch {
    return null
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return payload && typeof payload.x === 'number' && payload.x > now.getTime() ? payload : null
  } catch {
    return null
  }
}
