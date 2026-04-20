/**
 * Polls the backend's ``/v1/health`` endpoint and surfaces its
 * reachability as a simple boolean + error object.
 *
 * The frontend still treats localStorage as the source of truth for
 * now; this hook is how UI chrome (a TopBar indicator, a sync badge)
 * knows whether it *could* hit the backend if it wanted to. Once the
 * migration to server-backed state is complete, the same hook gates
 * "disable edit actions if backend unreachable" semantics.
 *
 * Cadence: every 20 seconds — cheap enough to be background noise,
 * fast enough that flipping the backend on is noticed within a
 * reasonable demo window. Tuned for dev; raise the interval for
 * production.
 */
import { useQuery } from '@tanstack/react-query'
import { apiGet, ApiError } from '../../lib/apiClient'

const HEALTH_KEY = ['backend', 'health']

export function useBackendHealth() {
  const query = useQuery({
    queryKey: HEALTH_KEY,
    queryFn: ({ signal }) => apiGet('/v1/health', { signal }),
    // Run the moment any component mounts this hook, and keep polling
    // in the background so a dev flipping the server on sees the badge
    // update without refreshing.
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
    // Treat transient network errors as "offline" rather than crashing:
    // we surface the state via booleans below.
    retry: 0,
  })

  return {
    online:   query.isSuccess,
    offline:  query.isError,
    error:    query.error instanceof ApiError ? query.error : null,
    loading:  query.isLoading,
    // Expose raw payload for future use (backend version, build id, …).
    data:     query.data,
  }
}
