// scripts/build-clubs-files-only.js
import fs from "fs/promises";
import path from "path";
import { remapVersionId, pick } from "./helpers/helperFunctions.js";
import { PICK_FIELDS, BASE_VERSION_IDS } from "./helpers/constantsHelper.js";

const INPUT_ALL_CARDS = path.join("db", "core-data", "all-cards.json");
const INPUT_MANAGERDATA = path.join("db", "core-data", "manager-fetched-data.json");

const OUT_DIR          = path.join("db", "clubs");
const OUT_ALL          = path.join(OUT_DIR, "clubs-all");
const OUT_NOBASE       = path.join(OUT_DIR, "clubs-noBase");
const OUT_ONLYBEST     = path.join(OUT_DIR, "clubs-onlyBest");
const OUT_ONLYBESTSPEC = path.join(OUT_DIR, "clubs-onlyBestSpecial");

// Clubnamen für spätere Einträge laden
async function loadClubNames() {
  const data = JSON.parse(await fs.readFile(INPUT_MANAGERDATA, "utf8"));
  const map = new Map();
  for (const c of data.clubs ?? []) {
    map.set(String(c.id), c.name ?? null);
  }
  return map;
}

async function main() {
  console.log("starting pure club file generation with club names");
  console.time("genPureClubFiles");

  // Ausgabeverzeichnisse leeren/erstellen
  for (const d of [OUT_DIR, OUT_ALL, OUT_NOBASE, OUT_ONLYBEST, OUT_ONLYBESTSPEC]) {
    await fs.rm(d, { recursive: true, force: true });
    await fs.mkdir(d, { recursive: true });
  }

  const cards = JSON.parse(await fs.readFile(INPUT_ALL_CARDS, "utf8"));
  if (!Array.isArray(cards)) throw new Error("Invalid all-cards.json");

  const clubNames = await loadClubNames();

  const clubAll  = new Map();
  const clubBest = new Map();

  for (const c of cards) {
    const clubId  = String(c.clubId ?? "");
    const assetId = String(c.assetId ?? "");
    const rid     = String(c.resourceId ?? "");
    const vIdOrig = String(c.versionId ?? "");
    const vId     = remapVersionId(vIdOrig, c.rating);
    const rating  = Number(c.rating ?? 0);
    if (!clubId || !assetId || !rid || !vId) continue;

    const entry = {
      name: c.name,
      cardName: c.cardName,
      originalVersionId: vIdOrig,
      ...pick(c, PICK_FIELDS),
      versionId: vId,
    };

    if (!clubAll.has(clubId)) clubAll.set(clubId, {});
    clubAll.get(clubId)[rid] = entry;

    if (!clubBest.has(clubId)) clubBest.set(clubId, new Map());
    const perAsset = clubBest.get(clubId);
    const slot = perAsset.get(assetId);
    if (!slot) {
      perAsset.set(assetId, { maxRating: rating, entries: { [rid]: entry } });
    } else if (rating > slot.maxRating) {
      perAsset.set(assetId, { maxRating: rating, entries: { [rid]: entry } });
    } else if (rating === slot.maxRating) {
      slot.entries[rid] = entry;
    }
  }

  // pro Club Dateien schreiben, jeweils mit clubName
  for (const [cid, allMap] of clubAll) {
    const clubName = clubNames.get(cid) ?? null;

    const wrap = (data) => JSON.stringify({ clubName, players: data }, null, 2);

    // all
    await fs.writeFile(path.join(OUT_ALL, `${cid}.json`), wrap(allMap));

    // noBase
    const noBase = Object.fromEntries(
      Object.entries(allMap).filter(([_, e]) => !BASE_VERSION_IDS.has(String(e.versionId)))
    );
    await fs.writeFile(path.join(OUT_NOBASE, `${cid}.json`), wrap(noBase));

    // onlyBest & onlyBestSpecial
    const onlyBest = {};
    const onlyBestSpecial = {};
    const perAsset = clubBest.get(cid) ?? new Map();
    for (const { entries } of perAsset.values()) {
      for (const [rid, e] of Object.entries(entries)) {
        onlyBest[rid] = e;
        if (!BASE_VERSION_IDS.has(String(e.versionId))) {
          onlyBestSpecial[rid] = e;
        }
      }
    }
    await fs.writeFile(path.join(OUT_ONLYBEST, `${cid}.json`), wrap(onlyBest));
    await fs.writeFile(path.join(OUT_ONLYBESTSPEC, `${cid}.json`), wrap(onlyBestSpecial));
  }

  console.timeEnd("genPureClubFiles");
  console.log(`✔ Pure club files geschrieben (${clubAll.size} Clubs)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
