// scripts/build-hero-clubs.js
import fs from "fs/promises";
import path from "path";
import { remapVersionId, pick } from "./helpers/helperFunctions.js";
import { PICK_FIELDS, BASE_VERSION_IDS } from "./helpers/constantsHelper.js";

const INPUT_ALL_CARDS   = path.join("db", "core-data", "all-cards.json");
const INPUT_MANAGERDATA = path.join("db", "core-data", "manager-fetched-data.json");

const OUT_DIR          = path.join("db", "clubs");
const OUT_ALL          = path.join(OUT_DIR, "clubs-all");
const OUT_NOBASE       = path.join(OUT_DIR, "clubs-noBase");
const OUT_ONLYBEST     = path.join(OUT_DIR, "clubs-onlyBest");
const OUT_ONLYBESTSPEC = path.join(OUT_DIR, "clubs-onlyBestSpecial");

const HERO_CLUB_ID = 114605;

async function main() {
  console.log("starting hero pseudo-club generation");
  console.time("genHeroClubs");

  // sicherstellen, dass die Ausgabeordner existieren
  for (const d of [OUT_DIR, OUT_ALL, OUT_NOBASE, OUT_ONLYBEST, OUT_ONLYBESTSPEC]) {
    await fs.mkdir(d, { recursive: true });
  }

  const cards = JSON.parse(await fs.readFile(INPUT_ALL_CARDS, "utf8"));
  if (!Array.isArray(cards)) throw new Error("Invalid all-cards.json");

  // Liganamen für hübsche Anzeige
  const manager = JSON.parse(await fs.readFile(INPUT_MANAGERDATA, "utf8"));
  const leagueNames = new Map();
  for (const l of manager.leagues ?? []) {
    leagueNames.set(String(l.id), l.name ?? null);
  }

  // Gruppiere alle Hero-Karten pro Liga
  const leagueHeroAll  = new Map();
  const leagueHeroBest = new Map();

  for (const c of cards) {
    if (c.clubId !== HERO_CLUB_ID) continue;

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

    if (!leagueHeroAll.has(leagueId)) leagueHeroAll.set(leagueId, {});
    leagueHeroAll.get(leagueId)[rid] = entry;

    if (!leagueHeroBest.has(leagueId)) leagueHeroBest.set(leagueId, new Map());
    const perAsset = leagueHeroBest.get(leagueId);
    const slot = perAsset.get(assetId);
    if (!slot) {
      perAsset.set(assetId, { maxRating: rating, entries: { [rid]: entry } });
    } else if (rating > slot.maxRating) {
      perAsset.set(assetId, { maxRating: rating, entries: { [rid]: entry } });
    } else if (rating === slot.maxRating) {
      slot.entries[rid] = entry;
    }
  }

  // Für jede Liga mit Hero-Karten Dateien anlegen
  for (const [lid, allMap] of leagueHeroAll) {
    const file = `${HERO_CLUB_ID}_${lid}.json`;
    const clubName = `Heroes`;

    const wrap = (data) => JSON.stringify({ clubName, players: data }, null, 2);

    await fs.writeFile(path.join(OUT_ALL, file), wrap(allMap));

    const noBase = Object.fromEntries(
      Object.entries(allMap).filter(([_, e]) => !BASE_VERSION_IDS.has(String(e.versionId)))
    );
    await fs.writeFile(path.join(OUT_NOBASE, file), wrap(noBase));

    const onlyBest = {};
    const onlyBestSpecial = {};
    const perAsset = leagueHeroBest.get(lid) ?? new Map();
    for (const { entries } of perAsset.values()) {
      for (const [rid, e] of Object.entries(entries)) {
        onlyBest[rid] = e;
        if (!BASE_VERSION_IDS.has(String(e.versionId))) {
          onlyBestSpecial[rid] = e;
        }
      }
    }
    await fs.writeFile(path.join(OUT_ONLYBEST, file), wrap(onlyBest));
    await fs.writeFile(path.join(OUT_ONLYBESTSPEC, file), wrap(onlyBestSpecial));

    
  }

  console.timeEnd("genHeroClubs");
  console.log(`✔ Total hero pseudo-clubs: ${leagueHeroAll.size}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
