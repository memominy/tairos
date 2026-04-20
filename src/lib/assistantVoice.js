/**
 * Sentinel AI — ses yetenekleri (Web Speech API adaptörü).
 *
 * İki ayrı motor:
 *
 *   1. SpeechRecognition (STT — konuşma → metin)
 *      Chromium/Safari'de `webkitSpeechRecognition`, standartta
 *      `SpeechRecognition`. Firefox default olarak desteklemez; o
 *      durumda `useSpeechRecognition` { supported: false } döner ve UI
 *      mikrofon butonunu gizler.
 *
 *   2. speechSynthesis (TTS — metin → ses)
 *      Daha geniş destekli (Firefox dahil). `speechSynthesis` global
 *      objesi varsa aktif kabul edilir.
 *
 * Tasarım:
 *   • Hook tabanlı — AssistantPanel React component'i içinde
 *     mount/unmount'la senkron çalışır.
 *   • Dil tercihi TR varsayılan; ayarlardan değiştirilebilir.
 *   • Tercihler localStorage'da (`tairos:assistant:voice`) saklanır —
 *     auto-speak flag + dil kodu.
 *   • STT recognition obje referansı ref'te tutulur; yeniden mount
 *     olunca eski instance leak olmasın diye `stop()` + cleanup.
 *   • TTS dildeki en yakın voice otomatik seçilir (tr-TR tercihli).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* ── Tercih kalıcılığı ──────────────────────────────────── */
const LS_KEY_VOICE = 'tairos:assistant:voice'

const DEFAULT_PREFS = {
  lang: 'tr-TR',       // STT + TTS ortak dil
  autoSpeak: false,    // asistan cevapları otomatik sesli okunsun mu?
  rate: 1.0,           // TTS hızı (0.5–2)
  pitch: 1.0,          // TTS pitch (0–2)
  autoSend: true,      // STT final transcript alındığında otomatik gönder
  silenceMs: 2500,     // STT: bu kadar ms konuşma olmazsa otomatik kapat (düşünme payı)
}

