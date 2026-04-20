/**
 * Singleton QueryClient for the frontend.
 *
 * Pulled out of main.jsx so test harnesses and storybook can reuse
 * the same configuration without duplicating defaults. Exported as a
 * factory *and* a module-level instance — tests call the factory to
 * get a fresh isolated cache per test.
 */
import { QueryClient } from '@tanstack/react-query'

/**
 * Reasonable defaults for the tactical console:
 *
 * - staleTime 30s: operator-visible data (inventory, saved views)
 *   rarely churns. 30 seconds keeps the UI snappy and batches
 *   refetches across panel re-mounts.
 * - refetchOnWindowFocus=false: the map is already a focus-heavy
 *   workspace (toggling between tabs while a polygon is being
 *   drawn); auto-refetch fires an unnecessary GET every time.
 * - retry with a cap of 1: the backend lives on localhost. If the
 *   first attempt failed it almost certainly means the service is
 *   down, not a flaky network.
 * - gcTime 5min: keep inactive query data around for a while so
 *   switching between panels doesn't redownload immediately.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime:    5 * 60_000,
        retry:     1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

export const queryClient = createQueryClient()
