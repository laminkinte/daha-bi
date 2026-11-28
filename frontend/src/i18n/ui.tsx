"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

/**
 * Interface translations, keyed by the English text itself (messages/ui/<locale>.json).
 *
 *   const tr = useT();
 *   tr("Save changes")                      -> "Enregistrer les modifications"
 *   tr("{count} charts", { count: 3 })      -> "3 graphiques"
 *
 * Anything without a translation falls back to the English text, so a missing entry never
 * breaks a screen. English needs no dictionary at all.
 */
export type UiDictionary = Record<string, string>;
export type UiVars = Record<string, string | number | null | undefined>;

const UiContext = createContext<{ locale: string; dict: UiDictionary }>({ locale: "en", dict: {} });

// For the few places that translate outside a component (class components, plain helpers).
// Set synchronously by the provider before any child renders.
const current: { dict: UiDictionary; locale: string } = { dict: {}, locale: "en" };

function remember(dict: UiDictionary, locale: string) {
  current.dict = dict;
  current.locale = locale;
}

function format(text: string, vars?: UiVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? whole : String(value);
  });
}

function lookup(dict: UiDictionary, text: string, vars?: UiVars): string {
  return format(dict[text] ?? text, vars);
}

export function UiTranslationsProvider({
  locale,
  dict,
  children,
}: {
  locale: string;
  dict: UiDictionary;
  children: ReactNode;
}) {
  // Has to happen before the children render (an effect would run after them), and the value
  // is the same on every render for the whole session (the language only changes via reload).
  remember(dict, locale);
  return <UiContext.Provider value={{ locale, dict }}>{children}</UiContext.Provider>;
}

/** Translate strings inside a component. Non-string values (numbers, undefined) pass through. */
export function useT() {
  const { dict } = useContext(UiContext);
  return useCallback(
    <T,>(text: T, vars?: UiVars): T extends string ? string : T =>
      (typeof text === "string" ? lookup(dict, text, vars) : text) as T extends string ? string : T,
    [dict],
  );
}

export function useUiLocale(): string {
  return useContext(UiContext).locale;
}

/** Translate outside React components. Prefer useT() inside components. */
export function translate<T>(text: T, vars?: UiVars): T extends string ? string : T {
  return (typeof text === "string" ? lookup(current.dict, text, vars) : text) as T extends string ? string : T;
}

/** BCP-47 tag for Intl formatting in the current interface language. */
export function uiLocaleTag(): string {
  return current.locale === "ar" ? "ar-u-nu-latn" : current.locale === "fr" ? "fr-FR" : "en-US";
}
