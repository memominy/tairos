/**
 * Canonical operator codes used by both the frontend (scoping nodes,
 * filtering the map) and — later — the FastAPI backend (storing the
 * operator column on every inventory row).
 *
 * Keep this list flat and dumb: no display strings, no colours, no
 * flags. UI-level metadata lives in apps/web's config/operators.js and
 * is looked up by code. Backend similarly maps codes to its own i18n.
 *
 * Additions to this list are the contract for backend migrations —
 * every new code must be migrated-in before the UI starts emitting it,
 * otherwise the backend rejects the row.
 */
export const OPERATOR_CODES = Object.freeze([
  'TR',  // Türkiye
  'US',  // United States
  'RU',  // Russia
  'CN',  // China
  'IL',  // Israel
  'IR',  // Iran
  'UK',  // United Kingdom
  'FR',  // France
  'DE',  // Germany
  'IN',  // India
  'PK',  // Pakistan
  'KR',  // South Korea
  'KP',  // North Korea
  'JP',  // Japan
  'SA',  // Saudi Arabia
  'AE',  // UAE
  'EG',  // Egypt
  'UA',  // Ukraine
  'PL',  // Poland
  'GR',  // Greece
  'AZ',  // Azerbaijan
  'SY',  // Syria
])

/** Legacy TR-only migration marker — anything seeded before operator-scoping. */
export const LEGACY_MIGRATION_TAG = 'tr-migration-v1'
