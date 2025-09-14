import fs from "fs/promises";
import path from "path";
import {
  remapVersionId,
  pick,
  translateCountryNameToGerman,
} from "./helpers/helperFunctions.js";
import { assignSortIdsByGermanName } from "./helpers/sortingId.js";
import { PICK_FIELDS, PREFERREDCOUNTRIES } from "./helpers/constantsHelper.js";

const INPUT_ALL_CARDS = path.join("db", "core-data", "all-cards.json");
const INPUT_COUNTRY_DATA = path.join(
  "db",
  "core-data",
  "manager-fetched-data.json"
);
const INDEX_DIR = path.join("db", "index-data");
const INDEX_FILE = path.join(INDEX_DIR, "countriesIndex.json");
const OUT_DIR = path.join("db", "countries");
const OUT_DIR_ALL = path.join(OUT_DIR, "countries-all");
const OUT_DIR_NO_BASE = path.join(OUT_DIR, "countries-nobase");
const OUT_DIR_ONLY_BEST = path.join(OUT_DIR, "countries-onlybest");

const BASE_VERSION_IDS = new Set([
  "2000",
  "2001",
  "2002",
  "3000",
  "3001",
  "3002",
]);

async function loadCountriesMeta() {
  const raw = await fs.readFile(INPUT_COUNTRY_DATA, "utf8");
  const data = JSON.parse(raw);

  if (
    !data ||
    typeof data !== "object" ||
    !data.countries ||
    typeof data.countries !== "object"
  ) {
    throw new Error(
      "manager-fetched-data.json structure error { countries: { ... } }"
    );
  }

  const result = new Map();
  for (const meta of data.countries) {
    const name = meta?.name ?? null;
    const abbrName = meta?.abbrName ?? null;
    const id = meta?.id ?? null;
    result.set(String(id), { name, abbrName });
  }
  return result;
}

async function main() {
  console.log("starting country file generation");
  console.time("genCountryFiles");

  for (const dir of [
    OUT_DIR,
    OUT_DIR_ALL,
    OUT_DIR_NO_BASE,
    OUT_DIR_ONLY_BEST,
  ]) {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
  }

  const raw = await fs.readFile(INPUT_ALL_CARDS, "utf8");
  const cards = JSON.parse(raw);
  if (!Array.isArray(cards)) throw new Error("Invalid all-cards.json");

  const countryMeta = await loadCountriesMeta();

  const countryMapAll = new Map();
  const countryMapOnlyBest = new Map();

  for (const card of cards) {
    if (!card) continue;

    const countryId = String(card.countryId ?? "");
    const assetId = String(card.assetId ?? "");
    const resourceId = String(card.resourceId ?? "");
    const originalVersionId = String(card.versionId ?? "");
    const effectiveVersionId = remapVersionId(originalVersionId, card.rating);
    const rating = Number(card.rating ?? 0);

    if (!countryId || !assetId || !resourceId || !effectiveVersionId) continue;

    const entry = {
      name: card.name,
      cardName: card.cardName,
      originalVersionId,
      ...pick(card, PICK_FIELDS),
    };
    entry.versionId = effectiveVersionId;

    if (!countryMapAll.has(countryId)) countryMapAll.set(countryId, {});
    countryMapAll.get(countryId)[resourceId] = entry;

    if (!countryMapOnlyBest.has(countryId))
      countryMapOnlyBest.set(countryId, new Map());
    const perAsset = countryMapOnlyBest.get(countryId);
    const slot = perAsset.get(assetId);

    if (!slot || rating > slot.maxRating) {
      perAsset.set(assetId, {
        maxRating: rating,
        entries: { [resourceId]: entry },
      });
    } else if (rating === slot.maxRating) {
      slot.entries[resourceId] = entry;
    }
  }

  let writtenAll = 0;
  let writtenNoBase = 0;
  let writtenOnlyBest = 0;

  const countriesCounts = {};

  for (const [countryId, mappingAll] of countryMapAll.entries()) {
    // mapping all cards
    const fileAll = path.join(OUT_DIR_ALL, `${countryId}.json`);
    await fs.writeFile(fileAll, JSON.stringify(mappingAll, null, 2), "utf8");
    writtenAll++;

    // mapping all cards without base cards
    const mappingNoBase = {};
    for (const [resourceId, entry] of Object.entries(mappingAll)) {
      const vId = String(entry.versionId ?? "");
      if (!BASE_VERSION_IDS.has(vId)) {
        mappingNoBase[resourceId] = entry;
      }
    }
    const fileNoBase = path.join(OUT_DIR_NO_BASE, `${countryId}.json`);
    await fs.writeFile(
      fileNoBase,
      JSON.stringify(mappingNoBase, null, 2),
      "utf8"
    );
    writtenNoBase++;

    // mapping only the best card from the players
    const perAsset = countryMapOnlyBest.get(countryId) ?? new Map();
    const mappingOnlyBest = {};
    for (const { entries } of perAsset.values()) {
      for (const [resourceId, entry] of Object.entries(entries)) {
        mappingOnlyBest[resourceId] = entry;
      }
    }
    const fileOnlyBest = path.join(OUT_DIR_ONLY_BEST, `${countryId}.json`);
    await fs.writeFile(
      fileOnlyBest,
      JSON.stringify(mappingOnlyBest, null, 2),
      "utf8"
    );
    writtenOnlyBest++;

    // meta daten
    const meta = countryMeta.get(countryId) ?? {};

    const enName = meta?.name ?? null;
    const abbrName = meta?.abbrName ?? null;
    const deName = enName ? translateCountryNameToGerman(enName) : null;

    countriesCounts[countryId] = {
      c: {
        all: Object.keys(mappingAll).length,
        nobase: Object.keys(mappingNoBase).length,
        onlybest: Object.keys(mappingOnlyBest).length,
      },
      name: enName,
      aName: abbrName,
      deName: deName,
    };
  }

  const countriesCountsWithSort = assignSortIdsByGermanName(
    countriesCounts,
    PREFERREDCOUNTRIES
  );

  const ids = Object.keys(countriesCountsWithSort).sort(
    (a, b) => Number(a) - Number(b)
  );

  const indexPayload = {
    totalCountries: ids.length,
    countries: Object.fromEntries(
      ids.map((id) => [id, countriesCountsWithSort[id]])
    ),
  };

  await fs.writeFile(INDEX_FILE, JSON.stringify(indexPayload, null, 2), "utf8");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