export function loadVoicePrefs() {
  try {
    const raw = localStorage.getItem(LS_KEY_VOICE)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveVoicePrefs(prefs) {
  try { localStorage.setItem(LS_KEY_VOICE, JSON.stringify(prefs)) } catch {}
}

/* ── Destek kontrolü ────────────────────────────────────── */
export function isSpeechRecognitionSupported() {
  if (typeof window === 'undefined') return false
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}
export function isSpeechSynthesisSupported() {
  if (typeof window === 'undefined') return false
  return !!window.speechSynthesis
}

/* ── STT: konuşma → metin ───────────────────────────────── */
/**
 * useSpeechRecognition — mikrofon aç/kapat, aradaki transcript'i
 * stream'le dışarı ver.
 *
 * Dönüşler:
 *   supported : tarayıcı destekliyor mu?
 *   listening : şu an dinleniyor mu?
 *   transcript: o anda biriken metin (interim + final birleşik)
 *   error     : son hata mesajı (null = yok)
 *   start()   : dinlemeyi başlat
 *   stop()    : durdur
 *   toggle()  : aç-kapat kısa yol
 *
 * Opsiyonlar:
 *   lang     : 'tr-TR' gibi BCP-47 kodu
 *   onFinal  : (finalText) => void — tam bir cümle bitince tetiklenir
 *              (kullanıcı durduğunda veya stop çağrıldığında). UI burayı
 *              textarea'ya yerleştirmek veya auto-send için kullanır.
 *   onInterim: (interimText) => void — geçici (hala konuşurken) metin
 *
 * Not — Chrome/Edge "continuous" modu iki yönlü kırılgan: bazen sessizlik
 * sonrası otomatik end olur, bazen olmaz. Biz continuous=true + manuel
 * sessizlik timer'ı kullanıyoruz: kullanıcı konuşurken her interim/final
 * result timer'ı resetler, `silenceMs` kadar yeni sonuç gelmezse rec.stop()
 * çağrılır. Böylece kısa "düşünme" molaları (ör. 1–2 sn) recognition'ı
 * kesmiyor; ama cümle biter bitmez otomatik gönderim devam ediyor.
 *
 * silenceMs default 2500 (2.5 sn). Kullanıcı ayarlarda tuneladı.
 */
export function useSpeechRecognition({ lang = 'tr-TR', silenceMs = 2500, onFinal, onInterim } = {}) {
  const [supported] = useState(() => isSpeechRecognitionSupported())
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState(null)

  const recRef         = useRef(null)
  const finalRef       = useRef('')         // birikmiş final chunk'lar
  const silenceTimerRef = useRef(null)      // setTimeout id — sessizlik sayacı
  const silenceMsRef   = useRef(silenceMs)  // timer'dan okunan canlı değer
  const onFinalRef     = useRef(onFinal)
  const onInterimRef   = useRef(onInterim)

  // Callback ref'leri güncel tut — hook re-render'da ref tazelenir ama
  // SpeechRecognition instance'ı yaşıyor olabilir.
  useEffect(() => { onFinalRef.current   = onFinal   }, [onFinal])
  useEffect(() => { onInterimRef.current = onInterim }, [onInterim])
  useEffect(() => { silenceMsRef.current = silenceMs }, [silenceMs])

  // Sessizlik sayacı helpers
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }
  const armSilenceTimer = () => {
    clearSilenceTimer()
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null
      try { recRef.current?.stop() } catch {}
    }, silenceMsRef.current)
  }

  // Instance'ı bir kere oluştur; dil değişirse yeniden kur.
  useEffect(() => {
    if (!supported) return
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new Ctor()
    rec.lang           = lang
    rec.interimResults = true
    rec.continuous     = true    // sessizlikte otomatik kapanmasın — biz yöneteceğiz
    rec.maxAlternatives = 1

    rec.onstart = () => {
      finalRef.current = ''
      setTranscript('')
      setError(null)
      setListening(true)
      // ilk sessizlik penceresini aç: hiç konuşmazsa yine de çok uzun sürmesin
      armSilenceTimer()
    }
    rec.onerror = (e) => {
      // "no-speech" ve "aborted" kullanıcının normal davranışı — UI'da
      // gösterme. Gerçek izin/permission hatalarını göster.
      const code = e?.error || 'unknown'
      if (code === 'no-speech' || code === 'aborted') {
        setError(null)
      } else if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError('Mikrofon izni reddedildi. Tarayıcı ayarlarından izin ver.')
      } else {
        setError(`Ses tanıma hatası: ${code}`)
      }
    }
    rec.onend = () => {
      clearSilenceTimer()
      setListening(false)
      const finalText = finalRef.current.trim()
      if (finalText && onFinalRef.current) {
        onFinalRef.current(finalText)
      }
    }
    rec.onresult = (ev) => {
      let interim = ''
      let gotAny = false
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]
        const text = res[0]?.transcript || ''
        if (res.isFinal) {
          finalRef.current += text
          gotAny = true
        } else if (text) {
          interim += text
          gotAny = true
        }
      }
      const combined = (finalRef.current + interim).trimStart()
      setTranscript(combined)
      if (interim && onInterimRef.current) onInterimRef.current(interim)
      // Her yeni sonuçta sessizlik sayacını resetle — düşünme molası = mikrofon açık
      if (gotAny) armSilenceTimer()
    }

    recRef.current = rec
    return () => {
      clearSilenceTimer()
      try { rec.onstart = rec.onend = rec.onerror = rec.onresult = null } catch {}
      try { rec.abort() } catch {}
      if (recRef.current === rec) recRef.current = null
    }
  }, [supported, lang])

  const start = useCallback(() => {
    if (!recRef.current || listening) return
    try {
      finalRef.current = ''
      setTranscript('')
      setError(null)
      recRef.current.start()
    } catch (e) {
      // Chrome: "already started" error → önce stop'la sonra tekrar dene
      setError(e.message || String(e))
    }
  }, [listening])

  const stop = useCallback(() => {
    clearSilenceTimer()
    if (!recRef.current) return
    try { recRef.current.stop() } catch {}
  }, [])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  return { supported, listening, transcript, error, start, stop, toggle }
}

