import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot, Send, Sparkles, Compass, MapPin, Cpu, Settings, Key,
  Loader2, RotateCcw, Trash2, Eye, EyeOff, AlertTriangle,
  CheckCircle2, ChevronRight, Server, RefreshCw, Terminal,
  Wrench, ChevronDown, ChevronUp,
  Mic, MicOff, Volume2, VolumeX, Square,
} from 'lucide-react'
import useStore from '../../store/useStore'
import { buildAssistantContext, formatContextAsMarkdown } from '../../lib/assistantContext'
import {
  PROVIDERS, loadAssistantConfig, saveAssistantConfig,
  clearAssistantApiKey, sendChat, pingLocalBridge, DEFAULT_LOCAL_URL,
} from '../../lib/assistantApi'
import {
  TOOLS, executeTool, describeTools, parseToolCalls, formatToolResultsForLLM,
} from '../../lib/assistantTools'
import {
  useSpeechRecognition, useSpeechSynthesis,
  loadVoicePrefs, saveVoicePrefs,
} from '../../lib/assistantVoice'

/**
 * Sentinel AI — uygulama içi asistan (aktif).
 *
 * Tasarım prensipleri:
 *
 *   • BAĞLAM CANLI  Her tur useStore.getState() taze okunur; çatışma
 *                   değişir / katman açılır-kapanır, asistan hemen
 *                   bunu bilir.
 *   • AGENT MODU    LLM sadece metin üretmez, araç çağırır: katman
 *                   toggle'ı, haritada fly-to, node ekle, yakın arama…
 *                   Yanıtlardaki <tool_call> bloklarını yakalayıp
 *                   çalıştırırız, sonucu bir sonraki tura geri besleriz.
 *                   Araçsız (düz) yanıt = final answer, döngü biter.
 *   • ANAHTAR LOKAL API anahtarı localStorage'da; sadece bu tarayıcıdan
 *                   doğrudan LLM sağlayıcısına gider (proxy yok).
 *   • SAĞLAYICI HEP Local (Claude Max köprüsü) + Anthropic + OpenAI.
 *   • SAFETY        Max tur = 6, max tool/tur = 8. Kullanıcı istediğinde
 *                   abort edilebilir.
 */
