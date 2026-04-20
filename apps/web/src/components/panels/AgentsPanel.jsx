import React, { useMemo, useState } from 'react'
import {
  Bot, ChevronRight, Play, Wrench, AlertCircle, CheckCircle2,
  Loader2, Terminal, ChevronDown,
} from 'lucide-react'
import useStore from '../../store/useStore'
import { Section } from './_shared'
import {
  useAgentList,
  useAgentRun,
  useStartAgentRun,
} from '../../hooks/api/useAgents'

/**
 * AgentsPanel ("Ajanlar")
 *
 * Backend'deki ``/v1/agents`` framework'üne ilk UI yüzü. Üç bölüm:
 *
 *   1. Mevcut Ajanlar — registry'deki agent kartları. Bir karta
 *      tıklayınca sağdaki form + zaman çizelgesi o agent'a kilitlenir.
 *   2. Çalıştır — aktif operatör + opsiyonel prompt ile ``POST
 *      /v1/agents/{name}/runs`` çağırır, dönen ``AgentRun``'ı yerelde
 *      tutar.
 *   3. Son Çalışma — dönen run'ın step timeline'ını sırayla gösterir
 *      (plan → tool_call → tool_result → final).
 *
 * Bu dashboard v1 — hedef: framework'ün çalıştığını gözle doğrulamak +
 * gelecek LLM'li agent'larla aynı görsel dilin temelini atmak. İleride
 * gelenler (çok sekmeli run geçmişi, canlı SSE akışı, operatör-bazlı
 * filtreleme) aynı component'ı büyütür.
 */
