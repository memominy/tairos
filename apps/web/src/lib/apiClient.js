/**
 * Thin fetch wrapper for the Tairos backend (apps/api).
 *
 * Design goals
 * ------------
 * 1. **No network library** — `fetch` is plenty, and avoiding axios/ky
 *    keeps the frontend bundle lean. The wrapper only exists to DRY up
 *    the error-handling, JSON decoding, and base-URL concatenation.
 * 2. **Base URL is build-time configurable.** `VITE_API_URL` overrides
 *    the default `http://localhost:8000`. In a future deployment
 *    (frontend + backend behind the same reverse proxy) this becomes
 *    an empty string and requests go to `/v1/...` same-origin.
 * 3. **Standard error shape.** Every non-2xx surfaces as an
 *    `ApiError` with `status`, `detail`, and the raw URL. React Query
 *    hooks branch on `error instanceof ApiError` cleanly.
 * 4. **Abortable.** Every call accepts `signal`, which React Query
 *    passes in automatically so unmounted components don't keep
 *    the request alive.
 *
 * Usage from hooks:
 *   import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/apiClient'
 *   const nodes = await apiGet('/v1/nodes', { params: { operator: 'TR' } })
 */

const ENV_BASE = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : undefined
export const API_BASE = (ENV_BASE ?? 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(status, detail, { url } = {}) {
    super(`[api ${status}] ${detail || 'request failed'}`)
    this.status = status
    this.detail = detail
    this.url    = url
  }
}

function buildUrl(path, params) {
  const base = path.startsWith('http') ? path : `${API_BASE}${path}`
  if (!params) return base
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) v.forEach((item) => search.append(k, String(item)))
    else search.append(k, String(v))
  }
  const qs = search.toString()
  return qs ? `${base}?${qs}` : base
}

async function request(method, path, { params, body, signal, headers } = {}) {
  const url = buildUrl(path, params)
  const init = {
    method,
    signal,
    headers: { 'Accept': 'application/json', ...(headers || {}) },
  }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    // Network failure / CORS block / backend offline. We intentionally
    // don't retry here — React Query handles retry policy higher up.
    if (err?.name === 'AbortError') throw err
    throw new ApiError(0, err?.message || 'network error', { url })
  }

  // 204 No Content is a valid success response with no body.
  if (res.status === 204) return null

  // Try to pull a structured error body; fall back to raw text.
  if (!res.ok) {
    let detail = res.statusText
    try {
      const payload = await res.json()
      detail = payload?.detail ?? JSON.stringify(payload)
    } catch {
      try { detail = await res.text() } catch { /* keep statusText */ }
    }
    throw new ApiError(res.status, detail, { url })
  }

  // Most endpoints return JSON; if not, return the raw response so
  // the caller can decide.
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res
}

export const apiGet    = (path, opts) => request('GET',    path, opts)
export const apiPost   = (path, body, opts) => request('POST',   path, { ...opts, body })
export const apiPatch  = (path, body, opts) => request('PATCH',  path, { ...opts, body })
export const apiDelete = (path, opts) => request('DELETE', path, opts)
