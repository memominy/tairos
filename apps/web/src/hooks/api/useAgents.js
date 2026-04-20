/**
 * React Query hooks for the backend's ``/v1/agents`` endpoints.
 *
 * Mental model
 * ------------
 * The backend exposes three operations:
 *
 *   GET  /v1/agents                 — list registered agents + their tools
 *   POST /v1/agents/{name}/runs     — kick off a run, return final ``AgentRun``
 *                                     (synchronous for deterministic agents;
 *                                      will flip to async + pending when LLM
 *                                      agents land)
 *   GET  /v1/agents/runs/{id}       — run row + ordered step timeline
 *
 * These three hooks mirror that surface 1:1. The ``useAgentRun`` polling
 * interval is a forward-looking hook: today it isn't strictly needed
 * because ``start_run`` returns the terminal state, but when runs become
 * async the UI will want to poll until ``status`` is ``done`` or
 * ``error``. Keeping the hook shaped that way now means no refactor
 * later.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '../../lib/apiClient'

/** Query-key factory — keep invalidations centralised.
 *
 * ``runsList`` is keyed on the filter object so distinct operator /
 * agent / status combinations cache independently; invalidating
 * ``runsAll`` blows away every variant (which is what we want
 * whenever a new run is started or a polled run transitions).
 */
export const agentKeys = {
  all:            ['agents'],
  list:           ['agents', 'list'],
  runsAll:        ['agents', 'runs'],
  runsList:       (filters) => ['agents', 'runs', 'list', filters],
  run:            (id) => ['agents', 'runs', id],
  bridgeHealth:   ['agents', 'bridge', 'health'],
}

/**
 * List every registered agent + its tool descriptors.
 * Response shape: { agents: [{ name, description, tools: [...] }] }
 */
