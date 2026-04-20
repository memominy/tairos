import React from 'react'
import { Sparkles } from 'lucide-react'

/**
 * Henüz gerçek içeriği yazılmamış paneller için ortak "yapım aşamasında"
 * kartı. Panel kayıt (panels.js) tarafına `placeholder: true` konduğunda
 * PanelHost burayı render eder.
 *
 * Amaç — operatöre 3 şey göstermek:
 *   1. Panel var ve yakında gelecek (boş yüzey göstermemek),
 *   2. Neler yapacak (planlanan feature listesi),
 *   3. Diğer panellerle nasıl bağlanacak (kısa ipucu).
 *
 * Proplar:
 *   icon      — lucide bileşeni (opsiyonel; Sparkles default)
 *   title     — panel başlığı
 *   subtitle  — tek satır açıklama
 *   features  — planlanan özelliklerin string dizisi
 *   related   — ilgili panellerin id listesi (bilgilendirme amaçlı)
 */
export default function PanelStub({
  icon: Icon = Sparkles,
  title,
  subtitle,
  features = [],
  related = [],
}) {
  return (
    <div className="p-5 space-y-4 text-ops-300">
      {/* Başlık */}
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="shrink-0 w-9 h-9 rounded bg-accent/15 flex items-center justify-center">
            <Icon size={18} className="text-accent" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-xs font-mono uppercase tracking-wider text-ops-100">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] text-ops-400 mt-0.5 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Durum kartı */}
      <div className="border border-ops-700 bg-ops-800/50 rounded px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5 text-accent uppercase font-mono tracking-wider text-[10px]">
          <span className="inline-block w-1.5 h-1.5 bg-accent rounded-full pulse-ring" />
          Yapım aşamasında
        </div>
        <p className="text-[11px] text-ops-300 leading-relaxed">
          Mimari kayıtlı — içerik ilerleyen fazlarda inşa edilecek.
          Aynı sol-raf çerçevesini kullanır; genişlik ayarın burada da geçerli.
        </p>
      </div>

      {/* Planlanan özellikler */}
      {features.length > 0 && (
        <div>
          <div className="text-[10px] uppercase font-mono text-ops-500 tracking-wider mb-2">
            Planlanan
          </div>
          <ul className="space-y-1.5">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <span className="text-accent mt-0.5 shrink-0">›</span>
                <span className="text-ops-300">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* İlgili paneller */}
      {related.length > 0 && (
        <div className="pt-2 border-t border-ops-700/60">
          <div className="text-[10px] uppercase font-mono text-ops-500 tracking-wider mb-1.5">
            İlgili paneller
          </div>
          <div className="flex flex-wrap gap-1">
            {related.map((id) => (
              <span
                key={id}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-ops-700 text-ops-400"
              >
                {id}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
