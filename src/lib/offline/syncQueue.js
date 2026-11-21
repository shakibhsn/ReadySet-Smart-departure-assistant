// SYNC of checklist ticks made offline. Pure logic with injected dependencies, so it is testable without a browser.
//
// Guarantees
//  - One flush at a time (a second call while one is running just returns the same promise): no duplicate sync.
//  - Ops are replayed oldest first; each is removed from the queue only after the server answered for it.
//  - The server endpoint is idempotent ("set done = X"), and a replayed op whose state already matches is a no-op.
//  - A change made on another device meanwhile is NOT overwritten: the server answers 409 SYNC_CONFLICT, the local
//    op is dropped, and the user is told. Server data always wins a real conflict.
//  - A missing item/event (deleted elsewhere), or someone else's (404), drops the op and tells the user.
//  - A network failure stops the run and keeps everything for later. A 401 stops the run and keeps the queue (it
//    belongs to this user and is only ever replayed under their own login).

const running = new Map()

/**
 * @param store  offline store
 * @param userId the signed-in user (ops of other users are never sent)
 * @param send   (eventId, itemId, done, baseUpdatedAt) => Promise<item>  throws ApiError-like { status, code, isNetworkError }
 * @param onItem (eventId, item) => void   called with the server's version after a successful op
 * @returns Promise<{ synced: number, conflicts: Array<{ opId, itemId, eventId, reason, message }>, remaining: number, stopped: 'network'|'auth'|null }>
 */
export function flushQueue({ store, userId, send, onItem }) {
  if (running.has(userId)) return running.get(userId)
  const job = (async () => {
    const ops = await store.listQueue(userId)
    const result = { synced: 0, conflicts: [], remaining: ops.length, stopped: null }
    for (const op of ops) {
      try {
        const item = await send(op.eventId, op.itemId, op.done, op.baseUpdatedAt)
        await store.removeOp(op.opId)
        onItem?.(op.eventId, item)
        result.synced++
        result.remaining--
      } catch (err) {
        if (err?.isNetworkError) {
          result.stopped = 'network'
          break
        }
        if (err?.status === 401) {
          result.stopped = 'auth'
          break
        }
        if (err?.status === 409 && err.code === 'SYNC_CONFLICT') {
          await store.removeOp(op.opId)
          result.conflicts.push({ opId: op.opId, itemId: op.itemId, eventId: op.eventId, reason: 'conflict', message: 'An item was changed somewhere else after your offline edit, so your change was not applied.' })
          result.remaining--
        } else if (err?.status === 404) {
          await store.removeOp(op.opId)
          result.conflicts.push({ opId: op.opId, itemId: op.itemId, eventId: op.eventId, reason: 'gone', message: 'An item or event you changed offline no longer exists, so that change was dropped.' })
          result.remaining--
        } else {
          result.stopped = 'network' // unknown server trouble: keep the op and retry later
          break
        }
      }
    }
    return result
  })().finally(() => running.delete(userId))
  running.set(userId, job)
  return job
}
