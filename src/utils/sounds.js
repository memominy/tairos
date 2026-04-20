// Tairos Sentinel — tactical UI sound engine.
//
// Pure Web Audio synthesis (zero asset files) keeps the build weightless and
// lets every sound be tuned from code. The palette is deliberately short,
// dry, and slightly metallic — a command-surface feel, not a video-game
// feel. Master gain stays low so stacked actions never feel noisy during a
// demo. User can mute via the TopBar speaker button (preference persists).
//
// Usage:
//   import { playSound, setSoundsEnabled } from '../utils/sounds'
//   playSound('nodeAdd')
//
// `attachStoreSounds()` wires one-shot world sounds to store transitions so
// individual components don't have to sprinkle playSound() everywhere.

const KEY = 'tairos-sound-enabled'

// ── Preference (persisted) ───────────────────────────────────────────
const loadEnabled = () => {
  try { return localStorage.getItem(KEY) !== '0' } catch { return true }
}
const persistEnabled = (v) => {
  try { localStorage.setItem(KEY, v ? '1' : '0') } catch {}
}

let enabled = loadEnabled()
const listeners = new Set()

export const soundsEnabled = () => enabled
export const setSoundsEnabled = (v) => {
  const next = !!v
  if (next === enabled) return
  enabled = next
  persistEnabled(enabled)
  if (enabled) { resumeCtx(); playSound('toggleOn') }
  listeners.forEach((l) => { try { l(enabled) } catch {} })
}
export const onSoundsToggled = (cb) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// ── AudioContext (lazy, autoplay-policy aware) ───────────────────────
let ctx = null
let master = null

const ensureCtx = () => {
  if (ctx) return ctx
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.18   // tactical, not game-y
    master.connect(ctx.destination)
  } catch { return null }
  return ctx
}

const resumeCtx = () => {
  const c = ensureCtx()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
}

// Chrome/Safari suspend the AudioContext until a user gesture — unlock once.
if (typeof window !== 'undefined') {
  const unlock = () => {
    resumeCtx()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown',     unlock, { once: true })
}

// ── Primitives ───────────────────────────────────────────────────────
const beep = ({
  freq = 800,
  freqTo = null,
  type = 'sine',
  attack = 0.004,
  decay = 0.08,
  peak = 0.5,
  detune = 0,
}) => {
  const c = ensureCtx()
  if (!c) return
  const now = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, now)
  osc.detune.value = detune
  if (freqTo != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), now + attack + decay)
  }
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(peak, now + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay)
  osc.connect(gain).connect(master)
  osc.start(now)
  osc.stop(now + attack + decay + 0.02)
}

