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

const HERO_CLUB_ID = "114605"; // feste Hero-ClubId
const HERO_NAME = "Heros";

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

// Utility: normales Club-File als {clubId, clubName, cards}
async function writeClubFile(dir, clubId, clubName, cards) {
  await fs.writeFile(
    path.join(dir, `${clubId}.json`),
    JSON.stringify({ clubId, clubName, cards }, null, 2)
  );
}

// Utility: „club-ähnliche“ Datei mit freiem Dateinamen (z. B. leagueId_114605)
// Inhalt kann zusätzlich Felder enthalten (z. B. leagueId)
async function writeClubLike(
  dir,
  fileId,
  { clubId, clubName, leagueId = null, cards }
) {
  const payload = { clubId, clubName, cards };
  if (leagueId != null) payload.leagueId = leagueId;
  await fs.writeFile(
    path.join(dir, `${fileId}.json`),
    JSON.stringify(payload, null, 2)
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

  // index-data nicht löschen, nur sicherstellen dass es existiert
  await fs.mkdir(INDEX_DIR, { recursive: true });

  const [cards, manager] = await Promise.all([
    fs.readFile(INPUT_ALL_CARDS, "utf8").then(JSON.parse),
    fs.readFile(INPUT_MANAGER, "utf8").then(JSON.parse),
  ]);
  if (!Array.isArray(cards)) throw new Error("Invalid all-cards.json");

  // --- Maps & Counters
  const leagueAll = new Map(), // lId -> { resourceId: entry }
    leagueBest = new Map(); // lId -> Map(assetId -> { maxRating, entries })
  const clubAll = new Map(), // cId -> { resourceId: entry }
    clubBest = new Map(); // cId -> Map(assetId -> { maxRating, entries })

  const leagueCounts = {}; // lId -> {all,nobase,onlybest}
  const clubCounts = new Map(); // clubKey -> {all,nobase,onlybest}

  const clubNames = new Map(
    (manager.clubs ?? []).map((c) => [String(c.id), c.name ?? ""])
  );

  // --- HERO-spezifische Strukturen: pro Liga gruppieren
  const heroAllByLeague = new Map(); // lId -> { resourceId: entry }
  const heroBestByLeague = new Map(); // lId -> Map(assetId -> { maxRating, entries })

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

    const lId = String(c.leagueId);
    const cId = String(c.clubId ?? "");
    const vId = remapVersionId(String(c.versionId), c.rating);
    const rating = Number(c.rating);

    const entry = {
      ...pick(c, PICK_FIELDS),
      name: c.name,
      cardName: c.cardName,
      originalVersionId: c.versionId,
      versionId: vId,
    };

    // ---- Liga all + best
    (leagueAll.get(lId) ?? leagueAll.set(lId, {}).get(lId))[c.resourceId] =
      entry;

    const lBest =
      leagueBest.get(lId) ?? leagueBest.set(lId, new Map()).get(lId);
    const lSlot = lBest.get(c.assetId);
    if (!lSlot || rating > lSlot.maxRating) {
      lBest.set(c.assetId, {
        maxRating: rating,
        entries: { [c.resourceId]: entry },
      });
    } else if (rating === lSlot.maxRating) {
      lSlot.entries[c.resourceId] = entry;
    }

    // ---- Normale Clubs all + counts + best (nur wenn eine echte clubId vorhanden ist)
    if (cId && cId !== "0") {
      (clubAll.get(cId) ?? clubAll.set(cId, {}).get(cId))[c.resourceId] =
        entry;

      const cc = clubCounts.get(cId) ?? { all: 0, nobase: 0, onlybest: 0 };
      cc.all++;
      if (!BASE_VERSION_IDS.has(String(vId))) cc.nobase++;
      clubCounts.set(cId, cc);

      const cBest =
        clubBest.get(cId) ?? clubBest.set(cId, new Map()).get(cId);
      const cSlot = cBest.get(c.assetId);
      if (!cSlot || rating > cSlot.maxRating) {
        cBest.set(c.assetId, {
          maxRating: rating,
          entries: { [c.resourceId]: entry },
        });
      } else if (rating === cSlot.maxRating) {
        cSlot.entries[c.resourceId] = entry;
      }
    }

    // ---- HERO-Karten zusätzlich pro Liga sammeln (clubId == 114605)
    if (cId === HERO_CLUB_ID) {
      (heroAllByLeague.get(lId) ??
        heroAllByLeague.set(lId, {}).get(lId))[c.resourceId] = entry;

      const hBest =
        heroBestByLeague.get(lId) ??
        heroBestByLeague.set(lId, new Map()).get(lId);
      const hSlot = hBest.get(c.assetId);
      if (!hSlot || rating > hSlot.maxRating) {
        hBest.set(c.assetId, {
          maxRating: rating,
          entries: { [c.resourceId]: entry },
        });
      } else if (rating === hSlot.maxRating) {
        hSlot.entries[c.resourceId] = entry;
      }
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
    for (const { entries } of (leagueBest.get(lId) ?? new Map()).values()) {
      Object.assign(onlyBest, entries);
    }

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
  for (const [cId, allCards] of clubAll) {
    const clubName = clubNames.get(cId) ?? "";

    const noBase = Object.fromEntries(
      Object.entries(allCards).filter(
        ([_, e]) => !BASE_VERSION_IDS.has(String(e.versionId))
      )
    );

    const onlyBest = {};
    for (const { entries } of (clubBest.get(cId) ?? new Map()).values()) {
      Object.assign(onlyBest, entries);
    }

    await writeClubFile(`${C_OUT}/clubs-all`, cId, clubName, allCards);
    await writeClubFile(`${C_OUT}/clubs-noBase`, cId, clubName, noBase);
    await writeClubFile(`${C_OUT}/clubs-onlyBest`, cId, clubName, onlyBest);

    const cc = clubCounts.get(cId) ?? { all: 0, nobase: 0, onlybest: 0 };
    cc.onlybest = Object.keys(onlyBest).length;
    clubCounts.set(cId, cc);
  }

  // --- HERO-Club-Dateien pro Liga (Dateiname: ${leagueId}_114605.json)
  for (const [lId, allCards] of heroAllByLeague) {
    const fileId = `${lId}_${HERO_CLUB_ID}`;
    const noBase = Object.fromEntries(
      Object.entries(allCards).filter(
        ([_, e]) => !BASE_VERSION_IDS.has(String(e.versionId))
      )
    );

    const onlyBest = {};
    for (const { entries } of (heroBestByLeague.get(lId) ?? new Map()).values())
      Object.assign(onlyBest, entries);

    await writeClubLike(`${C_OUT}/clubs-all`, fileId, {
      clubId: Number(HERO_CLUB_ID),
      clubName: HERO_NAME,
      leagueId: Number(lId),
      cards: allCards,
    });

    await writeClubLike(`${C_OUT}/clubs-noBase`, fileId, {
      clubId: Number(HERO_CLUB_ID),
      clubName: HERO_NAME,
      leagueId: Number(lId),
      cards: noBase,
    });

    await writeClubLike(`${C_OUT}/clubs-onlyBest`, fileId, {
      clubId: Number(HERO_CLUB_ID),
      clubName: HERO_NAME,
      leagueId: Number(lId),
      cards: onlyBest,
    });

    // Counts für den Pseudo-Club in clubCounts ablegen (Key = fileId)
    clubCounts.set(fileId, {
      all: Object.keys(allCards).length,
      nobase: Object.keys(noBase).length,
      onlybest: Object.keys(onlyBest).length,
    });
  }

  // --- League-Index inkl. Club-IDs (und HERO-Pseudo-Club je Liga)
  const clubsByLeague = new Map(); // lid -> [clubIds...]
  for (const cl of manager.clubs ?? []) {
    const lid = cl.league;
    if (!lid) continue;
    (clubsByLeague.get(lid) ?? clubsByLeague.set(lid, []).get(lid)).push(cl.id);
  }

  const leaguesMeta = (manager.leagues ?? []).map((l) => {
    const lid = l.id;
    const regularClubs =
      clubsByLeague.get(lid) ?? []; // echte Club-IDs (Zahlen)

    // Start mit echten Clubs (mit Namen + Counts)
    const clubList = regularClubs.map((cid) => ({
      id: cid,
      name: clubNames.get(String(cid)) ?? "",
      counts: clubCounts.get(String(cid)) ?? {
        all: 0,
        nobase: 0,
        onlybest: 0,
      },
    }));

    // Falls es HERO-Karten für diese Liga gibt, Pseudo-Club ergänzen
    if (heroAllByLeague.has(String(lid))) {
      const fileId = `${lid}_${HERO_CLUB_ID}`;
      clubList.push({
        id: fileId, // wichtig: zusammengesetzter Key im Index
        name: HERO_NAME,
        counts:
          clubCounts.get(fileId) ?? {
            all: 0,
            nobase: 0,
            onlybest: 0,
          },
      });
    }

    return {
      id: lid,
      name: l.name ?? null,
      bName: BETTER_NAMES[l.name] ?? null,
      aName: l.abbrName ?? null,
      isW: l.isWomen ?? null,
      cId: (COUNTRYID_FOR_LEAGUEID[lid] ?? {}).cId ?? null,
      sId: (COUNTRYID_FOR_LEAGUEID[lid] ?? {}).sortId ?? null,
      c: leagueCounts[lid] ?? { all: 0, nobase: 0, onlybest: 0 },
      clubIds: clubList,
    };
  });

  await fs.writeFile(INDEX_FILE, JSON.stringify(leaguesMeta, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
