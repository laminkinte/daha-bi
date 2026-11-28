"use client";

import { useMemo, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer } from "react-leaflet";
import type { GeoJSON as LeafletGeoJSON, Layer, Path, StyleFunction } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import "leaflet/dist/leaflet.css";
import { countryFeatures, resolveCountryName, type CountryProperties } from "@/lib/geo-countries";
import { formatValue } from "@/lib/format-value";
import type { Chart } from "@/lib/api";
import { useT } from "@/i18n/ui";

/**
 * Same sequential ramp as the rest of the app's choropleths (see ChartRenderer.tsx) — kept as its
 * own copy here since this file is loaded via next/dynamic(..., { ssr: false }) and must not pull
 * in anything that would drag Leaflet into the server bundle.
 */
const SEQUENTIAL_LIGHT = ["#cde2fb", "#9ec5f4", "#6da7ec", "#2a78d6", "#1c5cab", "#0d366b"];
const SEQUENTIAL_DARK = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"];

function sequentialColor(t: number, isDark: boolean): string {
  const steps = isDark ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT;
  const index = Math.round(Math.max(0, Math.min(1, t)) * (steps.length - 1));
  return steps[index];
}

const NO_DATA_FILL_LIGHT = "#c3c2b7";
const NO_DATA_FILL_DARK = "#383835";

export default function PowerMapChart({
  labels,
  values,
  isDark,
  format,
  currency,
  onDrillDown,
}: {
  labels: string[];
  values: number[];
  isDark: boolean;
  format: Chart["config"]["format"];
  currency: Chart["config"]["currency"];
  onDrillDown?: (value: string) => void;
}) {
  const tr = useT();
  const geoRef = useRef<LeafletGeoJSON>(null);

  const { valueByCountry, originalLabelByCountry, min, max, range } = useMemo(() => {
    const byCountry = new Map<string, number>();
    const originalByCountry = new Map<string, string>();
    labels.forEach((label, i) => {
      const canonical = resolveCountryName(label);
      if (canonical) {
        byCountry.set(canonical, (byCountry.get(canonical) ?? 0) + values[i]);
        if (!originalByCountry.has(canonical)) originalByCountry.set(canonical, label);
      }
    });

    const allValues = Array.from(byCountry.values());
    const lo = allValues.length ? Math.min(...allValues) : 0;
    const hi = allValues.length ? Math.max(...allValues) : 0;

    return { valueByCountry: byCountry, originalLabelByCountry: originalByCountry, min: lo, max: hi, range: hi - lo || 1 };
  }, [labels, values]);

  const matchedCount = valueByCountry.size;
  const noDataFill = isDark ? NO_DATA_FILL_DARK : NO_DATA_FILL_LIGHT;
  const borderColor = isDark ? "#121a1c" : "#ffffff";

  const featureStyle: StyleFunction<CountryProperties> = (feature) => {
    const value = feature ? valueByCountry.get(feature.properties.name) : undefined;
    const t = value !== undefined ? (value - min) / range : 0;
    return {
      fillColor: value !== undefined ? sequentialColor(t, isDark) : noDataFill,
      fillOpacity: value !== undefined ? 0.85 : 0.45,
      color: borderColor,
      weight: 0.6,
    };
  };

  function onEachFeature(feature: Feature<Geometry, CountryProperties>, layer: Layer) {
    const name = feature.properties.name;
    const value = valueByCountry.get(name);
    const path = layer as Path;

    layer.bindTooltip(
      `<strong>${name}</strong><br/>${value !== undefined ? formatValue(value, format, currency) : tr("No data")}`,
      { sticky: true, className: "power-map-tooltip" }
    );

    layer.on({
      mouseover: () => path.setStyle({ weight: 2, color: isDark ? "#ffffff" : "#0b0b0b" }),
      mouseout: () => path.setStyle(featureStyle(feature)),
      click: () => {
        const original = originalLabelByCountry.get(name);
        if (original) onDrillDown?.(original);
        if (value !== undefined) path.setStyle({ weight: 2, color: isDark ? "#ffffff" : "#0b0b0b" });
      },
    });

    if (value !== undefined && onDrillDown) {
      (path.getElement() as SVGElement | undefined)?.style.setProperty("cursor", "pointer");
    }
  }

  const dataKey = `${isDark ? "d" : "l"}:${labels.join(",")}:${values.join(",")}`;
  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
      <MapContainer
        center={[12, 15]}
        zoom={2}
        minZoom={1}
        maxZoom={7}
        worldCopyJump
        scrollWheelZoom
        className="h-full w-full"
        style={{ background: isDark ? "#0d0d0d" : "#eef3f8" }}
      >
        <TileLayer
          url={tileUrl}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <GeoJSONLayer
          key={dataKey}
          ref={geoRef}
          data={{ type: "FeatureCollection", features: countryFeatures } as FeatureCollection}
          style={featureStyle as StyleFunction}
          onEachFeature={onEachFeature as (feature: Feature, layer: Layer) => void}
        />
      </MapContainer>

      {matchedCount > 0 && (
        <div className="pointer-events-none absolute bottom-2 start-2 z-[1000] flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs shadow-md" style={{ background: isDark ? "#121a1c" : "#ffffff", borderColor: isDark ? "#223033" : "#e3e8e9", color: isDark ? "#c3c2b7" : "#52514e" }}>
          <span className="tabular-nums">{formatValue(min, format, currency)}</span>
          <div
            className="h-2 w-20 rounded-full"
            style={{ background: `linear-gradient(to right, ${(isDark ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT).join(", ")})` }}
          />
          <span className="tabular-nums">{formatValue(max, format, currency)}</span>
        </div>
      )}
      {labels.length > 0 && matchedCount === 0 && (
        <div
          className="pointer-events-none absolute bottom-2 start-2 z-[1000] rounded-md border px-2.5 py-1.5 text-xs shadow-md"
          style={{ background: isDark ? "#121a1c" : "#ffffff", borderColor: isDark ? "#223033" : "#e3e8e9", color: isDark ? "#898781" : "#898781" }}
        >
          {tr("None of the region values matched a recognized country name.")}
        </div>
      )}
    </div>
  );
}
