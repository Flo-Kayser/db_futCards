// scripts/build-countries-index.js
import fs from "fs/promises";
import path from "path";
import {
  remapVersionId,
  pick,
  translateCountryNameToGerman,
} from "./helpers/helperFunctions.js";
import { assignSortIdsByGermanName } from "./helpers/sortingId.js";
import { PICK_FIELDS, PREFERREDCOUNTRIES,BASE_VERSION_IDS } from "./helpers/constantsHelper.js";

const INPUT_ALL_CARDS   = path.join("db", "core-data", "all-cards.json");
const INPUT_COUNTRYDATA = path.join("db", "core-data", "manager-fetched-data.json");
const INDEX_DIR         = path.join("db", "index-data");
const INDEX_FILE        = path.join(INDEX_DIR, "countriesIndex.json");
const OUT_DIR           = path.join("db", "countries");
const OUT_ALL           = path.join(OUT_DIR, "countries-all");
const OUT_NOBASE        = path.join(OUT_DIR, "countries-noBase");
const OUT_ONLYBEST      = path.join(OUT_DIR, "countries-onlyBest");
const OUT_ONLYBESTSPEC  = path.join(OUT_DIR, "countries-onlyBestSpecial");


async function loadCountriesMeta() {
  const data = JSON.parse(await fs.readFile(INPUT_COUNTRYDATA, "utf8"));
  if (!Array.isArray(data?.countries)) {
    throw new Error("manager-fetched-data.json muss { countries: [...] } enthalten");
  }
  const map = new Map();
  for (const c of data.countries) {
    map.set(String(c.id), { name: c?.name ?? null, abbrName: c?.abbrName ?? null });
  }
  return map;
}

async function main() {
  console.log("starting country file generation");
  console.time("genCountryFiles");

  // Ausgabeverzeichnisse leeren/erstellen
  for (const d of [OUT_DIR, OUT_ALL, OUT_NOBASE, OUT_ONLYBEST, OUT_ONLYBESTSPEC]) {
    await fs.rm(d, { recursive: true, force: true });
    await fs.mkdir(d, { recursive: true });
  }

  const cards = JSON.parse(await fs.readFile(INPUT_ALL_CARDS, "utf8"));
  if (!Array.isArray(cards)) throw new Error("Invalid all-cards.json");

  const countryMeta = await loadCountriesMeta();

  const countryAll  = new Map(); // countryId -> {resourceId: entry}
  const countryBest = new Map(); // countryId -> Map<assetId, {maxRating, entries}>

  for (const c of cards) {
    if (!c) continue;

    const countryId = String(c.countryId ?? "");
    const assetId   = String(c.assetId ?? "");
    const rid       = String(c.resourceId ?? "");
    const vIdOrig   = String(c.versionId ?? "");
    const vId       = remapVersionId(vIdOrig, c.rating);
    const rating    = Number(c.rating ?? 0);

    if (!countryId || !assetId || !rid || !vId) continue;

    const entry = {
      name: c.name,
      cardName: c.cardName,
      originalVersionId: vIdOrig,
      ...pick(c, PICK_FIELDS),
      versionId: vId,
    };

    if (!countryAll.has(countryId)) countryAll.set(countryId, {});
    countryAll.get(countryId)[rid] = entry;

    if (!countryBest.has(countryId)) countryBest.set(countryId, new Map());
    const perAsset = countryBest.get(countryId);
    const slot = perAsset.get(assetId);

    if (!slot) {
      perAsset.set(assetId, { maxRating: rating, entries: { [rid]: entry } });
    } else if (rating > slot.maxRating) {
      perAsset.set(assetId, { maxRating: rating, entries: { [rid]: entry } });
    } else if (rating === slot.maxRating) {
      slot.entries[rid] = entry;
    }
  }

  const countriesCounts = {};

  for (const [cid, allMap] of countryAll) {
    // all
    await fs.writeFile(path.join(OUT_ALL, `${cid}.json`),
      JSON.stringify(allMap, null, 2), "utf8");

    // noBase
    const noBase = Object.fromEntries(
      Object.entries(allMap).filter(([_, e]) => !BASE_VERSION_IDS.has(String(e.versionId)))
    );
    await fs.writeFile(path.join(OUT_NOBASE, `${cid}.json`),
      JSON.stringify(noBase, null, 2), "utf8");

    // onlyBest & onlyBestSpecial
    const onlyBest        = {};
    const onlyBestSpecial = {};
    const perAsset = countryBest.get(cid) ?? new Map();

    for (const { entries } of perAsset.values()) {
      for (const [rid, e] of Object.entries(entries)) {
        onlyBest[rid] = e;
        // ➜ onlyBestSpecial: beste Karte **und** ihre eigene Version ist KEINE Base-Version
        if (!BASE_VERSION_IDS.has(String(e.versionId))) {
          onlyBestSpecial[rid] = e;
        }
      }
    }

    await fs.writeFile(path.join(OUT_ONLYBEST, `${cid}.json`),
      JSON.stringify(onlyBest, null, 2), "utf8");
    await fs.writeFile(path.join(OUT_ONLYBESTSPEC, `${cid}.json`),
      JSON.stringify(onlyBestSpecial, null, 2), "utf8");

    // Meta
    const meta = countryMeta.get(cid) ?? {};
    const enName = meta.name ?? null;
    const deName = enName ? translateCountryNameToGerman(enName) : null;

    countriesCounts[cid] = {
      c: {
        all: Object.keys(allMap).length,
        nobase: Object.keys(noBase).length,
        onlybest: Object.keys(onlyBest).length,
        onlybestSpecial: Object.keys(onlyBestSpecial).length,
      },
      name: enName,
      aName: meta.abbrName ?? null,
      deName,
    };
  }

  const sorted = assignSortIdsByGermanName(countriesCounts, PREFERREDCOUNTRIES);
  const ids = Object.keys(sorted).sort((a, b) => Number(a) - Number(b));

  await fs.writeFile(
    INDEX_FILE,
    JSON.stringify({
      totalCountries: ids.length,
      countries: Object.fromEntries(ids.map((id) => [id, sorted[id]])),
    }, null, 2),
    "utf8"
  );

  console.timeEnd("genCountryFiles");
  console.log(`✔ countriesIndex.json geschrieben (${ids.length} Länder)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
