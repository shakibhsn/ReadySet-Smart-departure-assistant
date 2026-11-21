// The signed-in user's id, for the API fallbacks (services are plain modules, not React). Set and cleared by OfflineProvider.
let current = null
export const setOfflineUser = (id) => {
  current = id ?? null
}
export const getOfflineUser = () => current

// Logout guard: lets the offline layer try one last sync and warn before unsynced changes are discarded.
let guard = null
export const registerLogoutGuard = (fn) => {
  guard = fn
  return () => {
    if (guard === fn) guard = null
  }
}
/** true = go ahead and sign out. */
export async function confirmLogout() {
  try {
    return guard ? await guard() : true
  } catch {
    return true
  }
}