export default function AssistantPanel() {
  const [config, setConfig] = useState(() => loadAssistantConfig())
  // Ayarlar panelini ilk açılışta göster — eğer sağlayıcı "local" ise
  // köprü statüsü belirsiz olduğu için, "anthropic/openai" ise
  // anahtar yok ise göster.
  const [showSettings, setShowSettings] = useState(() => {
    const c = loadAssistantConfig()
    const p = PROVIDERS[c.provider] || PROVIDERS.local
    return p.needsKey ? !c.apiKey : false
  })
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [bridgeStatus, setBridgeStatus] = useState({ state: 'unknown' })
  const abortRef = useRef(null)
  const scrollRef = useRef(null)

  // ── Ses tercihleri ─────────────────────────────────────
  // Kullanıcı tarafında localStorage'da yaşar — autoSpeak, dil, hız, pitch.
  // Mikrofon butonu + kulaklık toggle UI'ı bu state'i okur. Değişikliklerde
  // hemen kalıcı hale getiriyoruz (AssistantPanel lazy olduğu için ilk
  // açılışta baştan okunur).
  const [voicePrefs, setVoicePrefs] = useState(() => loadVoicePrefs())
  useEffect(() => { saveVoicePrefs(voicePrefs) }, [voicePrefs])

  // runPromptRef: STT final callback'inden runPrompt'a ulaşmak için. Hook
  // sırası yüzünden runPrompt hala tanımlı değil — ref ile "en güncel"
  // referansı tutarız, aşağıda runPrompt tanımlanınca ref set edilir.
  const runPromptRef = useRef(null)

  // Mikrofon — kullanıcı konuşurken her turda interim transcript'i input'a
  // yansıt, final'de (tarayıcı sessizlik algılayınca) otomatik gönder.
  const speech = useSpeechRecognition({
    lang: voicePrefs.lang,
    silenceMs: voicePrefs.silenceMs ?? 2500,
    onInterim: (interim) => {
      // Konuşma esnasında textarea'yı güncelle ki kullanıcı ne duyulduğunu
      // görsün — final sınırında zaten tekrar temizlenip gönderilecek.
      if (interim) setInput(interim)
    },
    onFinal: (finalText) => {
      setInput(finalText)
      if (voicePrefs.autoSend && runPromptRef.current) {
        // Dil modeline göndermeden önce TTS aktifse önceki okumayı kes.
        try { window.speechSynthesis?.cancel?.() } catch {}
        runPromptRef.current(finalText)
      }
    },
  })

  // TTS — asistan final cevaplarını otomatik okuma + per-message play.
  const tts = useSpeechSynthesis({
    lang: voicePrefs.lang,
    rate: voicePrefs.rate,
    pitch: voicePrefs.pitch,
  })

  // Config değiştiğinde localStorage'a yaz.
  useEffect(() => { saveAssistantConfig(config) }, [config])

  // Lokal sağlayıcı seçiliyse köprüyü sağlık kontrolünden geçir.
  const checkBridge = useCallback(async () => {
    if (config.provider !== 'local') return
    setBridgeStatus({ state: 'checking' })
    const res = await pingLocalBridge(config.localUrl || DEFAULT_LOCAL_URL)
    setBridgeStatus(res.ok
      ? { state: 'ok', version: res.version }
      : { state: 'down', error: res.error || `exit ${res.code}` }
    )
  }, [config.provider, config.localUrl])
  useEffect(() => { checkBridge() }, [checkBridge])

  // Yeni mesajda aşağıya kaydır.
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy])

  // Mount'ta eski oturumu geri yükle — kullanıcı panelden çıkıp girse
  // de sohbet kaybolmasın.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('tairos:assistant:messages')
      if (raw) setMessages(JSON.parse(raw))
    } catch {}
  }, [])
  useEffect(() => {
    // Stream ortasında disk baskısı yapma — her delta setMessages
    // tetikliyor, her seferinde tüm sohbet JSON.stringify olursa yavaşlar.
    // Tur bittiğinde busy=false olunca tek seferlik persist yeterli.
    if (busy) return
    try {
      // streaming:true bubble'ları transient kabul et — diske yazma.
      const toSave = messages.filter((m) => !m.streaming)
      sessionStorage.setItem('tairos:assistant:messages', JSON.stringify(toSave))
    } catch {}
  }, [messages, busy])

  const currentProvider = PROVIDERS[config.provider] || PROVIDERS.local
  // "Hazır mı?" — provider tipine göre farklı kontrol. Local ise köprü
  // sağlığı, cloud ise API key. Bu flag hem başlık rozetini hem giriş
  // alanı enable/disable durumunu yönetir.
  const ready = currentProvider.needsKey
    ? !!config.apiKey
    : bridgeStatus.state === 'ok'

  const quickActions = useMemo(() => [
    { id: 'ctx',    icon: Compass, label: 'Şu an ne görüyorum?',
      prompt: 'Haritada şu an ne görüyorum? state.snapshot aracıyla durumu oku, sonra aktif filtreleri, seçili çatışma/ülkeyi ve görünür katmanları maddeler halinde özetle.' },
    { id: 'nearest', icon: MapPin, label: 'Yakın tehditleri göster',
      prompt: 'Haritanın şu anki merkezinin 250 km yarıçapındaki kritik tesisleri/üsleri/birlikleri bul (search.nearby). Tehdit katmanı ve force deploy katmanı kapalıysa aç. Sonuçları önem sırasına göre kısa listele.' },
    { id: 'focus-ukraine', icon: Sparkles, label: 'Ukrayna\'ya odaklan',
      prompt: 'Ukrayna-Rusya çatışmasını seç (conflict.select) ve çatışma varlıkları katmanını aç. Sonra mevcut duruma dair 3 maddelik kısa brifing ver.' },
    { id: 'advise', icon: Cpu, label: 'Ne bakmalıyım?',
      prompt: 'Ben Tairos operatörüyüm. state.snapshot ile mevcut durumu oku. Şu an hangi katmanı açmalıyım, hangi paneli incelemeliyim? 2-3 somut öneri ver ve en mantıklısını uygula.' },
  ], [])

  // Agent'ın şu an hangi adımda olduğunu status bar'da göstermek için.
  // 'thinking' = LLM'den cevap bekleniyor. 'acting' = araç çağrıları
  // koşuluyor. null = boşta.
  const [agentPhase, setAgentPhase] = useState(null)

  const runPrompt = useCallback(async (text) => {
    const userText = text.trim()
    if (!userText || busy) return
    setError(null)

    // LLM'e giden mesaj kuyruğu — UI state'den bağımsız tutuluyor ki
    // döngü içinde setMessages'ın asenkron olmasına takılmasın. UI'a
    // göstereceğimiz mesajları ayrıca setMessages ile push ederiz.
    //
    // History trim: çok uzun sohbet LLM'e her turda gönderilirse TTFT
    // artar. Son N mesajı tut — eski tool-result feedback'leri stale
    // oluyor (her turda `--- CANLI BAĞLAM ---` taze geliyor zaten).
    // İlk user mesajını (intent anchor) ve son ~24 mesajı koru.
    const rawHistory = messages.map((m) => ({ role: m.role, content: m.content }))
    const MAX_HISTORY = 24
    const history = rawHistory.length > MAX_HISTORY
      ? [rawHistory[0], ...rawHistory.slice(-(MAX_HISTORY - 1))]
      : rawHistory
    history.push({ role: 'user', content: userText })

    setMessages((prev) => [...prev, { role: 'user', content: userText, ts: Date.now() }])
    setInput('')
    setBusy(true)

    const controller = new AbortController()
    abortRef.current = controller

    const toolCtx = { getState: useStore.getState, setState: useStore.setState }
    // Tur/tool limitleri — yüksek tutuldu ki karmaşık görevlerde agent
    // kesintiye uğramasın. Tur limiti gerçekte nadiren dolar çünkü LLM
    // genelde 2-3 turda biter; ama "şu bölgeyi tara, yakını bul, X için
    // uyarı göster, Y'yi aç" gibi zincirlerde tampon lazım.
    const MAX_TURNS = 12
    const MAX_CALLS_PER_TURN = 20

    try {
      let turn = 0
      while (turn++ < MAX_TURNS) {
        // Her turda bağlamı yeniden derle — önceki araçlar state'i
        // değiştirmiş olabilir, LLM güncel durumu görsün.
        setAgentPhase('thinking')
        const ctx = buildAssistantContext(useStore.getState())
        const systemParts = buildSystemPromptParts(ctx)

        // Streaming bubble — cevap gelirken narrative'i anlık göster.
        // streamId ile doğru mesajı update ediyoruz (messages state
        // async). Sonra turn biter bitmez bu bubble'ı final-narrative +
        // toolCalls ile "fix" ediyoruz.
        const streamId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        setMessages((prev) => [...prev, {
          role: 'assistant', content: '', streamId, streaming: true, ts: Date.now(),
        }])

        const { text: reply } = await sendChat({
          provider:    config.provider,
          apiKey:      config.apiKey,
          localUrl:    config.localUrl,
          model:       config.model || currentProvider.defaultModel,
          systemParts,                                   // cacheable + dynamic split
          messages:    history,
          signal:      controller.signal,
          onStreamChunk: (_delta, full) => {
            // narrative = <tool_call> blokları çıkarılmış sade metin.
            // Stream ortasında tamamlanmamış <tool_call> tag görünmesin.
            const narr = narrativeFromPartial(full)
            setMessages((prev) => prev.map((m) =>
              m.streamId === streamId ? { ...m, content: narr } : m
            ))
          },
        })

        const { calls, narrative } = parseToolCalls(reply)

        // Araç yoksa: final cevap. Streaming bubble'ı finalize et, çık.
        if (calls.length === 0) {
          setMessages((prev) => prev.map((m) =>
            m.streamId === streamId
              ? { role: 'assistant', content: narrative || reply, ts: m.ts }
              : m
          ))
          break
        }

        // Araçları çalıştır — peş peşe gelen READ-only çağrıları PARALEL
        // batch halinde, yazma (state değiştiren) çağrıları SERİ işle.
        // Böylece "önce state.snapshot + search.nearby + layer.list oku,
        // sonra layer.toggle + map.fly_to uygula" gibi bir turda
        // okuma-ağırlıklı bölümler tek seferde biter, yazmalar sırasını
        // korur. LLM dönüş sırası = results dizisi sırası olduğundan
        // tool_result feedback'i bozulmaz.
        setAgentPhase('acting')
        const limited = calls.slice(0, MAX_CALLS_PER_TURN)
        const results = await executeToolsSmart(limited, toolCtx)

        // Streaming bubble'ı final haline getir: narrative + araç günlüğü
        setMessages((prev) => prev.map((m) =>
          m.streamId === streamId
            ? { role: 'assistant', content: narrative, toolCalls: results, ts: m.ts }
            : m
        ))

        // LLM geçmişine ekle — orijinal reply'ı assistant olarak, sonuçları
        // user rolünde geri besle. Böylece LLM ne yaptığını ve ne oldu
        // gördüğünü bir sonraki turda bilir.
        history.push({ role: 'assistant', content: reply })
        history.push({ role: 'user', content: formatToolResultsForLLM(results) })

        if (calls.length > MAX_CALLS_PER_TURN) {
          setMessages((prev) => [...prev, {
            role: 'assistant',
            content: `_(tur başına en fazla ${MAX_CALLS_PER_TURN} araç çalıştırılıyor; ${calls.length - MAX_CALLS_PER_TURN} çağrı atlandı)_`,
            ts: Date.now(),
          }])
        }
      }

      if (turn >= MAX_TURNS) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `_(max ${MAX_TURNS} tur sınırına ulaşıldı — döngü durduruldu)_`,
          ts: Date.now(),
        }])
      }
    } catch (e) {
      // Açık streaming bubble varsa finalize et — "streaming: true" bir
      // daha asla spinner olarak donmasın.
      const abortMark = e.name === 'AbortError' ? '_(yanıt iptal edildi)_' : ''
      setMessages((prev) => {
        const hasOpenStream = prev.some((m) => m.streaming)
        if (!hasOpenStream) {
          return e.name === 'AbortError'
            ? [...prev, { role: 'assistant', content: '_(yanıt iptal edildi)_', ts: Date.now() }]
            : prev
        }
        return prev.map((m) =>
          m.streaming
            ? { role: 'assistant', content: m.content || abortMark || '_(yanıt alınamadı)_', ts: m.ts }
            : m
        )
      })
      if (e.name !== 'AbortError') setError(e.message || String(e))
    } finally {
      setBusy(false)
      setAgentPhase(null)
      abortRef.current = null
    }
  }, [messages, busy, config, currentProvider.defaultModel])

  const stop = () => { if (abortRef.current) abortRef.current.abort() }

  // STT final callback'inin runPrompt'a erişebilmesi için ref'i güncel tut.
  // runPrompt her render'da yeniden oluşuyor — ref bu yüzden burada
  // refresh ediliyor (hooks sırası korunuyor).
  useEffect(() => { runPromptRef.current = runPrompt }, [runPrompt])

  // Otomatik sesli okuma — yeni bir assistant mesajı (araç çağrısı
  // değil, düz final cevap) eklenince TTS autoSpeak açıksa oku. Araç
  // çağrılı ara turlar (toolCalls dolu) genelde tek cümlelik "yapıyorum:
  // ..." olduğu için onları da okutmak yerine sadece son kullanıcı
  // mesajından BU YANA gelen en son final cevabı okuyoruz.
  const lastSpokenIdxRef = useRef(-1)
  useEffect(() => {
    if (!voicePrefs.autoSpeak || !tts.supported) return
    if (busy) return                              // cevap henüz bitmemiş
    // En son mesajdan geriye doğru tara — final bir assistant mesajı bul.
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'user') break                // son user'a kadar gittik, final yok
      if (m.role === 'assistant' && m.content && (!m.toolCalls || !m.toolCalls.length)) {
        if (i !== lastSpokenIdxRef.current) {
          lastSpokenIdxRef.current = i
          tts.speak(m.content)
        }
        break
      }
    }
  }, [messages, busy, voicePrefs.autoSpeak, tts])

  // Sohbet temizlenince veya yeni user mesajı girilince, önceki okumayı
  // kes — kullanıcı beklemesin.
  const clear = () => {
    if (busy) return
    if (!messages.length) return
    if (!confirm('Sohbet geçmişi silinsin mi?')) return
    setMessages([])
    setError(null)
    tts.cancel()
    lastSpokenIdxRef.current = -1
  }

  // Mikrofon butonu — destek yoksa disabled + tooltip.
  const handleMic = () => {
    if (!speech.supported) return
    // Dinlemeye başlamadan önce TTS konuşuyorsa kes ki mikrofona girmesin.
    if (tts.speaking) tts.cancel()
    speech.toggle()
  }

  // Auto-speak toggle — tıklayınca flag'i çevir, kapatırsan mevcut okumayı
  // da kes (kullanıcı "sustur" demek istiyor).
  const toggleAutoSpeak = () => {
    setVoicePrefs((p) => {
      const next = { ...p, autoSpeak: !p.autoSpeak }
      if (!next.autoSpeak) tts.cancel()
      return next
    })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      runPrompt(input)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Başlık ─────────────────────────────────────── */}
      <div className="px-3 py-2.5 border-b border-ops-700 flex items-center gap-2 shrink-0">
        <div className="shrink-0 w-8 h-8 rounded bg-accent/15 flex items-center justify-center">
          <Bot size={16} className="text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-mono uppercase tracking-wider text-ops-100 flex items-center gap-1.5">
            Sentinel AI
            <StatusBadge
              ready={ready}
              provider={currentProvider}
              bridgeStatus={bridgeStatus}
              onRefresh={checkBridge}
            />
          </div>
          <div className="text-[10px] text-ops-500 leading-tight truncate">
            {currentProvider.label} · {config.model || currentProvider.defaultModel || 'varsayılan'}
          </div>
        </div>
        {/* Sesli-oku anahtarı — destek varsa göster. Açıkken aksan
            renginde, konuşurken ayrıca pulse. Kapatılırsa aktif okuma
            da kesilir (toggleAutoSpeak içinde). */}
        {tts.supported && (
          <button
            onClick={toggleAutoSpeak}
            className={`p-1.5 rounded border transition-colors ${
              voicePrefs.autoSpeak
                ? `border-accent/60 text-accent bg-accent/10 ${tts.speaking ? 'animate-pulse' : ''}`
                : 'border-ops-600 text-ops-400 hover:text-ops-100'
            }`}
            title={voicePrefs.autoSpeak ? 'Sesli okuma açık — kapat' : 'Cevapları sesli oku'}
            aria-label="Otomatik sesli okuma"
          >
            {voicePrefs.autoSpeak ? <Volume2 size={12} /> : <VolumeX size={12} />}
          </button>
        )}
        <button
          onClick={() => setShowSettings((v) => !v)}
          className={`p-1.5 rounded border transition-colors ${
            showSettings ? 'border-accent/60 text-accent bg-accent/10' : 'border-ops-600 text-ops-400 hover:text-ops-100'
          }`}
          title="Ayarlar"
        >
          <Settings size={12} />
        </button>
        <button
          onClick={clear}
          disabled={busy || !messages.length}
          className="p-1.5 rounded border border-ops-600 text-ops-400 hover:text-red-400 hover:border-red-400/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Sohbeti temizle"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* ── Ayarlar panel (açılır) ──────────────────────────── */}
      {showSettings && (
        <SettingsBlock
          config={config}
          setConfig={setConfig}
          bridgeStatus={bridgeStatus}
          onRefreshBridge={checkBridge}
          onClearKey={() => { clearAssistantApiKey(); setConfig((c) => ({ ...c, apiKey: '' })) }}
        />
      )}

      {/* ── Konuşma alanı ──────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {messages.length === 0 && (
          <IntroBlock
            quickActions={quickActions}
            onPick={runPrompt}
            disabled={!ready || busy}
            provider={currentProvider}
            bridgeStatus={bridgeStatus}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}

        {messages.map((m, i) => (
          <Bubble
            key={m.streamId || i}
            role={m.role}
            content={m.content}
            toolCalls={m.toolCalls}
            streaming={m.streaming}
            tts={tts}
          />
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-[10px] font-mono text-ops-500 px-1">
            <Loader2 size={11} className="animate-spin text-accent" />
            {agentPhase === 'acting' ? 'Araçlar çalıştırılıyor…' :
             agentPhase === 'thinking' ? 'Sentinel düşünüyor…' :
             'Hazırlanıyor…'}
            <button onClick={stop} className="ml-2 text-ops-400 hover:text-red-400 underline">
              durdur
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded border border-red-500/40 bg-red-500/5 text-[10.5px] text-red-200">
            <AlertTriangle size={12} className="shrink-0 text-red-400 mt-px" />
            <div className="min-w-0 flex-1 break-words">
              <div className="font-mono uppercase text-[9px] tracking-wider text-red-400 mb-0.5">Hata</div>
              {error}
            </div>
            <button
              onClick={() => setError(null)}
              className="shrink-0 text-red-400 hover:text-red-200 text-[10px]"
            >
              kapat
            </button>
          </div>
        )}
      </div>

      {/* ── Giriş kutusu ───────────────────────────────── */}
      <div className="p-2 border-t border-ops-700 shrink-0">
        {/* Mikrofon izin/durum uyarıları — sadece gerektiğinde çıkar */}
        {speech.error && (
          <div className="mb-1.5 px-2 py-1 rounded border border-red-500/40 bg-red-500/5 text-[10px] text-red-200 flex items-start gap-1.5">
            <AlertTriangle size={11} className="shrink-0 text-red-400 mt-px" />
            <span className="min-w-0 flex-1 break-words">{speech.error}</span>
          </div>
        )}
        {speech.listening && (
          <div className="mb-1.5 px-2 py-1 rounded border border-accent/40 bg-accent/5 text-[10px] text-accent flex items-center gap-1.5 font-mono uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            Dinleniyor… {voicePrefs.autoSend ? 'sessizlikte otomatik gönderilir' : 'durdurunca metin kalır'}
          </div>
        )}
        <div className="flex gap-1.5 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              speech.listening
                ? 'Konuş… söyledikçe buraya yazılıyor.'
                : ready
                  ? 'Soru veya komut… (Enter → gönder, Shift+Enter → yeni satır)'
                  : currentProvider.needsKey
                    ? 'Önce ayarlardan API anahtarı ekle…'
                    : bridgeStatus.state === 'checking'
                      ? 'Lokal köprü kontrol ediliyor…'
                      : 'Lokal köprü kapalı — "npm run assistant" çalıştır.'
            }
            rows={2}
            disabled={!ready || busy}
            className="flex-1 bg-ops-900 border border-ops-700 rounded px-2 py-1.5 text-[11px] text-ops-100 placeholder-ops-500 focus:outline-none focus:border-accent/60 resize-none disabled:opacity-50 disabled:cursor-not-allowed leading-snug"
          />
          {/* Mikrofon — destek varsa göster; yoksa hiç render etme ki UI
              daha kompakt kalsın. Dinlerken aksan renginde + pulse. */}
          {speech.supported && (
            <button
              onClick={handleMic}
              disabled={!ready || busy}
              className={`p-2 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                speech.listening
                  ? 'border-red-500/60 text-red-400 bg-red-500/10 hover:bg-red-500/20 animate-pulse'
                  : 'border-ops-600 text-ops-300 hover:text-ops-50 hover:border-accent/50'
              }`}
              title={speech.listening ? 'Dinlemeyi durdur' : 'Konuşarak yaz (mikrofon)'}
              aria-label={speech.listening ? 'Dinlemeyi durdur' : 'Mikrofonu aç'}
            >
              {speech.listening ? <Square size={13} fill="currentColor" /> : <Mic size={13} />}
            </button>
          )}
          <button
            onClick={() => runPrompt(input)}
            disabled={!ready || busy || !input.trim()}
            className="p-2 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-accent/50 text-accent bg-accent/10 hover:bg-accent/20"
            title="Gönder (Enter)"
            aria-label="Gönder"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Smart tool execution ─────────────────────────────────── */

