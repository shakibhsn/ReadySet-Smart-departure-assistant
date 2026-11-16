import { createContext } from 'react'

// Holds a "data version" that is bumped after every create / update / delete so that every
// mounted event query refetches. Created fresh for each signed-in user (see UserScopedAppState).
export const EventsCacheContext = createContext(null)
