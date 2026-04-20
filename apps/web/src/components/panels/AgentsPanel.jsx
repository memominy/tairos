import React, { useMemo, useState } from 'react'
import {
  Bot, ChevronRight, Play, Wrench, AlertCircle, CheckCircle2,
  Loader2, Terminal, ChevronDown, Sparkles, Cpu, ZapOff, History,
  Ban, OctagonX,
} from 'lucide-react'
import useStore from '../../store/useStore'
import { Section } from './_shared'
import {
  useAgentList,
  useAgentRun,
  useAgentRuns,
  useBridgeHealth,
  useCancelAgentRun,
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
  const operator     = useStore((s) => s.operator)
  const focusCountry = useStore((s) => s.focusCountry)

  const agentsQ  = useAgentList()
  const agents   = agentsQ.data?.agents ?? []
  const bridgeQ  = useBridgeHealth()
  const bridge   = bridgeQ.data ?? null

  // Operatöre ait son 20 çalışma. ``poll: true`` ile arkada biten LLM
  // run'larını — kullanıcı başka panele geçip dönse bile — otomatik
  // yakalıyoruz; terminal state'e düşünce hook içinden polling kendi
  // duruyor. Filtre operatör bazlı: TR, US'in kayıtlarını görsel
  // olarak karıştırmasın.
  const runsQ       = useAgentRuns({
    operator,
    limit:   20,
    enabled: Boolean(operator),
    poll:    true,
  })
  const recentRuns  = runsQ.data?.runs  ?? []
  const recentTotal = runsQ.data?.total ?? 0

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
  const activeIsLlm = activeAgent?.kind === 'llm'

  // When the selected agent needs the bridge and the bridge is down,
  // gate the run button so the operator sees a clear warning instead
  // of a cryptic "LLM köprüsüne erişilemedi" in the final step.
  const llmBridgeDown =
    activeIsLlm && bridgeQ.isFetched && bridge && bridge.ok === false

  /* ── Run state ───────────────────────────────────────────
   * Run başlatıldığında dönen row'un id'sini saklıyoruz; timeline
   * endpoint onunla tekrar çekiliyor. Deterministik ajanlar POST
   * dönüşünde `done` verir; LLM ajanları `pending` döner ve arkada
   * asenkron task'la ilerler — ``poll: true`` ile runtime'ı otomatik
   * olarak terminal state'e kadar takip ediyoruz. */
  const [prompt, setPrompt]         = useState('')
  const [runId,  setRunId]          = useState(null)
  // Model override, per-run. Empty string = fall through to the agent's
  // pinned model / deploy default. Only surfaced for LLM agents; it's a
  // no-op on deterministic ones (they don't call the bridge) so we
  // just hide the control rather than disabling it.
  const [modelOverride, setModelOverride] = useState('')
  const startMutation               = useStartAgentRun()
  const cancelMutation              = useCancelAgentRun()

  const runQ  = useAgentRun(runId, { enabled: Boolean(runId), poll: true })
  const run   = runQ.data?.run ?? null
  const steps = runQ.data?.steps ?? []

  const onCancel = () => {
    if (!runId || !run || !RUN_IN_PROGRESS.has(run.status)) return
    cancelMutation.mutate(runId)
  }

  const onRun = async () => {
    if (!activeName || !operator) return
    // Operatörün anlık durumundan "gözlem" verisini context'e enjekte et —
    // ajan (özellikle LLM tabanlıları) kullanıcının şu an haritada neye
    // odaklandığını bilsin. Sadece doğrudan ilgili alanları geçiyoruz;
    // store tümüyle sızarsa prompt bağlamı kirlenir ve LLM dağılır.
    const context = {}
    if (focusCountry) context.focus_country = focusCountry
    // Only ship ``model`` when the operator picked something concrete;
    // blank = "Varsayılan" and backend ``_resolve_model`` expects a
    // missing key (or empty string, which it also tolerates) to mean
    // "fall through to agent/deploy default". Sending it only when
    // non-empty keeps the context blob legible in the run-history view.
    if (activeIsLlm && modelOverride) context.model = modelOverride

    try {
      const created = await startMutation.mutateAsync({
        name:     activeName,
        operator,
        prompt:   prompt.trim(),
        context,
      })
      // Mutation onSuccess cache'i seedledi; useAgentRun orada
      // devralıp polling'e başlıyor. Manuel refetch gerekmez.
      setRunId(created.id)
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

        {/* Claude Max köprüsü sağlık göstergesi — LLM ajanları için
            zorunlu bağımlılık. Kırmızı → köprü kapalı, sarı → veri
            yok / ilk probu bekliyoruz, yeşil → tamam. */}
        <BridgeHealthDot health={bridge} loading={bridgeQ.isLoading} />
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

              {/* Model seçici — yalnızca LLM ajanlarında. Deterministik
                  ajanlarda köprüye hiç çıkılmadığı için kontrol gizli
                  (disabled değil) kalıyor ki UI kirli görünmesin.
                  Seçim, ``context.model`` olarak ajana geçiyor;
                  backend ``_resolve_model`` önceliği:
                    ctx.model → agent.model → settings.llm_model. */}
              {activeIsLlm && (
                <ModelSelect
                  value={modelOverride}
                  onChange={setModelOverride}
                  disabled={startMutation.isPending}
                />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={onRun}
                  disabled={startMutation.isPending || !operator || llmBridgeDown}
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

              {/* LLM ajan + köprü kapalı → run'a gitmeden net uyarı
                  ver. Aksi halde operatör butonu tıklar, 5-10 saniye
                  bekler, sonra "LLM köprüsüne erişilemedi" final'i
                  gelir — anlamsız bir gecikme. */}
              {llmBridgeDown && (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5">
                  <div className="flex items-start gap-1.5">
                    <ZapOff size={12} className="text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-[11px] text-amber-200 leading-snug font-mono">
                      <div className="font-semibold">Claude Max köprüsü kapalı</div>
                      <div className="text-amber-300/80 mt-0.5">
                        Bu ajan LLM tabanlı. Çalıştırmadan önce
                        <code className="mx-1 px-1 bg-ops-900/60 rounded">
                          npm&nbsp;run&nbsp;assistant
                        </code>
                        ile yerel köprüyü başlat.
                      </div>
                      {bridge?.error && (
                        <div className="text-amber-400/70 mt-0.5 text-[10px]">
                          detay: {bridge.error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="text-[10px] text-ops-500 font-mono leading-snug">
                Çalışma {operator} operatörü altında kaydedilir. Ajan
                tool'ları operatör scope'una otomatik bağlıdır.
                {activeIsLlm && (
                  <>
                    {' '}LLM ajanları <code className="text-accent">localhost:8787</code>
                    köprüsünü kullanır.
                  </>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* ── Son Çalışma ───────────────────────────────── */}
        {runId && (
          <Section
            icon={Terminal}
            title="Son Çalışma"
            badge={RUN_STATUS[run?.status]?.label || run?.status || '...'}
            defaultOpen
          >
            <RunTimeline
              run={run}
              steps={steps}
              loading={runQ.isLoading}
              onCancel={onCancel}
              cancelPending={cancelMutation.isPending}
              cancelError={cancelMutation.error}
            />
          </Section>
        )}

        {/* ── Çalışma Geçmişi ───────────────────────────────
            Operatöre ait son 20 çalışma. Tek tık, üstteki "Son
            Çalışma" bölümüne yüklenir — operatör eski bir run'ın
            timeline'ını incelemek istediğinde yeniden çalıştırmak
            zorunda kalmaz. Varsayılan kapalı: ilk açılışta dikkat
            dağıtmasın, gerektiğinde açılsın. Rozet: "görünen / toplam"
            → sayı 20'yi geçince operatör daha fazlasının bulunduğunu
            görsün (şimdilik scroll yok, ileride eklenecek). */}
        <Section
          icon={History}
          title="Çalışma Geçmişi"
          badge={
            recentTotal > recentRuns.length
              ? `${recentRuns.length} / ${recentTotal}`
              : (recentTotal || null)
          }
        >
          <RunHistoryList
            runs={recentRuns}
            loading={runsQ.isLoading}
            error={runsQ.error}
            activeId={runId}
            onSelect={setRunId}
          />
        </Section>
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
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[12px] font-semibold ${active ? 'text-accent' : 'text-ops-100'}`}>
              {agent.name}
            </span>
            <KindBadge kind={agent.kind} />
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
function RunTimeline({ run, steps, loading, onCancel, cancelPending, cancelError }) {
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

  const canCancel = RUN_IN_PROGRESS.has(run.status) && typeof onCancel === 'function'

  return (
    <div className="px-3 space-y-1.5">
      {/* Run özeti + iptal butonu aynı satırda — operatör uzun bir run
          başlattıysa header'dan direkt durdurabilsin. Terminal run'larda
          buton gizli (disabled değil) — basınca hiçbir şey olmayan buton
          görünümü konsolu kirletiyor. */}
      <div className="flex items-center justify-between gap-2">
        <RunHeader run={run} />
        {canCancel && (
          <button
            onClick={onCancel}
            disabled={cancelPending}
            title="Çalışmayı iptal et"
            className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {cancelPending ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <Ban size={10} />
            )}
            Durdur
          </button>
        )}
      </div>

      {cancelError && (
        <div className="text-[10px] font-mono text-red-400">
          iptal başarısız: {cancelError?.detail || cancelError?.message || 'bilinmeyen hata'}
        </div>
      )}

      {/* Step'ler — her satıra run başlangıcından bu yana geçen süreyi
          bastırıyoruz ki "hangi step ne kadar sürdü?" tek bakışta okunsun.
          Kritik LLM debug aracı: tool call 5s → tool result 5.3s → final
          8.7s gibi bir dizi hangi turda ne kadar beklendiğini gösterir. */}
      {steps.length === 0 ? (
        <div className="text-[11px] text-ops-500 font-mono italic">
          Step kaydı yok.
        </div>
      ) : (
        <ol className="space-y-1">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} startedAt={run.started_at} />
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

// Lokalize etiket + görsel ton her durum için: pending/running
// arasında da net bir fark olsun (biri "sıraya girdi", diğeri
// "çalışıyor"). Icon + renk birlikte okunur → hızlı tarama.
const RUN_STATUS = {
  pending:   { icon: Loader2,      tone: 'text-ops-400',     label: 'bekliyor',    spin: false },
  running:   { icon: Loader2,      tone: 'text-accent',      label: 'çalışıyor',   spin: true  },
  done:      { icon: CheckCircle2, tone: 'text-emerald-400', label: 'tamamlandı',  spin: false },
  error:     { icon: AlertCircle,  tone: 'text-red-400',     label: 'hata',        spin: false },
  cancelled: { icon: OctagonX,     tone: 'text-amber-400',   label: 'iptal',       spin: false },
}

// States at which Başlat is re-armable / Durdur is meaningful. Centralising
// the set so UI call-sites agree on "is this run in progress?" — any status
// not in here is terminal from the operator's POV.
const RUN_IN_PROGRESS = new Set(['pending', 'running'])

// Per-run model override. The Claude Code CLI (reached via
// ``scripts/assistant-server.mjs``) accepts the short aliases "haiku" /
// "sonnet" / "opus" and resolves them to the current generation at call
// time. Operators pick here when they want to trade latency vs depth
// per task:
//   * Haiku  → tarama, sınıflandırma, kısa özet (saniyede tamamlanır).
//   * Sonnet → çoğu analiz işi için dengeli seçim (varsayılan istikrar).
//   * Opus   → planlama, çok adımlı muhakeme, zor istihbarat briefi.
// Empty value = "Varsayılan": let the agent / bridge / env decide.
// Keeping the list hardcoded rather than fetching from /v1/agents means
// the dropdown still works when the bridge is offline (the operator can
// pick an intent ahead of time and bring it up).
const MODEL_OPTIONS = [
  { value: '',       label: 'Varsayılan', hint: 'Ajan/bridge seçer'    },
  { value: 'haiku',  label: 'Haiku',      hint: 'Hızlı / ucuz'         },
  { value: 'sonnet', label: 'Sonnet',     hint: 'Dengeli'              },
  { value: 'opus',   label: 'Opus',       hint: 'Derin analiz'         },
]

function RunHeader({ run }) {
  const state = RUN_STATUS[run.status] ?? {
    icon: Loader2, tone: 'text-ops-400', label: run.status, spin: false,
  }
  const Icon = state.icon
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-mono">
      <Icon size={11} className={`${state.tone} ${state.spin ? 'animate-spin' : ''}`} />
      <span className={state.tone}>{state.label}</span>
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

function StepRow({ step, startedAt }) {
  const [open, setOpen] = useState(false)
  const tone = STEP_TONE[step.kind] || { color: '#6A7F9F', label: step.kind }
  const headline = headlineFor(step)
  // Göreceli geçen süre (run başlangıcından itibaren saniye). Mutlak
  // timestamp'ten daha okunaklı: "hangi step ne kadar sürdü?" sorusuna
  // tek bakışta yanıt veriyor. startedAt yoksa (ör. ajan henüz
  // persist_run sonrası ama _update_run(running) öncesinde step yazmadıysa)
  // fallback olarak ISO HH:MM:SS gösteriyoruz.
  const elapsed = formatElapsed(step.created_at, startedAt)
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
        {elapsed && (
          <span
            className="text-[10px] font-mono text-ops-500 shrink-0 tabular-nums"
            title={step.created_at}
          >
            {elapsed}
          </span>
        )}
        <span className="text-[10px] font-mono text-ops-500 shrink-0">
          #{step.index}
        </span>
        <span className="text-ops-500 shrink-0">
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
      </button>
      {open && <StepBody step={step} />}
    </li>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * StepBody — expanded body for a single step
 *
 * Switches on (kind, tool) to render tool-specific payloads readably
 * — e.g. web_fetch's long ``text`` becomes a collapsible preview, and
 * rss_fetch's ``items`` list shows as titled rows with their links.
 * Anything without a typed renderer falls through to a pretty-JSON
 * block so we never hide data from the operator.
 * ═══════════════════════════════════════════════════════════════════ */
function StepBody({ step }) {
  const { kind, payload = {} } = step

  if (kind === 'plan') {
    return <PlanBody input={payload} />
  }

  if (kind === 'tool_result' && payload.output) {
    if (payload.tool === 'web_fetch') {
      return <WebFetchResultBody input={payload.output} />
    }
    if (payload.tool === 'rss_fetch') {
      return <RssFetchResultBody input={payload.output} />
    }
  }

  // Fallback: pretty-print JSON. Still the safest default — new tools
  // get a readable dump on day one, typed renderers come later.
  return <JsonBlock value={payload} />
}

/* Plan adımının tipli görünümü. Payload: ``{summary, operator, prompt,
 * model, max_iter, tool_names}``. Summary zaten başlıkta görünüyor;
 * body operatörün "bu run hangi model + hangi tool seti + hangi
 * bağlamla başladı?" sorusuna tek bakışta cevap versin. Prompt boşsa
 * satırı tamamen gizliyoruz — gereksiz "(boş)" rozetleri panel
 * okunabilirliğini bozuyor. */
function PlanBody({ input }) {
  const {
    operator, prompt, model, max_iter,
    tool_names = [],
  } = input || {}

  const metaRow = [
    model    && { label: 'model',    value: model },
    operator && { label: 'operatör', value: operator },
    typeof max_iter === 'number' && { label: 'tur üst sınırı', value: max_iter },
  ].filter(Boolean)

  return (
    <div className="px-2 pb-2 space-y-1.5">
      {metaRow.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono">
          {metaRow.map((m) => (
            <span key={m.label} className="text-ops-400">
              <span className="text-ops-600">{m.label}: </span>
              <span className="text-ops-200">{m.value}</span>
            </span>
          ))}
        </div>
      )}

      {tool_names.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tool_names.map((name) => (
            <span
              key={name}
              className="text-[10px] font-mono text-ops-300 bg-ops-800/60 border border-ops-700 rounded px-1.5 py-0.5"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {prompt && (
        <div className="text-[11px] text-ops-300 leading-snug whitespace-pre-wrap break-words rounded border border-ops-700/70 bg-ops-900/40 p-1.5">
          {prompt}
        </div>
      )}
    </div>
  )
}

function WebFetchResultBody({ input }) {
  const { status, content_type, url, text = '', truncated } = input || {}
  const [showAll, setShowAll] = useState(false)
  // Ön izleme: ilk 500 karakter yeterince bağlam veriyor ama timeline'ı
  // kirletmiyor. Tam metni görmek isteyen operatör "tümünü göster"
  // diyebiliyor — %99'unda gerek yok, timeline hızlı okunsun.
  const PREVIEW_MAX = 500
  const long        = text.length > PREVIEW_MAX
  const shown       = showAll || !long ? text : text.slice(0, PREVIEW_MAX)

  return (
    <div className="px-2 pb-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono">
        {typeof status === 'number' && (
          <span className={status >= 400 ? 'text-red-400' : 'text-emerald-400'}>
            HTTP {status}
          </span>
        )}
        {content_type && (
          <span className="text-ops-400">{content_type.split(';')[0]}</span>
        )}
        {truncated && (
          <span className="text-amber-400">kesildi</span>
        )}
      </div>
      {url && (
        <div className="text-[10px] font-mono text-ops-500 break-all" title={url}>
          <span className="text-ops-600">url: </span>
          <span className="text-ops-300">{url}</span>
        </div>
      )}
      {text ? (
        <div>
          <pre className="text-[10px] font-mono text-ops-300 whitespace-pre-wrap break-words leading-snug max-h-80 overflow-y-auto rounded border border-ops-700/70 bg-ops-900/40 p-1.5">
            {shown}
            {long && !showAll && <span className="text-ops-500">…</span>}
          </pre>
          {long && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-1 text-[10px] font-mono uppercase tracking-wider text-accent hover:text-accent/80"
            >
              {showAll
                ? `▲ önizlemeye dön (${PREVIEW_MAX} karakter)`
                : `▼ tümünü göster (${text.length} karakter)`}
            </button>
          )}
        </div>
      ) : (
        <div className="text-[10px] font-mono text-ops-500 italic">
          (boş gövde)
        </div>
      )}
    </div>
  )
}

function RssFetchResultBody({ input }) {
  const { title, url, items = [] } = input || {}
  return (
    <div className="px-2 pb-2 space-y-1">
      <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono">
        <span className="text-ops-300">{title || '(başlıksız)'}</span>
        <span className="text-ops-600">·</span>
        <span className="text-ops-500">{items.length} öğe</span>
      </div>
      {url && (
        <div className="text-[10px] font-mono text-ops-500 break-all">
          <span className="text-ops-600">feed: </span>
          <span className="text-ops-400">{url}</span>
        </div>
      )}
      {items.length > 0 ? (
        <ol className="mt-1 space-y-1 list-decimal list-inside marker:text-ops-500">
          {items.map((it, i) => (
            <li key={i} className="text-[11px] text-ops-200 leading-snug">
              <div className="font-medium">{it.title || '(başlıksız)'}</div>
              {it.published && (
                <div className="text-[10px] font-mono text-ops-500">
                  {it.published}
                </div>
              )}
              {it.link && (
                <div className="text-[10px] font-mono text-ops-500 break-all">
                  {it.link}
                </div>
              )}
              {it.summary && (
                <div className="text-[10px] text-ops-400 leading-snug mt-0.5">
                  {it.summary.length > 240
                    ? it.summary.slice(0, 240) + '…'
                    : it.summary}
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="text-[10px] font-mono text-ops-500 italic">
          (feed boş)
        </div>
      )}
    </div>
  )
}

function JsonBlock({ value }) {
  return (
    <pre className="px-2 pb-2 text-[10px] font-mono text-ops-400 overflow-x-auto whitespace-pre-wrap break-words">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

/** Göreceli süre formatı:
 *   <1s      → "240ms"
 *   <60s     → "2.34s"
 *   ≥60s     → "1m 12s"
 * Başlangıç yoksa null — UI rozet göstermesin.
 */
function formatElapsed(stepAt, runStartedAt) {
  if (!stepAt || !runStartedAt) return null
  const dt = new Date(stepAt).getTime() - new Date(runStartedAt).getTime()
  if (!Number.isFinite(dt) || dt < 0) return null
  if (dt < 1000)  return `${dt}ms`
  if (dt < 60000) return `${(dt / 1000).toFixed(2)}s`
  const m = Math.floor(dt / 60000)
  const s = Math.floor((dt % 60000) / 1000)
  return `${m}m ${s}s`
}

function headlineFor(step) {
  const p = step.payload || {}
  if (step.kind === 'plan')      return p.summary || 'plan'
  if (step.kind === 'tool_call') return `${p.tool || 'tool'} çağrıldı`
  if (step.kind === 'tool_result') {
    const out = p.output || {}
    // Tool-aware compact headlines: tek satırlık özete en bilgi-yoğun
    // alanı sıkıştırıyoruz. Error varsa onu öne al — operatör run'a
    // bakar bakmaz nerede patladığını görsün.
    if (p.error)                            return `${p.tool} → hata`
    if (typeof out.total === 'number')      return `${p.tool} → total=${out.total}`
    if (Array.isArray(out.nodes))           return `${p.tool} → ${out.nodes.length} düğüm`
    if (Array.isArray(out.items))           return `${p.tool} → ${out.items.length} haber`
    if (typeof out.status === 'number' && typeof out.content_type === 'string') {
      return `${p.tool} → ${out.status} ${out.content_type.split(';')[0]}`
    }
    return `${p.tool || 'tool'} sonucu`
  }
  if (step.kind === 'final')     return p.summary || 'final özet'
  return step.kind
}

function ResultBlock({ result }) {
  if (!result || typeof result !== 'object') {
    return <pre className="text-[11px] font-mono text-ops-200">{String(result)}</pre>
  }
  // Her alan opsiyonel — ajanlar tek bir "summary + keyfi ekstra"
  // şablonunu paylaşıyor. Yeni bir alan türü çıktığında buraya ek
  // bir koşul ekleyip panel'ı yeniden derliyoruz; başka yerde
  // şema bilgisi tutmak istemiyoruz.
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
      {/* Headlines: news_scanner'ın başlık listesi. Semantik olarak
          bullets'tan farklı — bunlar ham başlıklar, yorum değil. Bu
          yüzden görsel ton daha sessiz (gri, numaralı), bullets ise
          accent marker'lı (operatörün dikkatini çeksin). */}
      {Array.isArray(result.headlines) && result.headlines.length > 0 && (
        <div className="mt-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ops-500 mb-0.5">
            Başlıklar
          </div>
          <ol className="space-y-0.5 list-decimal list-inside marker:text-ops-500">
            {result.headlines.map((h, i) => (
              <li key={i} className="text-[11px] text-ops-300 leading-snug">
                {typeof h === 'string' ? h : JSON.stringify(h)}
              </li>
            ))}
          </ol>
        </div>
      )}
      {/* Bullets: web_analyst + ileride gelen herhangi bir LLM ajanın
          "operasyonel çıkarımlar" listesi. Tek satırlık •ler değil
          de 2-5 maddelik kısa öğeler düşünülmüş — fazlasını kesmek
          yerine tümünü gösteriyoruz: ajan zaten prompt'ta 5 ile
          sınırlı, kesme mantığı UI'da gürültü. */}
      {Array.isArray(result.bullets) && result.bullets.length > 0 && (
        <ul className="mt-1 space-y-0.5 list-disc list-inside">
          {result.bullets.map((b, i) => (
            <li key={i} className="text-[11px] text-ops-200 leading-snug marker:text-accent/60">
              {typeof b === 'string' ? b : JSON.stringify(b)}
            </li>
          ))}
        </ul>
      )}
      {result.source && typeof result.source === 'string' && (
        <div className="text-[10px] font-mono text-ops-500 truncate" title={result.source}>
          kaynak: <span className="text-ops-400">{result.source}</span>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * RunHistoryList — operatörün son run'ları
 *
 * Her satır: durum ikonu + ajan adı + rozet + kısa özet + göreceli zaman.
 * Satıra tıklayınca üst bileşen ``runId``'yi değiştirir → "Son Çalışma"
 * bölümü o run'ın timeline'ını yükler. Aktif satır accent çerçeveyle
 * vurgulanır ki operatör iki bölümün hangi run için konuştuğunu görsün.
 * ═══════════════════════════════════════════════════════════════════ */
function RunHistoryList({ runs, loading, error, activeId, onSelect }) {
  if (loading && runs.length === 0) {
    return (
      <div className="px-3 py-2">
        <StatusLine icon={Loader2} spin label="Geçmiş yükleniyor..." />
      </div>
    )
  }
  if (error) {
    return (
      <div className="px-3 py-2">
        <StatusLine
          icon={AlertCircle}
          tone="error"
          label={`Geçmiş alınamadı — ${error?.detail || 'bilinmeyen hata'}`}
        />
      </div>
    )
  }
  if (runs.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-ops-500 font-mono">
        Bu operatör için kayıt yok. İlk çalışmayı başlat.
      </div>
    )
  }
  return (
    <ul className="px-2 space-y-1">
      {runs.map((r) => (
        <RunHistoryRow
          key={r.id}
          run={r}
          active={r.id === activeId}
          onSelect={() => onSelect(r.id)}
        />
      ))}
    </ul>
  )
}

function RunHistoryRow({ run, active, onSelect }) {
  const state = RUN_STATUS[run.status] ?? {
    icon: Loader2, tone: 'text-ops-400', label: run.status, spin: false,
  }
  const Icon    = state.icon
  const when    = formatRelativeShort(run.created_at)
  // Tek satırlık özet: başarılı run'larda sonuç.summary, hatada error.
  // ``result`` şemayı bilmiyoruz (ajan değişken); summary yoksa
  // rozetle yetin, kullanıcı açıp detayı timeline'da görsün.
  const summary = run.result?.summary || run.error || null
  // Run bu modelle başlatıldıysa rozet göster. ``context.model`` yalnız
  // operatör varsayılanı dışına çıkınca yazılır — varsayılan run'lar
  // temiz kalsın, istisna olanlar gözle yakalansın.
  const ctxModel = typeof run.context?.model === 'string' ? run.context.model : null

  return (
    <li>
      <button
        onClick={onSelect}
        title={`${run.agent} · ${run.id}${ctxModel ? ` · model=${ctxModel}` : ''}`}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-colors ${
          active
            ? 'border-accent/50 bg-accent/10'
            : 'border-ops-700/70 bg-ops-900/30 hover:border-ops-600 hover:bg-ops-900/60'
        }`}
      >
        <Icon
          size={11}
          className={`shrink-0 ${state.tone} ${state.spin ? 'animate-spin' : ''}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[11px] font-mono truncate ${
                active ? 'text-accent' : 'text-ops-200'
              }`}
            >
              {run.agent}
            </span>
            {ctxModel && (
              <span className="text-[9px] font-mono text-violet-300 bg-violet-500/10 border border-violet-500/30 rounded px-1 py-0.5 leading-none">
                {ctxModel}
              </span>
            )}
            <span className="text-[10px] text-ops-600">·</span>
            <span className={`text-[10px] font-mono ${state.tone}`}>
              {state.label}
            </span>
          </div>
          {summary && (
            <div className="text-[10px] text-ops-500 truncate leading-snug mt-0.5">
              {summary}
            </div>
          )}
        </div>
        {when && (
          <span
            className="text-[10px] font-mono text-ops-500 shrink-0 tabular-nums"
            title={run.created_at}
          >
            {when}
          </span>
        )}
      </button>
    </li>
  )
}

/** Kısa göreceli zaman (history rozetleri için):
 *   <1dk    → "şimdi"
 *   <1sa    → "5dk"
 *   <24sa   → "2sa"
 *   <7g     → "3g"
 *   ≥7g     → "15.04 13:42"
 * Tam ISO string tooltip'te ``title`` olarak gözükür — kesin saat
 * lazımsa hover yeterli, satır dar kalır. */
function formatRelativeShort(iso) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const ms = Date.now() - t
  if (ms < 0)               return new Date(iso).toLocaleTimeString()
  if (ms < 60_000)          return 'şimdi'
  if (ms < 3_600_000)       return `${Math.floor(ms / 60_000)}dk`
  if (ms < 86_400_000)      return `${Math.floor(ms / 3_600_000)}sa`
  if (ms < 7 * 86_400_000)  return `${Math.floor(ms / 86_400_000)}g`
  const d  = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm} ${hh}:${mi}`
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

/* Kartta her ajanın cinsi görünsün: "LLM" (mor) veya "DET" (füme).
 * Mor rengi Anthropic brand sinyali olarak seçtik — aynı anda
 * "burada LLM var" sinyali veriyor, kullanıcının görsel haritası oluşuyor. */
function KindBadge({ kind }) {
  const isLlm = kind === 'llm'
  const Icon  = isLlm ? Sparkles : Cpu
  const label = isLlm ? 'LLM' : 'DET'
  const cls   = isLlm
    ? 'text-violet-300 bg-violet-500/15 border-violet-500/40'
    : 'text-ops-300 bg-ops-700/50 border-ops-600'
  return (
    <span
      title={isLlm ? 'LLM tabanlı (Claude Max köprüsü)' : 'Deterministik — kod tabanlı'}
      className={`inline-flex items-center gap-0.5 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}
    >
      <Icon size={9} />
      {label}
    </span>
  )
}

/* Header'da tek bir nokta: yeşil = köprü hazır, kırmızı = kapalı,
 * sarı = probe henüz dönmedi veya ok bilgisi gelmedi. Tooltip'te
 * daha fazla detay (version, cmd path, hata). */
function BridgeHealthDot({ health, loading }) {
  const status = loading
    ? 'loading'
    : !health
      ? 'unknown'
      : health.ok ? 'ok' : 'down'

  const tone = {
    ok:      { cls: 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]', label: 'Köprü hazır' },
    down:    { cls: 'bg-red-500    shadow-[0_0_6px_rgba(239,68,68,0.7)]',   label: 'Köprü kapalı' },
    loading: { cls: 'bg-amber-400 animate-pulse',                           label: 'Köprü kontrol ediliyor' },
    unknown: { cls: 'bg-ops-500',                                           label: 'Köprü durumu bilinmiyor' },
  }[status]

  const title = [
    tone.label,
    health?.version && `v: ${health.version}`,
    health?.bridge_url,
    health?.error && `hata: ${health.error}`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex items-center gap-1.5 shrink-0" title={title}>
      <span className={`w-1.5 h-1.5 rounded-full ${tone.cls}`} />
      <span className="text-[10px] font-mono uppercase tracking-wider text-ops-500">
        köprü
      </span>
    </div>
  )
}

/* Model seçici — Claude Max köprüsüne geçecek ``--model`` değerini
 * operatör run-başına seçebilsin. Liste hardcoded (MODEL_OPTIONS): fazla
 * seçenek = analiz felci; haiku/sonnet/opus üçü + Varsayılan yeterli.
 * "Hint" yazısı seçili modelin altında gri not olarak görünür — operatör
 * hangi model için neyin uygun olduğunu her seferinde hatırlamak zorunda
 * kalmasın. Panel dar olduğu için horizontal pills yerine select input
 * seçtik: mobil/ince panelde düzgün sığar. */
function ModelSelect({ value, onChange, disabled }) {
  const current = MODEL_OPTIONS.find((m) => m.value === value) ?? MODEL_OPTIONS[0]
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-wider text-ops-500">
        Model
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 w-full bg-ops-900/70 border border-ops-700 rounded px-2 py-1.5 text-[12px] text-ops-100 font-mono focus:outline-none focus:border-accent/60 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {MODEL_OPTIONS.map((m) => (
          <option key={m.value || 'default'} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <span className="block mt-0.5 text-[10px] text-ops-500 font-mono">
        {current.hint}
      </span>
    </label>
  )
}
