import bn from "./bn.json";
import en from "./en.json";

export type Locale = "en" | "bn";
export type Messages = typeof en;

const DICTIONARIES: Record<Locale, Messages> = {
  en,
  bn,
};

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale];
}
