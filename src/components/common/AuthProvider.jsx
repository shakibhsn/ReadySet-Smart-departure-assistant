import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from '@/lib/authContext'
import { ApiError, setUnauthorizedHandler } from '@/lib/apiClient'
import { clearToken, getToken, setToken } from '@/lib/tokenStorage'
import { currentUserRequest, loginRequest, logoutRequest, registerRequest } from '@/services/authApi'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // If a token exists we must verify it before deciding what to render, so start in "loading".
  const [loading, setLoading] = useState(() => Boolean(getToken()))
  // True right after sign-up so the dashboard can show a one-time welcome message.
  const [justRegistered, setJustRegistered] = useState(false)

  const clearSession = useCallback(() => {
    clearToken()
    setJustRegistered(false)
    setUser(null)
  }, [])

  // Any authenticated request that returns 401 (expired / revoked user) ends the session.
  useEffect(() => {
    setUnauthorizedHandler(clearSession)
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  // Restore the session on first load.
  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    currentUserRequest()
      .then((res) => !cancelled && setUser(res.data.user))
      .catch((err) => {
        // 401 is handled by the unauthorized handler. Other errors (e.g. server offline) keep the
        // token so a refresh can retry, but the user is treated as signed out for now.
        if (!cancelled && !(err instanceof ApiError && err.status === 401)) setUser(null)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async ({ email, password, remember = false }) => {
    const res = await loginRequest({ email, password })
    setToken(res.data.token, { remember })
    setUser(res.data.user)
    return res.data.user
  }, [])

  const register = useCallback(async (form) => {
    const res = await registerRequest(form)
    // When email verification is mandatory the backend returns NO token: the user must verify first.
    if (res.data.token) {
      setToken(res.data.token)
      setJustRegistered(true)
      setUser(res.data.user)
    }
    return { user: res.data.user, verificationRequired: Boolean(res.data.verificationRequired) }
  }, [])

  const logout = useCallback(async () => {
    // JWTs are stateless: the server cannot revoke them, so logging out = discarding the token.
    // The request is best effort and its failure must never block logging out locally.
    await logoutRequest().catch(() => {})
    clearSession()
  }, [clearSession])

  const refreshUser = useCallback(async () => {
    const res = await currentUserRequest()
    setUser(res.data.user)
    return res.data.user
  }, [])

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: Boolean(user), justRegistered, dismissWelcome: () => setJustRegistered(false), login, register, logout, refreshUser }),
    [user, loading, justRegistered, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
