/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      /* ── Color system ──────────────────────────────────────────────
         The `ops` scale is the chrome of the product: backgrounds,
         panels, borders, and low-emphasis text live here. It's a
         cool-blue desaturated ladder so the map (high-contrast,
         colorful data) always reads as the centre of attention.

         Semantic colors (`accent`, `signal`, `warn`, `alert`) carry
         meaning — use them only when a UI element is conveying state,
         never as decoration. Keeps the surface disciplined. */
      colors: {
        ops: {
          50:  '#EEF2FA',   // highest-contrast text
          100: '#D2DCEE',   // primary text
          200: '#A6B4CC',   // secondary text
          300: '#7687A3',   // tertiary labels
          400: '#52647F',   // muted labels / icon strokes
          500: '#344563',   // subdued borders
          600: '#212E47',   // default borders
          700: '#141C30',   // panel dividers
          800: '#0B1220',   // panels
          900: '#060A14',   // app background
        },
        /* Accent: the Tairos brand warm. Used on CTAs, the live
           indicator, focus rings on brand inputs, and anywhere the
           product should feel "yours". Slightly bumped saturation
           from the previous flat tone for a more premium read. */
        accent: {
          DEFAULT: '#D85A30',
          hover:   '#E8682A',
          muted:   '#8C3A1E',
          soft:    '#3A1D12',
        },
        /* Cool system-action tone — use for neutral primary buttons
           where the warm accent would compete with threat/status colour
           (e.g. inside the conflict panel "fly to theatre" button). */
        signal: {
          DEFAULT: '#3A7BD5',
          hover:   '#4F8DE3',
          muted:   '#1F3A66',
        },
        /* Success / operational state (node added, placement ran). */
        ok: {
          DEFAULT: '#2EA889',
          soft:    '#14473B',
        },
        /* Caution / pre-action. */
        warn: {
          DEFAULT: '#C9A236',
          soft:    '#3E3218',
        },
        /* Hard alert / destructive. */
        alert: {
          DEFAULT: '#C04631',
          soft:    '#3B1912',
        },
        blue: {
          ops: '#378ADD',
        },
        /* Conflict intel palette — muted command-map tones. Earlier values
           read as neon against the dark basemap; these are desaturated so the
           layer feels like information on a chart rather than an arcade HUD.
           Keep in sync with ConflictLayer.statusColour(), ConflictSection,
           and ConflictDetailPanel.STATUS_META. */
        conflict: {
          active:    '#C04631',
          frozen:    '#9AA6B8',
          tension:   '#B09340',
          ongoing:   '#B87035',
          resolved:  '#4A8C70',
          ink:       '#1A0E0B',
        },
      },

      /* ── Typographic scale ────────────────────────────────────────
         Collapsed from ~9 ad-hoc sizes to a disciplined ladder. Each
         step is named by role (micro / caption / body / title / …),
         so components can pick by intent rather than pixel math. */
      fontSize: {
        micro:   ['10px',  { lineHeight: '14px', letterSpacing: '0.02em' }],
        caption: ['11px',  { lineHeight: '16px', letterSpacing: '0.01em' }],
        body:    ['12px',  { lineHeight: '18px' }],
        title:   ['13px',  { lineHeight: '18px', letterSpacing: '-0.005em' }],
        heading: ['15px',  { lineHeight: '20px', letterSpacing: '-0.01em', fontWeight: '600' }],
        display: ['20px',  { lineHeight: '26px', letterSpacing: '-0.015em', fontWeight: '700' }],
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Fira Code', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: {
        /* Used on small-caps / label text for a refined, printed-spec feel. */
        spec: '0.08em',
      },

      /* ── Spatial hierarchy (shadows) ───────────────────────────────
         Flat UIs lose navigational cues. These tokens let floating
         surfaces (popovers, panels, detail rails) sit visibly above
         the base chrome without looking skeuomorphic. */
      boxShadow: {
        'elev-1': '0 1px 2px rgba(0,0,0,0.45), 0 1px 1px rgba(0,0,0,0.3)',
        'elev-2': '0 4px 10px rgba(0,0,0,0.48), 0 1px 2px rgba(0,0,0,0.35)',
        'elev-3': '0 10px 24px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.4)',
        'inner-hair': 'inset 0 0 0 1px rgba(210,220,238,0.04)',
        'focus-accent': '0 0 0 1px rgba(58,123,213,0.5), 0 0 0 3px rgba(58,123,213,0.18)',
      },

      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.25s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn: { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
      },
    },
  },
  plugins: [],
}
