import fs from "fs/promises";
import path from "path";
import {
  COUNTRYID_FOR_LEAGUEID,
  PICK_FIELDS,
  BASE_VERSION_IDS,
} from "./helpers/constantsHelper.js";
import { remapVersionId, pick } from "./helpers/helperFunctions.js";

const INPUT_ALL_CARDS = path.join("db/core-data/all-cards.json");
const INPUT_MANAGER = path.join("db/core-data/manager-fetched-data.json");
const INDEX_DIR = path.join("db/index-data");
const INDEX_FILE = path.join(INDEX_DIR, "leaguesIndex.json");
const L_OUT = "db/leagues";
const C_OUT = "db/clubs";
const BETTER_NAMES = {
  "Bundesliga 2": "2. Bundesliga",
  CSL: "Chinese Super League",
  CSSL: "Swiss Super League",
  GPFBL: "Google Pixel Frauen Bundesliga",
  ISL: "Indian Super League",
  LPF: "Primera División",
  "Liga Azerbaijan": "Aserbaidschan Premyer Liqasi",
  "Liga Colombia": "Categoría Primera A",
  "Ö. Bundesliga": "Österreichische Bundesliga",
};

// Utility: sicheres Schreiben als {clubId, clubName, cards}
async function writeClubFile(dir, clubId, clubName, cards) {
  await fs.writeFile(
    path.join(dir, `${clubId}.json`),
    JSON.stringify({ clubId, clubName, cards }, null, 2)
  );
}

