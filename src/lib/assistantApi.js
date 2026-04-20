/**
 * Sentinel AI — LLM API adaptörü.
 *
 * Browser-originated (no backend) çağrılar. Anthropic ve OpenAI
 * uyumlu endpoint'leri destekler. API key localStorage'da kalır —
 * kullanıcının tarayıcısı dışına çıkmaz.
 *
 * Anthropic için `anthropic-dangerous-direct-browser-access: true`
 * başlığıyla CORS kapısı açılır (Anthropic'in resmi "tarayıcıdan
 * direkt çağrı" kontratı). Claude Max aboneleri kendi API key'lerini
 * console.anthropic.com üzerinden üretir.
 *
 * Mesaj formatı OpenAI Chat Completions'a benzer:
 *   [{ role: 'user'|'assistant', content: string }, ...]
 * Sistem promptu ayrı parametre.
 */

const LS_KEY_PROVIDER  = 'tairos:assistant:provider'
const LS_KEY_API_KEY   = 'tairos:assistant:apiKey'
const LS_KEY_MODEL     = 'tairos:assistant:model'
const LS_KEY_LOCAL_URL = 'tairos:assistant:localUrl'

export const DEFAULT_LOCAL_URL = 'http://localhost:8787'

export const PROVIDERS = {
  local: {
    id: 'local',
    label: 'Claude Max (lokal köprü)',
    hint:  'Ayrı bir terminalde `npm run assistant` çalıştır. Kendi bilgisayarında dönen Node script, Claude Code CLI üzerinden Max aboneliğini kullanır — API key gerekmez.',
    needsKey: false,
    models: [
      { id: '',                             label: 'Otomatik (Claude Code default)' },
      { id: 'claude-sonnet-4-5-20250929',   label: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-1-20250805',     label: 'Claude Opus 4.1' },
      { id: 'claude-haiku-4-5',             label: 'Claude Haiku 4.5' },
    ],
    defaultModel: '',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic API (key)',
    hint:  'console.anthropic.com → API Keys. API key ile direkt sağlayıcıya gider.',
    needsKey: true,
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: [
      { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (güncel)' },
      { id: 'claude-opus-4-1-20250805',   label: 'Claude Opus 4.1' },
      { id: 'claude-haiku-4-5',            label: 'Claude Haiku 4.5 (hızlı)' },
    ],
    defaultModel: 'claude-sonnet-4-5-20250929',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    hint:  'platform.openai.com → API Keys.',
    needsKey: true,
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: [
      { id: 'gpt-4o',      label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (hızlı)' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
    defaultModel: 'gpt-4o-mini',
  },
}

export function loadAssistantConfig() {
  try {
    return {
      provider: localStorage.getItem(LS_KEY_PROVIDER)  || 'local',
      apiKey:   localStorage.getItem(LS_KEY_API_KEY)   || '',
      model:    localStorage.getItem(LS_KEY_MODEL)     || '',
      localUrl: localStorage.getItem(LS_KEY_LOCAL_URL) || DEFAULT_LOCAL_URL,
    }
  } catch {
    return { provider: 'local', apiKey: '', model: '', localUrl: DEFAULT_LOCAL_URL }
  }
}

export function saveAssistantConfig({ provider, apiKey, model, localUrl }) {
  try {
    if (provider !== undefined) localStorage.setItem(LS_KEY_PROVIDER,  provider)
    if (apiKey   !== undefined) localStorage.setItem(LS_KEY_API_KEY,   apiKey)
    if (model    !== undefined) localStorage.setItem(LS_KEY_MODEL,     model)
    if (localUrl !== undefined) localStorage.setItem(LS_KEY_LOCAL_URL, localUrl)
  } catch {}
}

export function clearAssistantApiKey() {
  try { localStorage.removeItem(LS_KEY_API_KEY) } catch {}
}

/**
 * Lokal köprü sağlık kontrolü. Panelin "çalışıyor mu?" göstergesi
 * için kullanılır. Sunucu yoksa ok:false + hata metni döner.
 */
export async function pingLocalBridge(url = DEFAULT_LOCAL_URL) {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/health`, {
      method: 'GET',
      cache:  'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return { ok: !!data.ok, ...data, status: res.status }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

/**
 * Tek turda sohbet — Anthropic + OpenAI için **SSE streaming** (token
 * geldikçe `onStreamChunk` tetikler) + Anthropic **prompt caching**
 * (tekrarlayan sistem/araç promptu cached, sonraki turlar TTFT'de ciddi
 * hızlanır). Lokal köprü streaming desteklemiyorsa non-streaming fallback.
 *
 * Parametreler:
 *   system         : legacy — düz string (geriye dönük uyum için)
 *   systemParts    : { cacheable, dynamic }
 *                    cacheable = değişmeyen kısım (kural + araç listesi)
 *                    dynamic   = her turda değişen bağlam
 *                    Anthropic'te cacheable bloğa `cache_control:ephemeral`
 *                    eklenir → ~5 dk cache TTL, TTFT dramatik düşer.
 *   onStreamChunk  : (deltaText, fullTextSoFar) => void
 *                    Her SSE delta'sında çağrılır. UI bunu streaming
 *                    bubble'a yansıtır.
 *
 * Dönüş: { text, usage }
 * Hata durumunda anlamlı bir mesajla throw.
 */
export async function sendChat({
  provider, apiKey, model, system, systemParts, messages, signal, localUrl,
  onStreamChunk,
}) {
  const p = PROVIDERS[provider]
  if (!p) throw new Error(`Bilinmeyen sağlayıcı: ${provider}`)
  if (p.needsKey && !apiKey) throw new Error('API anahtarı yok. Ayarlar sekmesinden ekle.')
  const mdl = model || p.defaultModel

  // Split system-i düz string'e merge et (lokal + OpenAI için). Anthropic
  // için cache_control kullandığımızda parts'ı doğrudan geçireceğiz.
  const systemFlat = systemParts
    ? [systemParts.cacheable, systemParts.dynamic].filter(Boolean).join('\n')
    : (system || '')

  if (provider === 'local') {
    // Lokal köprü şu an streaming konuşmuyor — non-streaming fallback.
    const base = (localUrl || DEFAULT_LOCAL_URL).replace(/\/$/, '')
    let res
    try {
      res = await fetch(`${base}/chat`, {
        method:  'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ system: systemFlat, messages, model: mdl }),
      })
    } catch (e) {
      throw new Error(
        `Lokal köprüye ulaşılamadı (${base}). Ayrı terminalde ` +
        `"npm run assistant" komutu çalışıyor mu?\n` +
        `Detay: ${e.message || e}`
      )
    }
    if (!res.ok) throw await toError(res)
    const data = await res.json()
    const text = data.text || ''
    // Streaming callback verildiyse, non-streaming sonucu tek seferde iletelim
    // — UI hiç olmazsa "hemen tamamlandı" davranışını yakalasın.
    if (onStreamChunk && text) onStreamChunk(text, text)
    return { text, usage: null }
  }

  if (provider === 'anthropic') {
    // Prompt caching: cacheable bloğu işaretle. Anthropic API `system`'i
    // array olarak kabul ediyor; son 4 bloktan herhangi birinde
    // `cache_control:{type:'ephemeral'}` varsa önbelleğe alır.
    //
    // GÜVENLİK: cache_control minimum blok boyutu ~1024 token (Claude
    // 3.5+). Bloğumuz çok kısaysa API 400 verir. Bu yüzden:
    //   • Sadece cacheable uzunsa cache_control ekliyoruz (~4500 char).
    //   • Bu da başarısız olursa cache_control'ü düşürüp bir kez retry
    //     ediyoruz — kullanıcı cache bug'ı yüzünden asla engellenmiyor.
    const CACHE_MIN_CHARS = 4500
    const useCache = !!(systemParts?.cacheable && systemParts.cacheable.length >= CACHE_MIN_CHARS)

    const buildSystemBody = (withCache) => {
      if (systemParts?.cacheable) {
        const firstBlock = { type: 'text', text: systemParts.cacheable }
        if (withCache) firstBlock.cache_control = { type: 'ephemeral' }
        return [
          firstBlock,
          ...(systemParts.dynamic
            ? [{ type: 'text', text: systemParts.dynamic }]
            : []),
        ]
      }
      return systemFlat
    }

    const buildBody = (withCache) => ({
      model: mdl,
      max_tokens: 2048,
      temperature: 0.3,               // daha deterministik → cümle daha
                                      //   kısa ve tutarlı = daha hızlı
      system: buildSystemBody(withCache),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: !!onStreamChunk,
    })

    const doFetch = (withCache) => fetch(p.endpoint, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(buildBody(withCache)),
    })

    let res = await doFetch(useCache)
    if (!res.ok && useCache && res.status >= 400 && res.status < 500) {
      // Cache ile 4xx aldık — cache'siz bir kez daha dene. Hata gerçekten
      // cache'ten mi başka bir şeyden mi anlayamayız, ama cache'i
      // düşürmek en güvenli retry.
      res = await doFetch(false)
    }
    if (!res.ok) throw await toError(res)

    const stream = !!onStreamChunk
    if (stream) {
      // Anthropic SSE — her "content_block_delta" eventinde delta.text gelir.
      // Usage son "message_delta" / "message_stop" öncesinde yayınlanır.
      let full = ''
      let usage = null
      await parseSSE(res.body, (event) => {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          const d = event.delta.text
          full += d
          onStreamChunk(d, full)
        } else if (event.type === 'message_delta' && event.usage) {
          usage = event.usage
        }
      })
      return { text: full, usage }
    }

    const data = await res.json()
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n') || ''
    return { text, usage: data.usage || null }
  }

  if (provider === 'openai') {
    const body = {
      model: mdl,
      messages: [
        ...(systemFlat ? [{ role: 'system', content: systemFlat }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.3,
      stream: !!onStreamChunk,
      // OpenAI streaming'de usage için opt-in gerek:
      ...(onStreamChunk ? { stream_options: { include_usage: true } } : {}),
    }

    const res = await fetch(p.endpoint, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw await toError(res)

    if (body.stream) {
      // OpenAI SSE — `data: {...}` satırları, son satırda `data: [DONE]`.
      // Delta: choices[0].delta.content
      let full = ''
      let usage = null
      await parseSSE(res.body, (event) => {
        const delta = event.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onStreamChunk(delta, full)
        }
        if (event.usage) usage = event.usage
      })
      return { text: full, usage }
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''
    return { text, usage: data.usage || null }
  }

  throw new Error(`Sağlayıcı desteklenmiyor: ${provider}`)
}

/* ── SSE okuyucu ─────────────────────────────────────────────
 * Anthropic + OpenAI'nin `text/event-stream` formatı aynı:
 *   event: <tip>        (opsiyonel, Anthropic kullanıyor)
 *   data: <json|[DONE]>
 *   <boş satır>
 * İki format için ortak parse: `data:` satırlarındaki JSON'u parse
 * edip callback'e iletir. [DONE] geldiğinde durur.
 */
async function parseSSE(stream, onEvent) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      // Parse by double-newline (event boundary)
      let boundary
      while ((boundary = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, boundary)
        buf = buf.slice(boundary + 2)
        // Chunk birden fazla satır içerebilir — sadece data: olanı al
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          if (payload === '[DONE]') return
          try { onEvent(JSON.parse(payload)) } catch { /* malformed — yut */ }
        }
      }
    }
  } finally {
    try { reader.releaseLock() } catch {}
  }
}

async function toError(res) {
  let body = ''
  try { body = await res.text() } catch {}
  let msg  = `${res.status} ${res.statusText}`
  try {
    const parsed = JSON.parse(body)
    if (parsed?.error?.message) msg += ` — ${parsed.error.message}`
  } catch {
    if (body) msg += ` — ${body.slice(0, 200)}`
  }
  return new Error(msg)
}