/**
 * Read-only araçlar — bunlar store'u / harita görüntüsünü
 * DEĞİŞTİRMEZ, sadece okur. Aynı turda peş peşe gelirlerse `Promise.all`
 * ile paralel koşulabilirler. Yazmalar (layer.toggle, map.fly_to,
 * node.add, vs.) sıra bağımlı olduğundan seri kalır.
 *
 * Liste muhafazakar tutuldu — "belki değiştirir" olanlar dışarıda.
 * Yeni bir read-only tool eklenirse buraya da eklenmeli.
 */
const READ_ONLY_TOOLS = new Set([
  'map.get_state',
  'layer.list',
  'conflict.list',
  'country.list',
  'node.list',
  'search.nearby',
  'search.by_name',
  'state.snapshot',
])

/**
 * Tool listesini akıllıca çalıştırır:
 *   • Parse hataları: direkt results'a basılır, run edilmez.
 *   • Consecutive read-only'ler: bir batch halinde paralel.
 *   • Yazma (veya tanınmayan) tool: seri, tek tek.
 *
 * Sonuçlar çağrı sırasıyla aynı dizide döner — LLM tool_result feedback'i
 * sırayı beklediği için korunması şart. Ayrıca bir tool hatalı da bitse
 * `ok: false` ile results'a girer (executeTool kendi catch'i içinde),
 * böylece batch'in geri kalanını iptal etmez.
 */
