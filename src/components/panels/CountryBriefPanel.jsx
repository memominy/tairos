import React from 'react'
import { Target, Users, Flame, AlertCircle, MapPin, X, Layers, Eye, EyeOff } from 'lucide-react'
import useStore from '../../store/useStore'
import { getCountry, rivalsOf, conflictIdsOf } from '../../config/countries'
import { inventoryOf } from '../../config/countryInventory'
import { criticalSitesOf } from '../../config/countryCriticalSites'
import conflicts from '../../data/conflicts.json'
import { Section } from './_shared'

/**
 * CountryBriefPanel ("Durum")
 *
 * Ülke odağı açıkken görünen ilk/varsayılan panel. "O ülke hakkında ilk
 * bakışta bilinmesi gerekenler" — özet rakamlar + hızlı navigasyon
 * kartları (envanter / kritik / rakipler). Operatör-bağımsız: hangi
 * operatör oynuyor olursa olsun, içerik odak ülkenin kendi verisidir.
 *
 * Bu panel bir "hub"dır — asıl içerikler (envanter, kritik, rakipler)
 * ayrı panellerde. Durum sadece kısa özet verir ve kullanıcıyı uygun
 * panele yönlendirir.
 */
export default function CountryBriefPanel() {
  const focusCountry    = useStore((s) => s.focusCountry)
  const exitCountryFocus = useStore((s) => s.exitCountryFocus)
  const setActivePanel  = useStore((s) => s.setActivePanel)
  const enterConflictFocus = useStore((s) => s.enterConflictFocus)
  const view            = useStore((s) => s.countryFocusView)
  const toggleView      = useStore((s) => s.setCountryFocusViewToggle)

  if (!focusCountry) {
    return (
      <div className="p-5 text-[11px] text-ops-500 font-mono leading-relaxed">
        Ülke odağı aktif değil. Haritadan bir ülke seç veya Ctrl+K ile ara.
      </div>
    )
  }

  const meta        = getCountry(focusCountry)
  const inv         = inventoryOf(focusCountry)
  const sites       = criticalSitesOf(focusCountry)
  const rivals      = rivalsOf(focusCountry)
  const conflictIds = conflictIdsOf(focusCountry)
  const activeConflicts = conflicts.filter((c) => conflictIds.includes(c.id))

  return (
    <div className="flex-1 overflow-y-auto">
      {/* ── Ülke başlığı ─────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 border-b border-ops-700/70 bg-ops-900/30 flex items-center gap-2">
        <span className="text-2xl leading-none">{meta.flag}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ops-500">
            Ülke Odağı
          </div>
          <div className="text-sm font-semibold text-ops-100 truncate">
            {meta.label}
          </div>
        </div>
        <button
          onClick={exitCountryFocus}
          className="shrink-0 px-1.5 py-1 rounded border border-ops-600 text-ops-400 hover:text-red-400 hover:border-red-400/50 transition-colors"
          title="Ülke odağından çık"
        >
          <X size={12} />
        </button>
      </div>

      {/* ── Harita katmanları — ülke odağı çizim toggle'ları ── */}
      <Section icon={Layers} title="Harita Katmanları" defaultOpen>
        <div className="px-3 space-y-1">
          <LayerToggle
            active={view.outline}
            onClick={() => toggleView('outline')}
            label="Ülke sınır çerçevesi"
            subtitle="Kesikli accent kutusu"
          />
          <LayerToggle
            active={view.ownSites}
            onClick={() => toggleView('ownSites')}
            label="Kendi kritik tesislerim"
            subtitle={`${sites.length} konum · accent halka`}
            dot="#D85A30"
          />
          <LayerToggle
            active={view.rivalSites}
            onClick={() => toggleView('rivalSites')}
            label="Rakip kritik tesisler"
            subtitle={`${rivals.length} rakip ülke · kırmızı halka`}
            dot="#EF4444"
          />
          <LayerToggle
            active={view.rivalFlag}
            onClick={() => toggleView('rivalFlag')}
            label="Rakip bayrak etiketleri"
            subtitle="Rakip ülke merkezlerine yerleşir"
          />
        </div>
      </Section>

      {/* ── Özet rakamlar ────────────────────────────────── */}
      <Section icon={Users} title="Personel" defaultOpen>
        <div className="px-3">
          {inv?.summary ? (
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded border border-ops-700 bg-ops-800/40 px-2 py-1.5">
                <div className="text-[9px] font-mono uppercase tracking-wider text-ops-500">Aktif</div>
                <div className="text-sm font-mono text-ops-100">{fmt(inv.summary.active)}</div>
              </div>
              <div className="rounded border border-ops-700 bg-ops-800/40 px-2 py-1.5">
                <div className="text-[9px] font-mono uppercase tracking-wider text-ops-500">İhtiyat</div>
                <div className="text-sm font-mono text-ops-100">{fmt(inv.summary.reserve)}</div>
              </div>
              <div className="rounded border border-ops-700 bg-ops-800/40 px-2 py-1.5">
                <div className="text-[9px] font-mono uppercase tracking-wider text-ops-500">Paramiliter</div>
                <div className="text-sm font-mono text-ops-100">
                  {inv.summary.paramilitary ? fmt(inv.summary.paramilitary) : '—'}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-ops-600 italic leading-snug">
              {meta.label} için envanter seed'i henüz eklenmedi.
              <br />
              <span className="text-ops-500">config/countryInventory.js</span>
            </div>
          )}
        </div>
      </Section>

      {/* ── Hızlı sayı kartları (panel geçişi) ──────────── */}
      <Section icon={Target} title="Hızlı Görünüm" defaultOpen>
        <div className="px-3 grid grid-cols-1 gap-1.5">
          <button
            onClick={() => setActivePanel('country-inventory')}
            className="flex items-center gap-2 px-2.5 py-2 rounded border border-ops-700 hover:border-accent/50 hover:bg-accent/5 transition-all text-left"
          >
            <span className="shrink-0 w-7 h-7 rounded bg-accent/10 border border-accent/30 flex items-center justify-center text-accent text-[10px] font-mono">
              {inv ? branchCount(inv) : 0}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-ops-100 font-medium">Envanter</div>
              <div className="text-[10px] text-ops-500 font-mono truncate">
                Hava · Deniz · Kara · Hava Savunma
              </div>
            </div>
            <span className="text-ops-500 text-xs">›</span>
          </button>

          <button
            onClick={() => setActivePanel('country-critical')}
            className="flex items-center gap-2 px-2.5 py-2 rounded border border-ops-700 hover:border-red-400/50 hover:bg-red-400/5 transition-all text-left"
          >
            <span className="shrink-0 w-7 h-7 rounded bg-red-400/10 border border-red-400/30 flex items-center justify-center text-red-400 text-[10px] font-mono">
              {sites.length}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-ops-100 font-medium">Kritik Tesisler</div>
              <div className="text-[10px] text-ops-500 font-mono truncate">
                Başkent · Nükleer · Üsler
              </div>
            </div>
            <span className="text-ops-500 text-xs">›</span>
          </button>

          <button
            onClick={() => setActivePanel('country-rivals')}
            className="flex items-center gap-2 px-2.5 py-2 rounded border border-ops-700 hover:border-yellow-400/50 hover:bg-yellow-400/5 transition-all text-left"
          >
            <span className="shrink-0 w-7 h-7 rounded bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center text-yellow-400 text-[10px] font-mono">
              {rivals.length}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-ops-100 font-medium">Rakipler & Çatışmalar</div>
              <div className="text-[10px] text-ops-500 font-mono truncate">
                {activeConflicts.length} aktif çatışma
              </div>
            </div>
            <span className="text-ops-500 text-xs">›</span>
          </button>
        </div>
      </Section>

      {/* ── Aktif çatışmalar — doğrudan conflict focus'a gir ── */}
      {activeConflicts.length > 0 && (
        <Section icon={Flame} title="Dahil Olduğu Çatışmalar" badge={activeConflicts.length} defaultOpen>
          <div className="px-3 space-y-1">
            {activeConflicts.map((c) => (
              <button
                key={c.id}
                onClick={() => enterConflictFocus(c)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded border border-ops-700 hover:border-red-400/50 hover:bg-red-400/5 transition-all text-left group"
                title="Tıkla → çatışma odağına gir"
              >
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="flex-1 text-xs text-ops-200 truncate group-hover:text-ops-50">
                  {c.shortName || c.name}
                </span>
                <span className="shrink-0 text-[9px] font-mono text-ops-500 uppercase">
                  {c.status || 'active'}
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* ── Kısa açıklama ────────────────────────────────── */}
      <div className="px-3 py-3 text-[10px] font-mono text-ops-500 leading-relaxed border-t border-ops-700/40">
        {meta.region === 'me'       && 'Orta Doğu — bölge gerilimlerine hassas'}
        {meta.region === 'europe'   && 'Avrupa — NATO/AB çevresi'}
        {meta.region === 'asia'     && 'Asya — Indo-Pasifik dinamikleri'}
        {meta.region === 'americas' && 'Amerika — küresel erişim'}
        {meta.region === 'africa'   && 'Afrika — iç istikrarsızlık bağlamı'}
        {meta.region === 'oceania'  && 'Okyanusya — ada devleti dinamikleri'}
      </div>
    </div>
  )
}

/* ── helpers ──────────────────────────────────── */
/**
 * Harita katman toggle satırı — sol göz ikonu, sağda "aktif" durumu
 * renkli nokta (ownSites/rivalSites için). Tek tıkla store'daki
 * countryFocusView.<key> flip olur, CountryFocusLayer anında yeniden
 * çizer.
 */
function LayerToggle({ active, onClick, label, subtitle, dot }) {
  const Icon = active ? Eye : EyeOff
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border transition-all text-left ${
        active
          ? 'border-ops-600 bg-ops-800/40 text-ops-100 hover:border-accent/40'
          : 'border-ops-700 bg-ops-900/30 text-ops-500 hover:text-ops-300'
      }`}
    >
      <Icon size={13} className={active ? 'text-accent' : 'text-ops-600'} />
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] font-medium truncate">{label}</span>
        <span className="block text-[9px] font-mono text-ops-500 truncate">{subtitle}</span>
      </span>
      {dot && (
        <span
          className="shrink-0 w-2 h-2 rounded-full"
          style={{ background: active ? dot : '#334155' }}
        />
      )}
    </button>
  )
}

function fmt(n) {
  if (typeof n !== 'number') return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1000)      return (n / 1000).toFixed(0) + 'K'
  return String(n)
}

function branchCount(inv) {
  if (!inv?.branches) return 0
  return Object.values(inv.branches).reduce((t, b) => t + (b.items?.length || 0), 0)
}