export default function AgentsPanel() {
  const operator = useStore((s) => s.operator)

  const agentsQ  = useAgentList()
  const agents   = agentsQ.data?.agents ?? []

  // İlk agent otomatik seçili; list değişince (ya da boşalınca) yeniden
  // başlatılsın diye useMemo + key fallback.
  const [selectedName, setSelectedName] = useState(null)
  const activeName = useMemo(() => {
    if (selectedName && agents.some((a) => a.name === selectedName)) {
      return selectedName
    }
    return agents[0]?.name ?? null
  }, [selectedName, agents])

  const activeAgent = agents.find((a) => a.name === activeName) ?? null

  /* ── Run state ───────────────────────────────────────────
   * Run başlatıldığında dönen row'un id'sini saklıyoruz; timeline
   * endpoint onunla tekrar çekiliyor. AgentRun body'si yeterli olsa
   * bile steps (AgentStep[]) detayı ayrı endpoint'te. */
  const [prompt, setPrompt]         = useState('')
  const [runId,  setRunId]          = useState(null)
  const startMutation               = useStartAgentRun()

  const runQ  = useAgentRun(runId, { enabled: Boolean(runId), poll: false })
  const run   = runQ.data?.run ?? null
  const steps = runQ.data?.steps ?? []

  const onRun = async () => {
    if (!activeName || !operator) return
    try {
      const created = await startMutation.mutateAsync({
        name:     activeName,
        operator,
        prompt:   prompt.trim(),
        context:  {},
      })
      setRunId(created.id)
      // İstek terminal state döndürdüğü için timeline'ı hemen yenile —
      // start_run response'u ``run`` verir, ``steps`` yok.
      runQ.refetch()
    } catch (err) {
      // Mutation state'i UI'da gösterildiğinden burada ekstra işlem
      // yok; throw'u yutuyoruz ki konsol gürültüsü olmasın.
      console.warn('[AgentsPanel] run failed:', err?.detail || err?.message)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Panel başlığı ─────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 border-b border-ops-700/70 bg-ops-900/30 flex items-center gap-2">
        <Bot size={16} className="text-accent" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ops-500">
            Ajan Konsolu
          </div>
          <div className="text-sm font-semibold text-ops-100 truncate">
            {agents.length} ajan · operatör {operator}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Mevcut Ajanlar ─────────────────────────────── */}
        <Section icon={Bot} title="Mevcut Ajanlar" badge={agents.length || null} defaultOpen>
          <div className="px-2 space-y-1.5">
            {agentsQ.isLoading && (
              <StatusLine icon={Loader2} spin label="Registry yükleniyor..." />
            )}
            {agentsQ.isError && (
              <StatusLine icon={AlertCircle} tone="error"
                label={`Registry alınamadı — ${agentsQ.error?.detail || 'bilinmeyen hata'}`} />
            )}
            {agents.length === 0 && !agentsQ.isLoading && !agentsQ.isError && (
              <div className="px-2 py-1.5 text-[11px] text-ops-500 font-mono">
                Registry boş. Backend seed'i çalışmadı mı?
              </div>
            )}
            {agents.map((a) => (
              <AgentCard
                key={a.name}
                agent={a}
                active={a.name === activeName}
                onSelect={() => setSelectedName(a.name)}
              />
            ))}
          </div>
        </Section>

        {/* ── Çalıştır ──────────────────────────────────── */}
        {activeAgent && (
          <Section icon={Play} title="Çalıştır" defaultOpen>
            <div className="px-3 space-y-2">
              <label className="block">
                <span className="text-[10px] font-mono uppercase tracking-wider text-ops-500">
                  İsteğe bağlı prompt
                </span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={2}
                  placeholder={`Boş bırak → ajan varsayılan davranışta çalışır`}
                  className="mt-1 w-full bg-ops-900/70 border border-ops-700 rounded px-2 py-1.5 text-[12px] text-ops-100 font-mono placeholder:text-ops-600 focus:outline-none focus:border-accent/60"
                />
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={onRun}
                  disabled={startMutation.isPending || !operator}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider px-2.5 py-1.5 rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {startMutation.isPending ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Çalışıyor...
                    </>
                  ) : (
                    <>
                      <Play size={12} />
                      Başlat ({operator})
                    </>
                  )}
                </button>
                {startMutation.isError && (
                  <span className="text-[11px] text-red-400 font-mono">
                    {startMutation.error?.detail || 'Çalışma başlatılamadı'}
                  </span>
                )}
              </div>

              <div className="text-[10px] text-ops-500 font-mono leading-snug">
                Çalışma {operator} operatörü altında kaydedilir. Ajan
                tool'ları operatör scope'una otomatik bağlıdır.
              </div>
            </div>
          </Section>
        )}

        {/* ── Son Çalışma ───────────────────────────────── */}
        {runId && (
          <Section icon={Terminal} title="Son Çalışma" badge={run?.status || '...'} defaultOpen>
            <RunTimeline run={run} steps={steps} loading={runQ.isLoading} />
          </Section>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * AgentCard — registry kartı
 * ═══════════════════════════════════════════════════════════════════ */
function AgentCard({ agent, active, onSelect }) {
  const [open, setOpen] = useState(false)
  const toolCount = agent.tools?.length ?? 0
  return (
    <div
      className={`rounded-lg border transition-colors ${
        active
          ? 'border-accent/50 bg-accent/10'
          : 'border-ops-700 bg-ops-900/40 hover:border-ops-600'
      }`}
    >
      <button
        onClick={onSelect}
        className="w-full flex items-start gap-2 px-2.5 py-2 text-left"
      >
        <span
          className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
            active ? 'bg-accent' : 'bg-ops-600'
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-[12px] font-semibold ${active ? 'text-accent' : 'text-ops-100'}`}>
              {agent.name}
            </span>
            <span className="text-[10px] font-mono text-ops-500">
              · {toolCount} araç
            </span>
          </div>
          <div className="text-[11px] text-ops-400 leading-snug mt-0.5">
            {agent.description}
          </div>
        </div>
        <ChevronRight
          size={12}
          className={`shrink-0 mt-1 ${active ? 'text-accent' : 'text-ops-600'}`}
        />
      </button>

      {toolCount > 0 && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center gap-1 px-2.5 pb-1.5 text-left text-[10px] font-mono uppercase tracking-wider text-ops-500 hover:text-ops-300 transition-colors"
          >
            {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Araçlar
          </button>
          {open && (
            <div className="px-2.5 pb-2 space-y-0.5">
              {agent.tools.map((t) => (
                <div
                  key={t.name}
                  className="flex items-start gap-1.5 text-[11px] font-mono text-ops-400"
                >
                  <Wrench size={10} className="text-ops-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-ops-300">{t.name}</span>
                    <span className="text-ops-500"> — {t.description}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * RunTimeline — step zaman çizelgesi
 * ═══════════════════════════════════════════════════════════════════ */
function RunTimeline({ run, steps, loading }) {
  if (loading) {
    return (
      <div className="px-3 py-2">
        <StatusLine icon={Loader2} spin label="Timeline yükleniyor..." />
      </div>
    )
  }
  if (!run) {
    return (
      <div className="px-3 py-2 text-[11px] text-ops-500 font-mono">
        Henüz çalışma yok.
      </div>
    )
  }

  return (
    <div className="px-3 space-y-1.5">
      {/* Run özeti */}
      <RunHeader run={run} />

      {/* Step'ler */}
      {steps.length === 0 ? (
        <div className="text-[11px] text-ops-500 font-mono italic">
          Step kaydı yok.
        </div>
      ) : (
        <ol className="space-y-1">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ol>
      )}

      {/* Son özet */}
      {run.result && (
        <div className="mt-2 rounded border border-accent/30 bg-accent/5 px-2 py-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-accent/80 mb-1">
            Sonuç
          </div>
          <ResultBlock result={run.result} />
        </div>
      )}
      {run.error && (
        <div className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] font-mono text-red-300">
          {run.error}
        </div>
      )}
    </div>
  )
}

function RunHeader({ run }) {
  const Icon = run.status === 'done'
    ? CheckCircle2
    : run.status === 'error'
      ? AlertCircle
      : Loader2
  const tone = run.status === 'done'
    ? 'text-emerald-400'
    : run.status === 'error'
      ? 'text-red-400'
      : 'text-ops-300'
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-mono">
      <Icon size={11} className={`${tone} ${run.status === 'running' ? 'animate-spin' : ''}`} />
      <span className={tone}>{run.status}</span>
      <span className="text-ops-600">·</span>
      <span className="text-ops-400">{run.id.slice(0, 12)}…</span>
      {run.started_at && (
        <>
          <span className="text-ops-600">·</span>
          <span className="text-ops-500">{new Date(run.started_at).toLocaleTimeString()}</span>
        </>
      )}
    </div>
  )
}

const STEP_TONE = {
  plan:         { color: '#7AB8F0', label: 'Plan' },
  tool_call:    { color: '#E0A42C', label: 'Çağrı' },
  tool_result:  { color: '#8FCBB1', label: 'Sonuç' },
  final:        { color: '#D85A30', label: 'Final' },
}

function StepRow({ step }) {
  const [open, setOpen] = useState(false)
  const tone = STEP_TONE[step.kind] || { color: '#6A7F9F', label: step.kind }
  const headline = headlineFor(step)
  return (
    <li className="rounded border border-ops-700/70 bg-ops-900/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
      >
        <span
          className="shrink-0 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: `${tone.color}22`, color: tone.color }}
        >
          {tone.label}
        </span>
        <span className="flex-1 min-w-0 text-[11px] text-ops-200 truncate">
          {headline}
        </span>
        <span className="text-[10px] font-mono text-ops-500 shrink-0">
          #{step.index}
        </span>
        <span className="text-ops-500 shrink-0">
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
      </button>
      {open && (
        <pre className="px-2 pb-2 text-[10px] font-mono text-ops-400 overflow-x-auto whitespace-pre-wrap break-words">
          {JSON.stringify(step.payload, null, 2)}
        </pre>
      )}
    </li>
  )
}

function headlineFor(step) {
  const p = step.payload || {}
  if (step.kind === 'plan')        return p.summary || 'plan'
  if (step.kind === 'tool_call')   return `${p.tool || 'tool'} çağrıldı`
  if (step.kind === 'tool_result') {
    const out = p.output || {}
    if (typeof out.total === 'number') return `${p.tool} → total=${out.total}`
    if (Array.isArray(out.nodes))      return `${p.tool} → ${out.nodes.length} düğüm`
    return `${p.tool || 'tool'} sonucu`
  }
  if (step.kind === 'final')       return p.summary || 'final özet'
  return step.kind
}

function ResultBlock({ result }) {
  if (!result || typeof result !== 'object') {
    return <pre className="text-[11px] font-mono text-ops-200">{String(result)}</pre>
  }
  return (
    <div className="space-y-1">
      {result.summary && (
        <div className="text-[11px] text-ops-100 leading-snug">{result.summary}</div>
      )}
      {typeof result.total === 'number' && (
        <div className="text-[10px] font-mono text-ops-400">
          toplam: <span className="text-ops-200">{result.total}</span>
        </div>
      )}
      {Array.isArray(result.recent) && result.recent.length > 0 && (
        <div className="text-[10px] font-mono text-ops-400">
          son: <span className="text-ops-200">
            {result.recent
              .map((n) => (typeof n === 'string' ? n : n?.name ?? ''))
              .filter(Boolean)
              .join(', ')}
          </span>
        </div>
      )}
    </div>
  )
}

/* ── Küçük yardımcı ───────────────────────────────────── */
function StatusLine({ icon: Icon, label, spin = false, tone }) {
  const color = tone === 'error' ? 'text-red-400' : 'text-ops-400'
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono ${color}`}>
      <Icon size={12} className={spin ? 'animate-spin' : ''} />
      <span>{label}</span>
    </div>
  )
}