async function executeToolsSmart(calls, toolCtx) {
  const run = (c) => executeTool(c.name, c.args, toolCtx)
    .then((r) => ({ name: c.name, args: c.args, ...r }))

  const results = []
  let i = 0
  while (i < calls.length) {
    const call = calls[i]
    // Parse hatası
    if (!call.name) {
      results.push({ name: '<parse-error>', ok: false, error: call.error || 'parse başarısız', raw: call.raw })
      i++
      continue
    }
    if (READ_ONLY_TOOLS.has(call.name)) {
      // Peş peşe gelen read-only'leri topla → paralel
      const batch = []
      while (i < calls.length && calls[i].name && READ_ONLY_TOOLS.has(calls[i].name)) {
        batch.push(calls[i])
        i++
      }
      const batchResults = await Promise.all(batch.map(run))
      results.push(...batchResults)
    } else {
      // Yazma — seri
      results.push(await run(call))
      i++
    }
  }
  return results
}

/* ── Alt bileşenler ───────────────────────────────────────── */

/**
 * Başlık rozeti — "hazır mı?" durumunu iki farklı yoldan anlatır.
 *
 *   • Cloud sağlayıcı (anthropic/openai): API anahtarı var mı?
 *     → "bağlı" veya "anahtar yok".
 *   • Lokal köprü: http://localhost:8787/health yanıt veriyor mu?
 *     → "köprü aktif" | "kontrol…" | "köprü kapalı".
 *
 * Sağdaki RefreshCw, sadece local modda anlam taşır — anlık tekrar
 * ping atmak için. Cloud'da gizlenir.
 */