/* ── TTS: metin → ses ───────────────────────────────────── */
/**
 * useSpeechSynthesis — metin okut, duraklat, iptal et.
 *
 * Dönüşler:
 *   supported : tarayıcı destekliyor mu?
 *   speaking  : şu an bir utterance çalıyor mu?
 *   speak(text, opts) : oku. opts.lang/rate/pitch override.
 *   cancel()  : aktif ve kuyrukta olan her şeyi kes.
 *   voices    : yüklenmiş voice listesi (dilsel kontrol için)
 *
 * Not — `speechSynthesis.getVoices()` Chrome'da asenkron yüklenir; ilk
 * çağrıda boş dönebilir. `voiceschanged` event'iyle retry ediyoruz.
 */
export function useSpeechSynthesis({ lang = 'tr-TR', rate = 1.0, pitch = 1.0 } = {}) {
  const [supported] = useState(() => isSpeechSynthesisSupported())
  const [speaking, setSpeaking] = useState(false)
  const [voices, setVoices] = useState([])
  const currentRef = useRef(null)

  // Voices yüklemesi
  useEffect(() => {
    if (!supported) return
    const load = () => setVoices(window.speechSynthesis.getVoices() || [])
    load()
    window.speechSynthesis.addEventListener?.('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load)
  }, [supported])

  // Unmount olunca aktif okumayı kes ki arkada kalmasın.
  useEffect(() => {
    return () => {
      if (supported) {
        try { window.speechSynthesis.cancel() } catch {}
      }
    }
  }, [supported])

  // İstenilen dile en yakın voice'u seç. Tam eşleşme yoksa prefix (tr*),
  // o da yoksa undefined döner — tarayıcı default'u kullanılır.
  const pickVoice = useCallback((wantedLang) => {
    if (!voices.length) return null
    const exact = voices.find((v) => v.lang === wantedLang)
    if (exact) return exact
    const prefix = wantedLang.split('-')[0]
    const byPrefix = voices.find((v) => v.lang?.startsWith(prefix + '-') || v.lang === prefix)
    return byPrefix || null
  }, [voices])

  const speak = useCallback((text, opts = {}) => {
    if (!supported || !text) return
    const cleaned = stripForSpeech(text)
    if (!cleaned.trim()) return
    try {
      window.speechSynthesis.cancel()  // önceki kuyrukla karışmasın
      const u = new SpeechSynthesisUtterance(cleaned)
      u.lang  = opts.lang  || lang
      u.rate  = opts.rate  ?? rate
      u.pitch = opts.pitch ?? pitch
      const voice = pickVoice(u.lang)
      if (voice) u.voice = voice
      u.onstart = () => setSpeaking(true)
      u.onend   = () => { setSpeaking(false); currentRef.current = null }
      u.onerror = () => { setSpeaking(false); currentRef.current = null }
      currentRef.current = u
      window.speechSynthesis.speak(u)
    } catch {
      setSpeaking(false)
    }
  }, [supported, lang, rate, pitch, pickVoice])

  const cancel = useCallback(() => {
    if (!supported) return
    try { window.speechSynthesis.cancel() } catch {}
    setSpeaking(false)
    currentRef.current = null
  }, [supported])

  // İstenen dil için uygun voice var mı? UI küçük bir uyarı göstermek için
  // kullanabilir ("tr-TR sesi yok, fallback: en-US").
  const voiceForLang = useMemo(() => pickVoice(lang), [lang, pickVoice])

  return { supported, speaking, speak, cancel, voices, voiceForLang }
}

/* ── Yardımcı — metin temizliği ────────────────────────────
 * Asistan cevapları markdown-tarzı süslemeler (##, -, **bold**, kod
 * blokları, <tool_call>...) içerebilir. TTS bunları kelime kelime
 * okursa berbat ses çıkıyor. Okumadan önce temizle. */
function stripForSpeech(text) {
  if (!text) return ''
  return String(text)
    // tool_call blokları — sesli okuma değeri yok
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, ' ')
    // kod blokları (``` ... ```)
    .replace(/```[\s\S]*?```/g, ' ')
    // inline code `...`
    .replace(/`([^`]+)`/g, '$1')
    // headings (# ## ###)
    .replace(/^#{1,6}\s+/gm, '')
    // bold/italic işaretleri (**x**, __x__, *x*, _x_)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // madde işaretleri başı
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // fazla boşluk
    .replace(/\s+/g, ' ')
    .trim()
}
