export type AuthUser = { id: string; email?: string; name?: string }
import { apiUrl, EXTRA_HEADERS } from '../config'

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'))
  return m ? decodeURIComponent(m[1]) : ''
}

const jsonHeaders = { 'Content-Type': 'application/json', ...EXTRA_HEADERS }

export async function signup(email: string, password: string, name: string) {
  const r = await fetch(apiUrl('/auth/signup'), {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ email, password, name })
  })
  if (!r.ok) throw new Error('signup_failed')
  const j = await r.json()
  return j as { success: boolean; user: AuthUser }
}

export async function login(email: string, password: string) {
  const r = await fetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ email, password })
  })
  if (!r.ok) throw new Error('login_failed')
  const j = await r.json()
  return j as { success: boolean; user: AuthUser }
}

export async function logout() {
  const csrf = getCookie('csrf_token')
  const r = await fetch(apiUrl('/auth/logout'), {
    method: 'POST',
    headers: { 'x-csrf-token': csrf, ...EXTRA_HEADERS },
    credentials: 'include'
  })
  if (!r.ok) throw new Error('logout_failed')
  return await r.json()
}

export async function refresh() {
  const csrf = getCookie('csrf_token')
  const r = await fetch(apiUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'x-csrf-token': csrf, ...EXTRA_HEADERS },
    credentials: 'include'
  })
  if (!r.ok) throw new Error('refresh_failed')
  return await r.json()
}

export async function getMe(): Promise<AuthUser | null> {
  const r = await fetch(apiUrl('/auth/me'), { method: 'GET', credentials: 'include', headers: EXTRA_HEADERS })
  if (!r.ok) return null
  try { return (await r.json()) as AuthUser } catch { return null }
}

export async function getProfile(): Promise<AuthUser | null> {
  const r = await fetch(apiUrl('/auth/profile'), { method: 'GET', credentials: 'include', headers: EXTRA_HEADERS })
  if (!r.ok) return null
  try { return (await r.json()) as AuthUser } catch { return null }
}