function StatusBadge({ ready, provider, bridgeStatus, onRefresh }) {
  if (provider.needsKey) {
    return ready ? (
      <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[8.5px] font-mono uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        <CheckCircle2 size={8} /> bağlı
      </span>
    ) : (
      <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[8.5px] font-mono uppercase tracking-wider bg-ops-700/60 text-ops-400 border border-ops-600">
        <AlertTriangle size={8} /> anahtar yok
      </span>
    )
  }
  // Local provider — köprü sağlığı
  const tone =
    bridgeStatus.state === 'ok'       ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
    bridgeStatus.state === 'checking' ? 'bg-ops-700/60 text-ops-300 border-ops-600 animate-pulse' :
                                        'bg-red-500/15 text-red-300 border-red-500/30'
  const label =
    bridgeStatus.state === 'ok'       ? 'köprü aktif' :
    bridgeStatus.state === 'checking' ? 'kontrol…'    :
                                        'köprü kapalı'
  const Icon =
    bridgeStatus.state === 'ok'       ? CheckCircle2 :
    bridgeStatus.state === 'checking' ? Loader2      :
                                        AlertTriangle
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center gap-0.5 px-1 py-px rounded text-[8.5px] font-mono uppercase tracking-wider border ${tone}`}>
        <Icon size={8} className={bridgeStatus.state === 'checking' ? 'animate-spin' : ''} /> {label}
      </span>
      <button
        onClick={onRefresh}
        className="text-ops-500 hover:text-ops-100 transition-colors"
        title="Köprüyü yeniden kontrol et"
      >
        <RefreshCw size={9} />
      </button>
    </span>
  )
}

/**
 * Sohbet balonu. `role='user'` sağda accent tint, `role='assistant'`
 * solda nötr ton. İçerik Markdown-tarzı süslemeler içeriyorsa (kalın,
 * liste, kod) basit bir render uygulanır — tam Markdown değil, sadece
 * okuma kolaylığı.
 */
function Bubble({ role, content, toolCalls, streaming, tts }) {
  const isUser = role === 'user'
  const hasContent = !!(content && content.trim())
  const hasTools = Array.isArray(toolCalls) && toolCalls.length > 0
  // Assistant bubble'larında küçük bir "oku" kontrolü göster — sadece
  // TTS destekli tarayıcılarda ve sadece gerçek içerik varsa. Çalıyorsa
  // aynı buton "sustur" moduna geçer.
  const canSpeak = !isUser && hasContent && !streaming && tts?.supported
  const [hover, setHover] = useState(false)
  const handleSpeak = () => {
    if (!canSpeak) return
    if (tts.speaking) tts.cancel()
    else tts.speak(content)
  }
  return (
    <div
      className={`flex gap-2 group ${isUser ? 'flex-row-reverse' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
          isUser ? 'bg-ops-700' : 'bg-accent/20'
        }`}
      >
        {isUser ? (
          <span className="text-[10px] font-mono text-ops-300">siz</span>
        ) : (
          <Sparkles size={11} className="text-accent" />
        )}
      </div>
      <div className={`max-w-[85%] space-y-1.5 ${isUser ? 'items-end' : ''}`}>
        {/* Streaming ama henüz içerik yoksa: nazik "yazıyor" göstergesi. */}
        {streaming && !hasContent && !isUser && (
          <div className="rounded px-2.5 py-1.5 bg-ops-800/60 border border-ops-700 inline-flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-accent/70 animate-pulse" />
            <span className="w-1 h-1 rounded-full bg-accent/70 animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-accent/70 animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        )}
        {hasContent && (
          <div className="relative">
            <div
              className={`rounded px-2.5 py-1.5 text-[11.5px] leading-relaxed whitespace-pre-wrap break-words ${
                isUser
                  ? 'bg-accent/10 border border-accent/30 text-ops-100'
                  : 'bg-ops-800/60 border border-ops-700 text-ops-200'
              }`}
            >
              {renderLight(content)}
              {streaming && <span className="inline-block w-1 h-3 ml-0.5 bg-accent/70 animate-pulse align-middle" aria-hidden />}
            </div>
            {/* Sesli oku butonu — bubble'ın sağ-üst köşesinde, hover
                veya o anda konuşuyor iken görünür. Non-intrusive. */}
            {canSpeak && (hover || tts.speaking) && (
              <button
                onClick={handleSpeak}
                className={`absolute -top-1.5 -right-1.5 p-1 rounded-full border bg-ops-900 shadow-sm transition-colors ${
                  tts.speaking
                    ? 'border-accent/60 text-accent'
                    : 'border-ops-600 text-ops-400 hover:text-ops-100 hover:border-accent/50'
                }`}
                title={tts.speaking ? 'Okumayı durdur' : 'Sesli oku'}
                aria-label={tts.speaking ? 'Okumayı durdur' : 'Sesli oku'}
              >
                {tts.speaking ? <VolumeX size={10} /> : <Volume2 size={10} />}
              </button>
            )}
          </div>
        )}
        {hasTools && <ToolCallLog calls={toolCalls} />}
      </div>
    </div>
  )
}

/**
 * Araç çağrı günlüğü — assistant bubble'ının altında, katlanabilir.
 * Başlıkta sayı + ilk 2 aracın adı özet olarak, detaylar açılınca
 * her biri için name/args/result görünür.
 */
function ToolCallLog({ calls }) {
  const [open, setOpen] = useState(false)
  const okCount   = calls.filter((c) => c.ok).length
  const failCount = calls.length - okCount
  return (
    <div className="rounded border border-ops-700 bg-ops-900/40 text-[10.5px]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-ops-300 hover:text-ops-100 font-mono"
      >
        <Wrench size={10} className="text-accent" />
        <span className="truncate">
          {calls.length} araç çalıştı
          {failCount > 0 && <span className="text-red-400"> · {failCount} hata</span>}
        </span>
        {open ? <ChevronUp size={10} className="ml-auto shrink-0" /> : <ChevronDown size={10} className="ml-auto shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-ops-700/60 p-1.5 space-y-1">
          {calls.map((c, i) => <ToolCallRow key={i} call={c} />)}
        </div>
      )}
    </div>
  )
}

function ToolCallRow({ call }) {
  const [detailOpen, setDetailOpen] = useState(false)
  const ok = call.ok
  return (
    <div className={`rounded border px-1.5 py-1 ${ok ? 'border-emerald-600/40 bg-emerald-950/20' : 'border-red-600/40 bg-red-950/20'}`}>
      <button
        onClick={() => setDetailOpen((v) => !v)}
        className="w-full flex items-center gap-1 font-mono text-[10px] text-left"
      >
        {ok
          ? <CheckCircle2 size={10} className="text-emerald-400 shrink-0" />
          : <AlertTriangle size={10} className="text-red-400 shrink-0" />}
        <span className={`truncate ${ok ? 'text-emerald-200' : 'text-red-200'}`}>{call.name}</span>
        <span className="ml-auto text-ops-500 text-[9px]">
          {detailOpen ? '−' : '+'}
        </span>
      </button>
      {detailOpen && (
        <div className="mt-1 space-y-1">
          {call.args && Object.keys(call.args).length > 0 && (
            <ToolJsonBlock label="args" data={call.args} />
          )}
          {ok
            ? <ToolJsonBlock label="result" data={call.result} />
            : <div className="text-[10px] text-red-300 font-mono px-1 py-0.5 rounded bg-red-950/30 border border-red-700/40 whitespace-pre-wrap break-words">{call.error}</div>}
        </div>
      )}
    </div>
  )
}

function ToolJsonBlock({ label, data }) {
  const json = (() => {
    try { return JSON.stringify(data, null, 2) } catch { return String(data) }
  })()
  const truncated = json.length > 600 ? json.slice(0, 600) + '…' : json
  return (
    <div>
      <div className="text-[9px] font-mono uppercase text-ops-500 mb-0.5">{label}</div>
      <pre className="text-[9.5px] font-mono text-ops-300 bg-ops-900/70 border border-ops-700/60 rounded px-1.5 py-1 overflow-x-auto whitespace-pre-wrap break-words">
{truncated}
      </pre>
    </div>
  )
}

/** Çok hafif bir Markdown benzeri render — başlık/liste/kod bloku. */
function renderLight(text) {
  if (!text) return null
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (/^```/.test(line)) return <React.Fragment key={i}></React.Fragment>
    if (/^#{1,3}\s/.test(line)) {
      const lvl = (line.match(/^#+/)?.[0] || '').length
      const body = line.replace(/^#+\s+/, '')
      return (
        <div key={i} className={`font-semibold text-ops-50 ${lvl === 1 ? 'text-[12.5px] mt-1' : 'text-[11.5px] mt-0.5'}`}>
          {body}
        </div>
      )
    }
    if (/^\s*[-•]\s+/.test(line)) {
      return (
        <div key={i} className="flex gap-1.5">
          <span className="text-ops-500 shrink-0">•</span>
          <span className="min-w-0">{line.replace(/^\s*[-•]\s+/, '')}</span>
        </div>
      )
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      return (
        <div key={i} className="flex gap-1.5">
          <span className="text-ops-500 shrink-0 font-mono text-[10px]">{line.match(/^\s*(\d+)\./)[1]}.</span>
          <span className="min-w-0">{line.replace(/^\s*\d+\.\s+/, '')}</span>
        </div>
      )
    }
    return <div key={i}>{line || '\u00A0'}</div>
  })
}

