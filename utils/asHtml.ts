/**
 * Defensive coercion for v-html bindings on richtext fields. The publish +
 * preview pipelines BOTH route richtext through transformRichtextFields,
 * which produces a sanitized HTML string. If a code path ever bypasses
 * the transform and we receive a non-string (TipTap JSON object, locale
 * map fragment, undefined), this helper falls back to empty string
 * instead of letting Vue stringify-and-inject the JSON.
 *
 * NOT a sanitizer — that responsibility lives in transformRichtextFields
 * + sanitizeHtmlString. This is purely a "is it a string?" gate.
 */
export function asHtml(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
