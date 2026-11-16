import { createContext } from 'react'

// Holds temporary, in-memory frontend state (events, checklists, notifications, settings).
// Replaced by API-backed data in a later phase.
export const AppStateContext = createContext(null)