export function useAgentList({ enabled = true } = {}) {
  return useQuery({
    queryKey: agentKeys.list,
    queryFn:  ({ signal }) => apiGet('/v1/agents', { signal }),
    enabled,
    // Agent registry doesn't change at runtime — cache generously.
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch one run + its step timeline.
 *
 * Pass ``{ poll: true }`` to tail the run until a terminal status;
 * the async dispatch path (LLM agents) returns a pending row from
 * ``POST`` and only flips to done/error after the background task
 * finishes. The callback returns ``false`` when a terminal state is
 * seen so we stop polling cleanly instead of hammering a finished
 * row forever.
 */
export function useAgentRun(runId, { enabled = true, poll = false } = {}) {
  return useQuery({
    queryKey: agentKeys.run(runId),
    queryFn:  ({ signal }) => apiGet(`/v1/agents/runs/${encodeURIComponent(runId)}`, { signal }),
    enabled:  enabled && Boolean(runId),
    refetchInterval: (query) => {
      if (!poll) return false
      const status = query.state.data?.run?.status
      // Terminal states include ``cancelled`` — operator cancelled
      // mid-run, task unwound, row's final. No point repolling a
      // row that won't change shape until the next run.
      if (status === 'done' || status === 'error' || status === 'cancelled') return false
      return 1500
    },
  })
}


/**
 * Paginated list of runs — "Çalışma Geçmişi" panel feeds from this.
 *
 * Filters mirror the backend query params (``operator``, ``agent``,
 * ``status``, ``limit``, ``offset``). Everything is optional; the
 * server defaults to newest 25 regardless of operator/agent when
 * nothing is passed.
 *
 * ``poll`` repeats the query on a short interval whenever there's at
 * least one non-terminal row visible — catches the "user started an
 * async LLM run, scrolled elsewhere, came back" case where the row
 * transitions without any mutation firing.
 */
export function useAgentRuns(
  { operator, agent, status, limit = 25, offset = 0, enabled = true, poll = false } = {},
) {
  const filters = { operator, agent, status, limit, offset }

  // Build query string skipping unset filters — keeps the URL tidy so
  // backend logs are readable and cache keys don't drift on undefineds.
  const qs = new URLSearchParams()
  if (operator) qs.set('operator', operator)
  if (agent)    qs.set('agent',    agent)
  if (status)   qs.set('status',   status)
  qs.set('limit',  String(limit))
  qs.set('offset', String(offset))

  return useQuery({
    queryKey: agentKeys.runsList(filters),
    queryFn:  ({ signal }) => apiGet(`/v1/agents/runs?${qs.toString()}`, { signal }),
    enabled,
    staleTime: 5_000,
    refetchInterval: (query) => {
      if (!poll) return false
      const runs = query.state.data?.runs || []
      const hasOngoing = runs.some((r) => r.status === 'pending' || r.status === 'running')
      return hasOngoing ? 2000 : false
    },
  })
}

/**
 * Poll the Claude Max bridge health (``scripts/assistant-server.mjs``).
 *
 * The backend proxies the bridge's ``/health`` and returns a uniform
 * shape: ``{ ok, bridge_url, version?, cmd?, error? }``. We re-check
 * every 30s by default — cheap enough that the operator sees a red
 * dot turn green within half a minute of starting the bridge, but not
 * so fast that an offline bridge hammers the API.
 *
 * The panel gates two UX bits on this:
 *   - header status dot (always visible)
 *   - pre-flight warning on the Çalıştır section when an LLM agent
 *     is selected and ``ok === false``
 */
export function useBridgeHealth({ enabled = true, pollMs = 30_000 } = {}) {
  return useQuery({
    queryKey: agentKeys.bridgeHealth,
    queryFn:  ({ signal }) => apiGet('/v1/agents/bridge/health', { signal }),
    enabled,
    // Short staleTime so mutations / manual refetch bust the cache;
    // refetchInterval pushes a fresh probe on the poll schedule.
    staleTime:       10_000,
    refetchInterval: pollMs,
    // Don't thrash during the first reload if the API is slow —
    // a stale health card is fine until the next tick.
    refetchOnWindowFocus: false,
  })
}


/**
 * Cancel an in-flight (or stuck) run.
 *
 * The endpoint is idempotent — POSTing against a terminal run returns
 * the row as-is with no side effect, so the UI can fire-and-forget
 * without local "has this been cancelled?" bookkeeping. On success we
 * seed the per-run cache with the refreshed row so the timeline flips
 * to the cancelled state immediately instead of waiting for the next
 * poll tick.
 */
export function useCancelAgentRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId) =>
      apiPost(`/v1/agents/runs/${encodeURIComponent(runId)}/cancel`, {}),
    onSuccess: (run) => {
      qc.setQueryData(agentKeys.run(run.id), (prev) => ({
        ...(prev || {}),
        run,
        steps: prev?.steps || [],
      }))
      qc.invalidateQueries({ queryKey: agentKeys.runsAll })
    },
  })
}


/**
 * Start an agent run. Returns the terminal ``AgentRun`` row on success
 * (sync today; ``status: 'pending'`` when we move to async dispatch).
 *
 * The ``onSuccess`` callback is where ergonomics live — invalidate the
 * list of runs so future "recent runs" views refresh automatically.
 */
export function useStartAgentRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, operator, prompt = '', context = {} }) =>
      apiPost(`/v1/agents/${encodeURIComponent(name)}/runs`, {
        operator, prompt, context,
      }),
    onSuccess: (run) => {
      // Seed the per-run cache so the panel can read the result without
      // an extra round-trip. The timeline endpoint returns the same
      // ``run`` shape plus ``steps``; we don't have those here, so the
      // caller either refetches or uses the run object inline.
      qc.setQueryData(agentKeys.run(run.id), (prev) => ({
        ...(prev || {}),
        run,
        steps: prev?.steps || [],
      }))
      qc.invalidateQueries({ queryKey: agentKeys.runsAll })
    },
  })
}
