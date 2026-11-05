"use client";

import { useEffect, useState } from "react";

const LIGHT = {
  surface: "#fcfcfb",
  primaryInk: "#0b0b0b",
  secondaryInk: "#52514e",
  mutedInk: "#898781",
  gridline: "#e1e0d9",
  baseline: "#c3c2b7",
  categorical: [
    "#2a78d6",
    "#eb6834",
    "#1baf7a",
    "#eda100",
    "#e87ba4",
    "#008300",
    "#4a3aa7",
    "#e34948",
  ],
};

const DARK = {
  surface: "#1a1a19",
  primaryInk: "#ffffff",
  secondaryInk: "#c3c2b7",
  mutedInk: "#898781",
  gridline: "#2c2c2a",
  baseline: "#383835",
  categorical: [
    "#3987e5",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#008300",
    "#9085e9",
    "#e66767",
  ],
};

export type ChartTheme = typeof LIGHT;

function resolveIsDark(mql: MediaQueryList): boolean {
  const override = document.documentElement.getAttribute("data-theme");
  if (override === "dark") return true;
  if (override === "light") return false;
  return mql.matches;
}

export function useChartTheme(): ChartTheme {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(resolveIsDark(mql));

    const mqlListener = () => setIsDark(resolveIsDark(mql));
    mql.addEventListener("change", mqlListener);

    const observer = new MutationObserver(mqlListener);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      mql.removeEventListener("change", mqlListener);
      observer.disconnect();
    };
  }, []);

  return isDark ? DARK : LIGHT;
}

/**
 * Folds series beyond the 8-slot categorical palette into "Other" so no
 * hue is ever reused (cycled palettes are never CVD-safe past slot 8).
 */
export function foldToOther(
  labels: string[],
  values: number[],
  cap = 8
): { labels: string[]; values: number[] } {
  if (labels.length <= cap) return { labels, values };

  const pairs = labels.map((label, i) => ({ label, value: values[i] }));
  pairs.sort((a, b) => b.value - a.value);

  const kept = pairs.slice(0, cap - 1);
  const rest = pairs.slice(cap - 1);
  const otherTotal = rest.reduce((sum, p) => sum + p.value, 0);

  return {
    labels: [...kept.map((p) => p.label), "Other"],
    values: [...kept.map((p) => p.value), otherTotal],
  };
}