async function main() {
  // --- Setup
  for (const d of [
    L_OUT,
    `${L_OUT}/leagues-all`,
    `${L_OUT}/leagues-noBase`,
    `${L_OUT}/leagues-onlyBest`,
    C_OUT,
    `${C_OUT}/clubs-all`,
    `${C_OUT}/clubs-noBase`,
    `${C_OUT}/clubs-onlyBest`,
  ]) {
    await fs.rm(d, { recursive: true, force: true });
    await fs.mkdir(d, { recursive: true });
  }

  // Stelle sicher, dass index-data existiert
  await fs.mkdir(INDEX_DIR, { recursive: true });
  
  const [cards, manager] = await Promise.all([
    fs.readFile(INPUT_ALL_CARDS, "utf8").then(JSON.parse),
    fs.readFile(INPUT_MANAGER, "utf8").then(JSON.parse),
  ]);
  if (!Array.isArray(cards)) throw new Error("Invalid all-cards.json");

  // --- Maps & Counters
  const leagueAll = new Map(),
    leagueBest = new Map();
  const clubAll = new Map(),
    clubBest = new Map();
  const leagueCounts = {},
    clubCounts = new Map();
  const clubNames = new Map(
    manager.clubs?.map((c) => [String(c.id), c.name ?? ""])
  );

  // --- Karten verarbeiten
  for (const c of cards) {
    if (
      !c?.leagueId ||
      !c?.assetId ||
      !c?.resourceId ||
      !c?.versionId ||
      !c?.rating
    )
      continue;
    const lId = String(c.leagueId),
      clId = String(c.clubId ?? "");
    const vId = remapVersionId(String(c.versionId), c.rating);
    const rating = Number(c.rating);
    const entry = {
      ...pick(c, PICK_FIELDS),
      name: c.name,
      cardName: c.cardName,
      originalVersionId: c.versionId,
      versionId: vId,
    };

    // Liga all + best
    (leagueAll.get(lId) ?? leagueAll.set(lId, {}).get(lId))[c.resourceId] =
      entry;
    const lBest =
      leagueBest.get(lId) ?? leagueBest.set(lId, new Map()).get(lId);
    const lSlot = lBest.get(c.assetId);
    if (!lSlot || rating > lSlot.maxRating)
      lBest.set(c.assetId, {
        maxRating: rating,
        entries: { [c.resourceId]: entry },
      });
    else if (rating === lSlot.maxRating) lSlot.entries[c.resourceId] = entry;

    // Club all + counts
    if (clId) {
      (clubAll.get(clId) ?? clubAll.set(clId, {}).get(clId))[c.resourceId] =
        entry;
      const cc = clubCounts.get(clId) ?? { all: 0, nobase: 0, onlybest: 0 };
      cc.all++;
      if (!BASE_VERSION_IDS.has(vId)) cc.nobase++;
      clubCounts.set(clId, cc);
      const cBest =
        clubBest.get(clId) ?? clubBest.set(clId, new Map()).get(clId);
      const cSlot = cBest.get(c.assetId);
      if (!cSlot || rating > cSlot.maxRating)
        cBest.set(c.assetId, {
          maxRating: rating,
          entries: { [c.resourceId]: entry },
        });
      else if (rating === cSlot.maxRating) cSlot.entries[c.resourceId] = entry;
    }
  }

  // --- Liga-Dateien
  for (const [lId, allCards] of leagueAll) {
    const noBase = Object.fromEntries(
      Object.entries(allCards).filter(
        ([_, e]) => !BASE_VERSION_IDS.has(String(e.versionId))
      )
    );
    const onlyBest = {};
    for (const { entries } of leagueBest.get(lId).values())
      Object.assign(onlyBest, entries);

    await fs.writeFile(
      `${L_OUT}/leagues-all/${lId}.json`,
      JSON.stringify(allCards, null, 2)
    );
    await fs.writeFile(
      `${L_OUT}/leagues-noBase/${lId}.json`,
      JSON.stringify(noBase, null, 2)
    );
    await fs.writeFile(
      `${L_OUT}/leagues-onlyBest/${lId}.json`,
      JSON.stringify(onlyBest, null, 2)
    );
    leagueCounts[lId] = {
      all: Object.keys(allCards).length,
      nobase: Object.keys(noBase).length,
      onlybest: Object.keys(onlyBest).length,
    };
  }

  // --- Club-Dateien (inkl. Namen)
  for (const [clId, allCards] of clubAll) {
    const clubName = clubNames.get(clId) ?? "";
    const noBase = Object.fromEntries(
      Object.entries(allCards).filter(
        ([_, e]) => !BASE_VERSION_IDS.has(String(e.versionId))
      )
    );
    const onlyBest = {};
    for (const { entries } of (clubBest.get(clId) ?? new Map()).values())
      Object.assign(onlyBest, entries);

    await writeClubFile(`${C_OUT}/clubs-all`, clId, clubName, allCards);
    await writeClubFile(`${C_OUT}/clubs-noBase`, clId, clubName, noBase);
    await writeClubFile(`${C_OUT}/clubs-onlyBest`, clId, clubName, onlyBest);
    clubCounts.get(clId).onlybest = Object.keys(onlyBest).length; // final count
  }

  // --- League-Index mit Club-Counts
  const clubsByLeague = new Map();
  for (const cl of manager.clubs ?? []) {
    const lid = cl.league;
    if (!lid) continue;
    (clubsByLeague.get(lid) ?? clubsByLeague.set(lid, []).get(lid)).push(cl.id);
  }
  const leaguesMeta = (manager.leagues ?? []).map((l) => ({
    id: l.id,
    name: l.name ?? null,
    betterName: BETTER_NAMES[l.name] ?? null,
    abbrName: l.abbrName ?? null,
    isWomen: l.isWomen ?? null,
    cId: (COUNTRYID_FOR_LEAGUEID[l.id] ?? {}).lid ?? null,
    sortId: (COUNTRYID_FOR_LEAGUEID[l.id] ?? {}).sortId ?? null,
    counts: leagueCounts[l.id] ?? { all: 0, nobase: 0, onlybest: 0 },
    clubIds: (clubsByLeague.get(l.id) ?? []).map((cid) => ({
      id: cid,
      name: clubNames.get(String(cid)) ?? "",
      counts: clubCounts.get(String(cid)) ?? { all: 0, nobase: 0, onlybest: 0 },
    })),
  }));
  await fs.writeFile(INDEX_FILE, JSON.stringify(leaguesMeta, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