/** Giriş bloğu — boş sohbet ekranı için. */
function IntroBlock({ quickActions, onPick, disabled, provider, bridgeStatus, onOpenSettings }) {
  const isLocal = !provider?.needsKey
  const bridgeDown = isLocal && bridgeStatus?.state !== 'ok' && bridgeStatus?.state !== 'checking'
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="shrink-0 w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
          <Sparkles size={11} className="text-accent" />
        </div>
        <div className="flex-1 bg-ops-800/60 border border-ops-700 rounded px-2.5 py-1.5 text-[11px] text-ops-200 leading-relaxed">
          <span className="font-semibold text-ops-50">Agent modu.</span>{' '}
          Sorabilirsin, ama eylem de isteyebilirsin — haritayı taşı, katman aç/kapat,
          çatışma seç, node ekle, yakın tehdit ara. Araç kullandığımda altında günlük
          çıkar.{' '}
          {isLocal ? (
            <span className="text-ops-400 italic">
              Yanıtlar kendi bilgisayarında çalışan köprü üzerinden Claude CLI'a
              (Max aboneliği) gider. Bulutta hiçbir şey kalmaz.
            </span>
          ) : (
            <span className="text-ops-400 italic">
              Mesajları API anahtarınla doğrudan LLM'e yolluyorum; anahtar bu
              tarayıcı dışına çıkmaz.
            </span>
          )}
        </div>
      </div>

      {/* Köprü kapalıysa ne yapacağını göster */}
      {bridgeDown && (
        <BridgeDownHint
          onOpenSettings={onOpenSettings}
          error={bridgeStatus?.error}
        />
      )}

      <div className="pt-1">
        <div className="text-[9.5px] uppercase font-mono text-ops-500 tracking-wider mb-1.5">
          Hızlı eylem
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {quickActions.map((a) => {
            const Icon = a.icon
            return (
              <button
                key={a.id}
                onClick={() => onPick(a.prompt)}
                disabled={disabled}
                className="group flex items-center gap-2 px-2 py-1.5 rounded border border-ops-700 bg-ops-800/30 hover:border-accent/50 hover:bg-accent/5 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] text-ops-200 text-left transition-colors"
              >
                <Icon size={12} className="shrink-0 text-ops-400 group-hover:text-accent" />
                <span className="flex-1 truncate">{a.label}</span>
                <ChevronRight size={11} className="shrink-0 text-ops-500 group-hover:text-accent" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Köprü kapalı uyarısı — kullanıcıya tam olarak ne yapacağını gösterir.
 * Komutu kopyalanabilir kod bloğunda verir; uzun hata mesajını gizli
 * tutar (details/summary).
 */
function BridgeDownHint({ onOpenSettings, error }) {
  return (
    <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-300">
        <Terminal size={11} /> Lokal köprü kapalı
      </div>
      <div className="text-[10.5px] text-ops-200 leading-relaxed">
        Yeni bir terminalde proje klasöründe şu komutu çalıştır:
      </div>
      <div className="flex items-center gap-1 rounded bg-ops-900 border border-ops-700 px-2 py-1 font-mono text-[10.5px] text-emerald-300">
        <span className="text-ops-500 select-none">$</span>
        <span>npm run assistant</span>
      </div>
      <div className="text-[9.5px] text-ops-500 leading-snug">
        Script, Claude Code CLI üzerinden Max aboneliğini kullanır. Bir kere
        çalışınca bu panelin üstündeki "köprü aktif" rozeti yanar.
        {' '}
        <button onClick={onOpenSettings} className="text-accent hover:underline">
          Ayarlar →
        </button>
      </div>
      {error && (
        <details className="text-[9.5px] text-ops-500">
          <summary className="cursor-pointer hover:text-ops-300">Teknik detay</summary>
          <pre className="mt-1 p-1 rounded bg-ops-900 border border-ops-700 text-red-300 whitespace-pre-wrap break-words">{String(error)}</pre>
        </details>
      )}
    </div>
  )
}

/**
 * API anahtarı + sağlayıcı + model + lokal köprü ayarları.
 *
 * Sağlayıcı "local" ise API anahtar alanı gizlenir ve yerine
 * köprü URL'i + "npm run assistant" hatırlatması çıkar. Sağlayıcı
 * cloud ise (anthropic/openai) klasik API-key alanı görünür.
 */
function SettingsBlock({ config, setConfig, bridgeStatus, onRefreshBridge, onClearKey }) {
  const [showKey, setShowKey] = useState(false)
  const provider = PROVIDERS[config.provider] || PROVIDERS.local
  return (
    <div className="border-b border-ops-700 bg-ops-900/30 p-2.5 space-y-2">
      <div className="text-[9px] font-mono uppercase tracking-wider text-ops-500 flex items-center gap-1.5">
        <Settings size={10} /> AYARLAR
      </div>

      {/* Sağlayıcı — 3 seçenek olduğu için tek kolonluk stack daha okunur */}
      <div>
        <label className="block text-[9.5px] font-mono uppercase text-ops-400 mb-1">Sağlayıcı</label>
        <div className="grid grid-cols-1 gap-1">
          {Object.values(PROVIDERS).map((p) => {
            const active = config.provider === p.id
            return (
              <button
                key={p.id}
                onClick={() => setConfig((c) => ({ ...c, provider: p.id, model: '' }))}
                className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10.5px] text-left transition-colors ${
                  active
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-ops-700 text-ops-300 hover:text-ops-100 hover:border-ops-500'
                }`}
              >
                {p.id === 'local' ? <Server size={10} className="shrink-0" /> :
                 p.id === 'anthropic' ? <Sparkles size={10} className="shrink-0" /> :
                 <Cpu size={10} className="shrink-0" />}
                <span className="truncate">{p.label}</span>
                {!p.needsKey && (
                  <span className="ml-auto text-[8.5px] font-mono uppercase text-ops-500">max</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Model */}
      <div>
        <label className="block text-[9.5px] font-mono uppercase text-ops-400 mb-1">Model</label>
        <select
          value={config.model || provider.defaultModel}
          onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
          className="w-full bg-ops-900 border border-ops-700 rounded px-2 py-1 text-[11px] text-ops-100 focus:outline-none focus:border-accent/60"
        >
          {provider.models.map((m) => (
            <option key={m.id || '__auto'} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Local sağlayıcı için: köprü URL'i + durum + çalıştırma hatırlatması */}
      {!provider.needsKey && (
        <div className="space-y-2">
          <div>
            <label className="block text-[9.5px] font-mono uppercase text-ops-400 mb-1 flex items-center gap-1">
              <Server size={9} /> Köprü URL'i
            </label>
            <div className="flex gap-1">
              <input
                type="text"
                value={config.localUrl || DEFAULT_LOCAL_URL}
                onChange={(e) => setConfig((c) => ({ ...c, localUrl: e.target.value }))}
                placeholder={DEFAULT_LOCAL_URL}
                className="flex-1 bg-ops-900 border border-ops-700 rounded px-2 py-1 text-[11px] font-mono text-ops-100 focus:outline-none focus:border-accent/60"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                onClick={onRefreshBridge}
                className="p-1 rounded border border-ops-700 text-ops-400 hover:text-ops-100"
                title="Yeniden kontrol et"
              >
                <RefreshCw size={11} className={bridgeStatus.state === 'checking' ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Durum satırı */}
          <BridgeStatusLine status={bridgeStatus} />

          {/* Komut hatırlatması */}
          <div className="rounded border border-ops-700 bg-ops-900/60 p-2 space-y-1">
            <div className="flex items-center gap-1 text-[9.5px] font-mono uppercase tracking-wider text-ops-500">
              <Terminal size={10} /> Çalıştırma
            </div>
            <div className="flex items-center gap-1 rounded bg-ops-900 border border-ops-700 px-2 py-1 font-mono text-[10.5px] text-emerald-300">
              <span className="text-ops-500 select-none">$</span>
              <span>npm run assistant</span>
            </div>
            <p className="text-[9.5px] text-ops-500 leading-snug">
              {provider.hint}
            </p>
          </div>
        </div>
      )}

      {/* Cloud sağlayıcı için: API Key */}
      {provider.needsKey && (
        <div>
          <label className="block text-[9.5px] font-mono uppercase text-ops-400 mb-1 flex items-center gap-1">
            <Key size={9} /> API Anahtarı
          </label>
          <div className="flex gap-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={config.apiKey}
              onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
              placeholder={config.provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
              className="flex-1 bg-ops-900 border border-ops-700 rounded px-2 py-1 text-[11px] font-mono text-ops-100 focus:outline-none focus:border-accent/60"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="p-1 rounded border border-ops-700 text-ops-400 hover:text-ops-100"
              title={showKey ? 'Gizle' : 'Göster'}
            >
              {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
            {config.apiKey && (
              <button
                onClick={onClearKey}
                className="p-1 rounded border border-ops-700 text-ops-400 hover:text-red-400 hover:border-red-400/50"
                title="Anahtarı sil"
              >
                <RotateCcw size={11} />
              </button>
            )}
          </div>
          <p className="mt-1 text-[9.5px] text-ops-500 leading-snug">
            {provider.hint} Anahtar sadece bu tarayıcıda (localStorage) saklanır; hiçbir sunucuya gitmez.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Ayarlar panelindeki köprü durumu satırı — renk + kısa metin.
 * Başlıktaki rozetle paralel bilgi ama daha detaylı (versiyon / hata).
 */
function BridgeStatusLine({ status }) {
  if (status.state === 'ok') {
    return (
      <div className="flex items-center gap-1 text-[10px] text-emerald-300">
        <CheckCircle2 size={11} />
        <span>Köprü aktif.</span>
        {status.version && <span className="text-ops-500 font-mono truncate">{status.version}</span>}
      </div>
    )
  }
  if (status.state === 'checking') {
    return (
      <div className="flex items-center gap-1 text-[10px] text-ops-400">
        <Loader2 size={11} className="animate-spin" />
        Kontrol ediliyor…
      </div>
    )
  }
  return (
    <div className="flex items-start gap-1 text-[10px] text-red-300">
      <AlertTriangle size={11} className="shrink-0 mt-px" />
      <div className="min-w-0">
        <div>Köprü kapalı.</div>
        {status.error && (
          <div className="text-ops-500 font-mono break-words">{String(status.error)}</div>
        )}
      </div>
    </div>
  )
}

/**
 * Sistem promptu — asistanın kişiliği + uygulama bağlamı + araç kullanım
 * protokolü. Türkçe, operatör tonu. Bağlam her turda taze inject edilir.
 *
 * İki parça döner:
 *   cacheable — değişmeyen kısım (kurallar + araç listesi). Anthropic
 *               sağlayıcısında bu bloğa `cache_control:ephemeral` konur
 *               → sonraki turlarda TTFT dramatik düşer, input token
 *               maliyeti ~%90 azalır.
 *   dynamic   — her turda değişen canlı bağlam (seçili çatışma, görünür
 *               katmanlar, seçili operatör, vs.)
 *
 * Araç protokolü: yanıtta sıfır ya da daha fazla <tool_call> bloğu;
 * her blok saf JSON. Araç çağırırsan sonucu görmeden varsayım yapma —
 * bir sonraki tur sonuçla geri dönerim.
 */
function buildSystemPromptParts(ctx) {
  const cacheable = [
    `Sen "Sentinel AI"sin — Tairos Sentinel adlı harita-tabanlı komuta panelinin içine gömülmüş bir agent asistansın.`,
    ``,
    `Görevin: Operatörün sorduğunu anlamak, gerekirse araçlarla uygulamayı yönlendirmek (katman aç/kapa, haritayı taşı, node ekle, yakın tehdit ara, vs.), sonra kısa bir özetle bitirmek.`,
    ``,
    `KONUŞMA TARZI:`,
    `• Türkçe, tactical-ama-net. Gereksiz süs yok.`,
    `• Final cevap kısa: 1 paragraf veya 3-6 madde. Operatör panelden okuyor.`,
    `• Emin olmadığın veriyi uydurma — "seed'de yok" de veya search aracıyla kontrol et.`,
    `• Eylem yaptığında ne yaptığını cümleyle kısaca söyle ("Çatışma bubble\'larını açtım ve Ukrayna\'ya uçtum.").`,
    ``,
    `ARAÇ KULLANIMI:`,
    `• Kullanıcı eylem ister gibi göründüğünde ("katmanı aç", "şuraya bak", "yakınındakileri göster") ilgili aracı çağır.`,
    `• Birden fazla aracı art arda tek turda basabilirsin. Çağrı formatı ZORUNLU:`,
    ``,
    `<tool_call>`,
    `{"name":"araç.adı","args":{"anahtar":"değer"}}`,
    `</tool_call>`,
    ``,
    `• JSON SAF ve VALID olmalı (çift tırnak, kaçış karakterleri doğru). Backtick fence kullanma.`,
    `• Araç çağırdığın turda cevap-metin çok kısa olsun (\"Yapıyorum: …\"). Asıl açıklamayı sonuçları gördüğün bir sonraki turda yaz.`,
    `• Araçsız (sade metin) yanıt = final answer, döngü biter.`,
    `• Bilinmediğinde önce search.by_name veya conflict.list gibi "read" araçlarla doğrula, sonra eylem al.`,
    `• Koordinat gerekiyorsa doğrudan uydurma — search.by_name ile bul veya state.snapshot ile oku.`,
    `• Sistem promptundaki "CANLI BAĞLAM" bloğu her turda taze; state.snapshot'ı sadece bağlamda bulamadığın bir detaya ihtiyacın varsa çağır.`,
    ``,
    `GÜVENLİK:`,
    `• Asla silah/hedefleme için operasyonel koordinat üretme; sadece seed'deki bilinen varlıklara referans ver.`,
    `• node.remove, country.exit, conflict.exit gibi geri alınamayan eylemleri kullanıcı açıkça istediğinde yap.`,
    ``,
    describeTools(),
  ].join('\n')

  const dynamic = [
    `--- CANLI BAĞLAM ---`,
    formatContextAsMarkdown(ctx),
  ].join('\n')

  return { cacheable, dynamic }
}

// Geriye dönük uyum — bazı çağrıcılar düz string bekleyebilir.
function buildSystemPrompt(ctx) {
  const { cacheable, dynamic } = buildSystemPromptParts(ctx)
  return `${cacheable}\n${dynamic}`
}

/**
 * Streaming sırasında partial text → gösterilecek narrative.
 * <tool_call>...</tool_call> bloklarını gizler; yarım kalmış
 * (kapanmamış) tool_call tag'ini de kesmez (tag'in başladığı yere
 * kadar olan kısmı gösterir, sonrasını bekler).
 *
 * Böylece kullanıcı "Yapıyorum: katmanı açıyorum" görür; arkasından
 * gelen <tool_call>{...}</tool_call> blokları UI'da görünmez.
 */
function narrativeFromPartial(partial) {
  if (!partial) return ''
  const OPEN = '<tool_call>'
  const CLOSE = '</tool_call>'
  let out = ''
  let i = 0
  while (i < partial.length) {
    const openIdx = partial.indexOf(OPEN, i)
    if (openIdx === -1) {
      // Son kısımda yarım bir "<tool_call>" ön-eki varsa (ör. "<tool_"
      // geldi ama daha bitmedi) onu da gizle — kullanıcı ham tag
      // görmesin.
      let tail = partial.slice(i)
      const lastLt = tail.lastIndexOf('<')
      if (lastLt !== -1) {
        const suffix = tail.slice(lastLt)
        if (OPEN.startsWith(suffix) || CLOSE.startsWith(suffix)) {
          tail = tail.slice(0, lastLt)
        }
      }
      out += tail
      break
    }
    out += partial.slice(i, openIdx)
    const closeIdx = partial.indexOf(CLOSE, openIdx + OPEN.length)
    if (closeIdx === -1) break  // henüz kapanmadı → gerisini bekle
    i = closeIdx + CLOSE.length
  }
  return out
}

