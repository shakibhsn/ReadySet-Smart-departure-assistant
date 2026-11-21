import { createContext } from 'react'

export const OfflineContext = createContext({ online: true, pending: 0, conflicts: [], snapshotAt: null, syncVersion: 0, syncing: false, flushNow: async () => {}, dismissConflicts: () => {}, standalone: false })
