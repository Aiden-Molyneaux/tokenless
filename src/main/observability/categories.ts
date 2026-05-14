// Categories are re-exported from the shared module so main code can import
// them locally without crossing the shared/main boundary in every file.
// The canonical source of truth is src/shared/observability.ts.

export { CATEGORIES, isCategory, type Category } from '@shared/observability'