const noise = ({ dur = 0.2, peak = 0.3, hp = 200, lp = 3000 }) => {
  const c = ensureCtx()
  if (!c) return
  const now = c.currentTime
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const hpF = c.createBiquadFilter(); hpF.type = 'highpass'; hpF.frequency.value = hp
  const lpF = c.createBiquadFilter(); lpF.type = 'lowpass';  lpF.frequency.value = lp
  const g   = c.createGain()
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(peak, now + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  src.connect(hpF).connect(lpF).connect(g).connect(master)
  src.start(now)
  src.stop(now + dur + 0.05)
}

const at = (ms, fn) => setTimeout(() => { if (enabled) { try { fn() } catch {} } }, ms)

// ── Sound presets ────────────────────────────────────────────────────
const SOUNDS = {
  // Generic UI
  click:     () => beep({ freq: 1800, type: 'square',   attack: 0.001, decay: 0.025, peak: 0.26 }),
  hover:     () => beep({ freq: 2400, type: 'sine',     attack: 0.001, decay: 0.025, peak: 0.10 }),
  panel:     () => beep({ freq: 1400, type: 'triangle', attack: 0.003, decay: 0.05,  peak: 0.28 }),
  toggleOn:  () => beep({ freq:  600, freqTo: 1400, type: 'triangle', decay: 0.09, peak: 0.42 }),
  toggleOff: () => beep({ freq: 1400, freqTo:  500, type: 'triangle', decay: 0.09, peak: 0.38 }),

  // Node lifecycle (map edits)
  nodeAdd: () => {
    beep({ freq:  900, type: 'square',   attack: 0.001, decay: 0.02, peak: 0.28 })
    at(22, () => beep({ freq: 1500, freqTo: 1900, type: 'triangle', decay: 0.08, peak: 0.42 }))
  },
  nodeRemove: () => beep({ freq: 700, freqTo: 220, type: 'sawtooth', decay: 0.14, peak: 0.42 }),

  // Destructive bulk
  delete: () => {
    noise({ dur: 0.14, peak: 0.22, hp: 80, lp: 900 })
    beep({ freq: 220, freqTo: 80, type: 'sawtooth', decay: 0.16, peak: 0.38 })
  },

  // Positive feedback
  select: () => beep({ freq: 1600, type: 'sine', decay: 0.05, peak: 0.38 }),
  save: () => {
    beep({ freq:  880, type: 'triangle', decay: 0.06, peak: 0.42 })
    at(55, () => beep({ freq: 1320, type: 'triangle', decay: 0.10, peak: 0.48 }))
  },
  success: () => {
    beep({ freq:  660, type: 'triangle', decay: 0.06, peak: 0.42 })
    at(70,  () => beep({ freq:  880, type: 'triangle', decay: 0.06, peak: 0.48 }))
    at(140, () => beep({ freq: 1320, type: 'triangle', decay: 0.14, peak: 0.52 }))
  },
  error: () => {
    beep({ freq: 400, type: 'square', decay: 0.06, peak: 0.42 })
    at(80, () => beep({ freq: 260, type: 'square', decay: 0.12, peak: 0.42 }))
  },

  // Tactical / map interactions
  areaSelect: () => {
    beep({ freq:  900, type: 'square', decay: 0.04, peak: 0.33 })
    at(42, () => beep({ freq: 1300, type: 'square', decay: 0.04, peak: 0.33 }))
  },
  radarPing: () => beep({ freq: 1500, type: 'sine', decay: 0.35, peak: 0.33 }),

  // Conflict intel — alert ping, slightly ominous (low → falling),
  // clearly distinct from the positive "save" triad.
  conflictAlert: () => {
    beep({ freq: 440, type: 'triangle', decay: 0.08, peak: 0.38 })
    at(55, () => beep({ freq: 300, freqTo: 200, type: 'triangle', decay: 0.20, peak: 0.35 }))
  },
  conflictSelect: () => {
    beep({ freq: 520, type: 'triangle', decay: 0.05, peak: 0.35 })
    at(45, () => beep({ freq: 780, type: 'triangle', decay: 0.10, peak: 0.40 }))
  },
  tabSwitch: () => beep({ freq: 1100, type: 'sine', decay: 0.04, peak: 0.22 }),

  // Strategic placement pipeline
  placementStart:    () => beep({ freq: 1200, type: 'sine', decay: 0.28, peak: 0.40 }),
  placementTick:     () => beep({ freq: 1100, type: 'square', attack: 0.001, decay: 0.02, peak: 0.26 }),
  placementComplete: () => {
    beep({ freq:  660, type: 'triangle', decay: 0.07, peak: 0.42 })
    at(75,  () => beep({ freq:  990, type: 'triangle', decay: 0.07, peak: 0.48 }))
    at(160, () => beep({ freq: 1485, type: 'triangle', decay: 0.18, peak: 0.52 }))
  },

  // Weather / environmental
  weatherOn: () => {
    noise({ dur: 0.35, peak: 0.17, hp: 400, lp: 2000 })
    beep({ freq: 500, freqTo: 220, type: 'sine', decay: 0.32, peak: 0.20 })
  },
  weatherOff: () => noise({ dur: 0.18, peak: 0.11, hp: 400, lp: 1500 }),
}

export const playSound = (name) => {
  if (!enabled) return
  const fn = SOUNDS[name]
  if (!fn) return
  try { fn() } catch {}
}

// ── Store-driven world sounds ────────────────────────────────────────
// One place that listens to zustand transitions and plays the right sound
// so MapView / Sidebar handlers stay focused on their own concerns.
let attached = false
export const attachStoreSounds = (useStore) => {
  if (attached || !useStore) return
  attached = true
  let prev = useStore.getState()
  useStore.subscribe((s) => {
    try {
      if (!enabled) return

      // Node count changes (add / remove / bulk / strategic apply)
      if (s.customNodes !== prev.customNodes) {
        const delta = s.customNodes.length - prev.customNodes.length
        if (delta === 1)       playSound('nodeAdd')
        else if (delta === -1) playSound('nodeRemove')
        else if (delta < -1)   playSound('delete')
        else if (delta > 1)    playSound('placementComplete')
      }

      // Weather toggles
      if (s.weatherCloudsOn !== prev.weatherCloudsOn) {
        playSound(s.weatherCloudsOn ? 'weatherOn' : 'weatherOff')
      }
      if (s.weatherRainOn !== prev.weatherRainOn) {
        playSound(s.weatherRainOn ? 'weatherOn' : 'weatherOff')
      }

      // Strategic placement pipeline
      if (s.placementMode !== prev.placementMode) {
        if (s.placementMode === 'drawing')     playSound('placementStart')
        if (s.placementMode === 'configuring') playSound('radarPing')
      }

      // Saved groups
      if (s.areaGroups !== prev.areaGroups) {
        if (s.areaGroups.length > prev.areaGroups.length)       playSound('save')
        else if (s.areaGroups.length < prev.areaGroups.length)  playSound('nodeRemove')
      }

      // Right-drag selection opens
      if (!prev.areaSelection && s.areaSelection) playSound('areaSelect')

      // Facility / node detail panel
      if (!prev.selectedFacility && s.selectedFacility) playSound('panel')

      // Drone product toggle
      if (s.activeDrones !== prev.activeDrones) {
        const before = prev.activeDrones.size
        const after  = s.activeDrones.size
        if (after > before)      playSound('toggleOn')
        else if (after < before) playSound('toggleOff')
      }

      // Tile style change
      if (s.tileStyle !== prev.tileStyle) playSound('click')

      // Conflict layer toggled on/off
      if (s.conflictsOn !== prev.conflictsOn) {
        playSound(s.conflictsOn ? 'conflictAlert' : 'toggleOff')
      }
      // Conflict detail panel opened
      if (!prev.selectedConflict && s.selectedConflict) {
        playSound('conflictSelect')
      }
      // Sidebar tab switched
      if (s.sidebarTab !== prev.sidebarTab) playSound('tabSwitch')
    } finally {
      prev = s
    }
  })
}
