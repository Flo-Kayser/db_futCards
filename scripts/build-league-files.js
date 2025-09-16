// scripts/build-leagues-index.js
import fs from "fs/promises";
import path from "path";
import { remapVersionId, pick } from "./helpers/helperFunctions.js";
import { PICK_FIELDS, BASE_VERSION_IDS, COUNTRYID_FOR_LEAGUEID } from "./helpers/constantsHelper.js";

const INPUT_ALL_CARDS = path.join("db", "core-data", "all-cards.json");
const INPUT_MANAGERDATA = path.join("db", "core-data", "manager-fetched-data.json");
const INDEX_DIR  = path.join("db", "index-data");
const INDEX_FILE = path.join(INDEX_DIR, "leaguesIndex.json");
const OUT_DIR    = path.join("db", "leagues");
const OUT_ALL    = path.join(OUT_DIR, "leagues-all");
const OUT_NOBASE = path.join(OUT_DIR, "leagues-noBase");
const OUT_ONLYBEST     = path.join(OUT_DIR, "leagues-onlyBest");
const OUT_ONLYBESTSPEC = path.join(OUT_DIR, "leagues-onlyBestSpecial");

// Lese League-Metadaten & Club-IDs + Namen aus Managerdaten
async function loadManagerData() {
  const data = JSON.parse(await fs.readFile(INPUT_MANAGERDATA, "utf8"));
  if (!Array.isArray(data?.leagues) || !Array.isArray(data?.clubs)) {
    throw new Error("manager-fetched-data.json muss { leagues: [...], clubs: [...] } enthalten");
  }

  const leagues = new Map();
  for (const l of data.leagues) {
    leagues.set(String(l.id), {
      name: l?.name ?? null,
      abbrName: l?.abbrName ?? null,
      isW: Boolean(l?.isWomen),
    });
  }

  // Map leagueId -> Array {id,name}
  const leagueClubs = {};
  for (const c of data.clubs) {
    const lid = String(c.league);
    if (!leagueClubs[lid]) leagueClubs[lid] = [];
    leagueClubs[lid].push({ id: c.id, name: c.name ?? null });
  }

  return { leagues, leagueClubs };
}

async function main() {
  console.log("starting league file generation");
  console.time("genLeagueFiles");

  for (const d of [OUT_DIR, OUT_ALL, OUT_NOBASE, OUT_ONLYBEST, OUT_ONLYBESTSPEC]) {
    await fs.rm(d, { recursive: true, force: true });
    await fs.mkdir(d, { recursive: true });
  }

  const cards = JSON.parse(await fs.readFile(INPUT_ALL_CARDS, "utf8"));
  if (!Array.isArray(cards)) throw new Error("Invalid all-cards.json");

  const { leagues: leagueMeta, leagueClubs } = await loadManagerData();

  const leagueAll  = new Map();
  const leagueBest = new Map();

  for (const c of cards) {
    const leagueId = String(c.leagueId ?? "");
    const assetId  = String(c.assetId ?? "");
    const rid      = String(c.resourceId ?? "");
    const vIdOrig  = String(c.versionId ?? "");
    const vId      = remapVersionId(vIdOrig, c.rating);
    const rating   = Number(c.rating ?? 0);
    if (!leagueId || !assetId || !rid || !vId) continue;

    const entry = {
      name: c.name,
      cardName: c.cardName,
      originalVersionId: vIdOrig,
      ...pick(c, PICK_FIELDS),
      versionId: vId,
    };

    if (!leagueAll.has(leagueId)) leagueAll.set(leagueId, {});
    leagueAll.get(leagueId)[rid] = entry;

    if (!leagueBest.has(leagueId)) leagueBest.set(leagueId, new Map());
    const perAsset = leagueBest.get(leagueId);
    const slot = perAsset.get(assetId);
    if (!slot) {
      perAsset.set(assetId, { maxRating: rating, entries: { [rid]: entry } });
    } else if (rating > slot.maxRating) {
      perAsset.set(assetId, { maxRating: rating, entries: { [rid]: entry } });
    } else if (rating === slot.maxRating) {
      slot.entries[rid] = entry;
    }
  }

  const leaguesCounts = {};

  for (const [lid, allMap] of leagueAll) {
    await fs.writeFile(path.join(OUT_ALL, `${lid}.json`), JSON.stringify(allMap, null, 2));

    const noBase = Object.fromEntries(
      Object.entries(allMap).filter(([_, e]) => !BASE_VERSION_IDS.has(String(e.versionId)))
    );
    await fs.writeFile(path.join(OUT_NOBASE, `${lid}.json`), JSON.stringify(noBase, null, 2));

    const onlyBest = {};
    const onlyBestSpecial = {};
    const perAsset = leagueBest.get(lid) ?? new Map();
    for (const { entries } of perAsset.values()) {
      for (const [rid, e] of Object.entries(entries)) {
        onlyBest[rid] = e;
        if (!BASE_VERSION_IDS.has(String(e.versionId))) {
          onlyBestSpecial[rid] = e;
        }
      }
    }
    await fs.writeFile(path.join(OUT_ONLYBEST, `${lid}.json`), JSON.stringify(onlyBest, null, 2));
    await fs.writeFile(path.join(OUT_ONLYBESTSPEC, `${lid}.json`), JSON.stringify(onlyBestSpecial, null, 2));

    const meta        = leagueMeta.get(lid) ?? {};
    const countryInfo = COUNTRYID_FOR_LEAGUEID[lid] ?? {};
    leaguesCounts[lid] = {
      c: {
        all: Object.keys(allMap).length,
        nobase: Object.keys(noBase).length,
        onlybest: Object.keys(onlyBest).length,
        onlybestSpecial: Object.keys(onlyBestSpecial).length,
      },
      name: meta.name ?? null,
      aName: meta.abbrName ?? null,
      isW: meta.isW ?? null,
      cId: countryInfo.cId ?? null,
      sortId: countryInfo.sortId ?? null,
      clubIds: leagueClubs[lid] ?? [],   // <-- jetzt [{id,name}, …]
    };
  }

  const sortedIds = Object.keys(leaguesCounts).sort((a, b) => Number(a) - Number(b));
  const sortedObj = Object.fromEntries(sortedIds.map(id => [id, leaguesCounts[id]]));

  await fs.writeFile(
    INDEX_FILE,
    JSON.stringify({ totalLeagues: sortedIds.length, leagues: sortedObj }, null, 2),
    "utf8"
  );

  console.timeEnd("genLeagueFiles");
  console.log(`✔ leaguesIndex.json geschrieben (${sortedIds.length} Ligen)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
