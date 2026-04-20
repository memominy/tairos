/**
 * React Query hooks for the backend's ``/v1/nodes`` endpoints.
 *
 * NOTE (transition phase)
 * -----------------------
 * The frontend currently owns node state in the Zustand store + a
 * debounced ``localStorage`` persister. These hooks are the forward
 * path — they let new components reach the backend without blowing
 * up the rest of the app. Migration happens slice-by-slice:
 *
 *   1. New components that need node data import ``useBackendNodes``.
 *   2. The existing Zustand store stays authoritative until the
 *      backend has parity + the seed script has been run.
 *   3. A later step will replace ``useVisibleNodes`` with a hook that
 *      reads from React Query and hydrates the store on first load.
 *
 * Until step 3 the two stores will co-exist; that's intentional so a
 * backend outage never breaks the UI.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/apiClient'

/** Query-key factory — centralised so invalidations stay in sync. */
export const nodeKeys = {
  all:               ['nodes'],
  byOperator:        (operator) => ['nodes', { operator }],
  byId:              (id)       => ['nodes', 'byId', id],
}

/** List every node for a given operator code (TR, US, RU, ...). */
export function useBackendNodes(operator, { enabled = true } = {}) {
  return useQuery({
    queryKey: nodeKeys.byOperator(operator),
    queryFn:  ({ signal }) => apiGet('/v1/nodes', { params: { operator }, signal }),
    enabled:  enabled && Boolean(operator),
  })
}

/** Fetch one node by id. Rarely useful from the UI; kept for symmetry. */
export function useBackendNode(id, { enabled = true } = {}) {
  return useQuery({
    queryKey: nodeKeys.byId(id),
    queryFn:  ({ signal }) => apiGet(`/v1/nodes/${encodeURIComponent(id)}`, { signal }),
    enabled:  enabled && Boolean(id),
  })
}

export function useCreateBackendNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload) => apiPost('/v1/nodes', payload),
    onSuccess: (created) => {
      // Invalidate the operator list we just added to; other
      // operators don't need a refetch.
      qc.invalidateQueries({ queryKey: nodeKeys.byOperator(created.operator) })
    },
  })
}

export function useUpdateBackendNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) =>
      apiPatch(`/v1/nodes/${encodeURIComponent(id)}`, patch),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: nodeKeys.byOperator(updated.operator) })
      qc.invalidateQueries({ queryKey: nodeKeys.byId(updated.id) })
    },
  })
}

export function useDeleteBackendNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }) =>
      apiDelete(`/v1/nodes/${encodeURIComponent(id)}`),
    onSuccess: (_res, { id, operator }) => {
      if (operator) qc.invalidateQueries({ queryKey: nodeKeys.byOperator(operator) })
      qc.invalidateQueries({ queryKey: nodeKeys.byId(id) })
    },
  })
}
