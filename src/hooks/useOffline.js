import { useContext } from 'react'
import { OfflineContext } from '@/lib/offline/offlineContext'

/** Connection state and offline sync state. Safe to call outside the provider (reports "online, nothing pending"). */
export const useOffline = () => useContext(OfflineContext)
