/**
 * Barrel for @tairos/shared. Keep imports explicit — consumers can
 * tree-shake per-file via the `exports` map in package.json if they
 * prefer `@tairos/shared/operators` over the barrel.
 */
export { OPERATOR_CODES, LEGACY_MIGRATION_TAG } from './operators.js'
export { REGIONS, REGION_LABELS }               from './regions.js'
