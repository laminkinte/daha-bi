import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import worldTopology from "world-atlas/countries-110m.json";

export type CountryProperties = { name: string };

/**
 * Natural Earth 110m country boundaries (via the world-atlas npm package) — public-domain
 * cartographic data, bundled at build time so the map renders with no runtime network call and
 * no external tile server. 110m resolution keeps the bundle small; it's plenty of detail for a
 * dashboard-sized world choropleth.
 */
export const countryFeatures = (
  feature(
    worldTopology as unknown as Topology,
    (worldTopology as unknown as Topology).objects.countries as GeometryCollection
  ) as unknown as FeatureCollection<Geometry, CountryProperties>
).features;

/**
 * A user's dataset spells country names however their source system did ("USA", "Ivory Coast",
 * "DRC"...) while Natural Earth uses its own canonical short names. This maps common real-world
 * spellings — with an emphasis on African countries, given daha-bi's market — onto the exact
 * `name` property used by countryFeatures, so a region value matches its map polygon.
 */
const ALIASES: Record<string, string> = {
  "usa": "United States of America",
  "us": "United States of America",
  "united states": "United States of America",
  "uk": "United Kingdom",
  "great britain": "United Kingdom",
  "drc": "Dem. Rep. Congo",
  "dr congo": "Dem. Rep. Congo",
  "democratic republic of the congo": "Dem. Rep. Congo",
  "congo-kinshasa": "Dem. Rep. Congo",
  "republic of the congo": "Congo",
  "congo-brazzaville": "Congo",
  "ivory coast": "Côte d'Ivoire",
  "cote d'ivoire": "Côte d'Ivoire",
  "cote divoire": "Côte d'Ivoire",
  "swaziland": "eSwatini",
  "eswatini": "eSwatini",
  "cape verde": "Cabo Verde",
  "car": "Central African Rep.",
  "central african republic": "Central African Rep.",
  "south sudan": "S. Sudan",
  "western sahara": "W. Sahara",
  "equatorial guinea": "Eq. Guinea",
  "the gambia": "Gambia",
  "bosnia and herzegovina": "Bosnia and Herz.",
  "north macedonia": "Macedonia",
  "dominican republic": "Dominican Rep.",
  "czech republic": "Czechia",
  "myanmar (burma)": "Myanmar",
  "burma": "Myanmar",
  "russian federation": "Russia",
  "south korea": "South Korea",
  "republic of korea": "South Korea",
  "north korea": "North Korea",
  "uae": "United Arab Emirates",
  "tanzania, united republic of": "Tanzania",
  "slovakia (slovak republic)": "Slovakia",
  "libyan arab jamahiriya": "Libya",
  "lao people's democratic republic": "Laos",
  "brunei darussalam": "Brunei",
  "syrian arab republic": "Syria",
  "palestinian territory": "Palestine",
  "korea, republic of": "South Korea",
  "korea, democratic people's republic of": "North Korea",
  "viet nam": "Vietnam",
  "iran, islamic republic of": "Iran",
  "moldova, republic of": "Moldova",
};

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[.,]/g, "");
}

const NAME_LOOKUP = new Map<string, string>();
countryFeatures.forEach((f) => NAME_LOOKUP.set(normalize(f.properties.name), f.properties.name));
Object.entries(ALIASES).forEach(([alias, canonical]) => NAME_LOOKUP.set(normalize(alias), canonical));

/** Resolves a free-text region value from a dataset to the canonical map feature name, or null. */
export function resolveCountryName(value: string): string | null {
  return NAME_LOOKUP.get(normalize(value)) ?? null;
}
