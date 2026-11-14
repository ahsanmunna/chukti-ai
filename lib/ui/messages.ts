import { type Locale, getMessages } from "@/lib/i18n";

/**
 * Maps an upload error code to its localized user-facing message.
 * Always returns a localized dictionary message; unknown codes map to the generic fallback.
 * Never exposes raw error codes or raw server error text.
 */
export function getUploadErrorMessage(
  code: string | null | undefined,
  locale: Locale,
): string {
  const dict = getMessages(locale).documentPane.errorCodes;
  if (code && Object.prototype.hasOwnProperty.call(dict, code)) {
    return dict[code as keyof typeof dict];
  }
  return dict.unknown;
}

/**
 * Maps a playbook field path to its localized validation error message.
 * Keyed by field path; any unmapped field falls back to the localized fallback message.
 * Never exposes schema details or server error text.
 */
export function getPlaybookFieldErrorMessage(
  fieldPath: string | null | undefined,
  locale: Locale,
): string {
  const dict = getMessages(locale).playbookPane.fieldErrors;
  if (fieldPath && Object.prototype.hasOwnProperty.call(dict, fieldPath)) {
    return dict[fieldPath as keyof typeof dict];
  }
  return dict.fallback;
}

/**
 * Maps an extraction error code to its localized user-facing message.
 * Always returns a localized dictionary message; unknown codes map to generic fallback.
 * Never exposes raw error codes or raw server error text.
 */
export function getExtractionErrorMessage(
  code: string | null | undefined,
  locale: Locale,
): string {
  const dict = getMessages(locale).clausesPane.errorCodes;
  if (code && Object.prototype.hasOwnProperty.call(dict, code)) {
    return dict[code as keyof typeof dict];
  }
  return dict.unknown;
}
