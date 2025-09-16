// scripts/build-hero-clubs.js
import fs from "fs/promises";
import path from "path";
import { remapVersionId, pick } from "./helpers/helperFunctions.js";
import { PICK_FIELDS, BASE_VERSION_IDS } from "./helpers/constantsHelper.js";

const INPUT_ALL_CARDS = path.join("db", "core-data", "all-cards.json");
const INPUT_MANAGERDATA = path.join(
  "db",
  "core-data",
  "manager-fetched-data.json"
);

const OUT_DIR = path.join("db", "clubs");
const OUT_ALL = path.join(OUT_DIR, "clubs-all");
const OUT_NOBASE = path.join(OUT_DIR, "clubs-noBase");
const OUT_ONLYBEST = path.join(OUT_DIR, "clubs-onlyBest");
const OUT_ONLYBESTSPECIAL = path.join(OUT_DIR, "clubs-onlyBestSpecial");

const INDEX_FILE = path.join("db", "index-data", "leaguesIndex.json");
const HERO_CLUBID = 114605;

async function buildHeroClubs() {
  const [allCardsRaw, managerRaw, leaguesIndexRaw] = await Promise.all([
    fs.readFile(INPUT_ALL_CARDS, "utf8"),
    fs.readFile(INPUT_MANAGERDATA, "utf8"),
    fs.readFile(INDEX_FILE, "utf8"),
  ]);

  const allCards = JSON.parse(allCardsRaw);
  const manager = JSON.parse(managerRaw);
  const leaguesIdx = JSON.parse(leaguesIndexRaw);

  // Alle Ligen, in denen mind. eine Hero-Karte existiert
  const heroesByLeague = {};
  for (const card of allCards) {
    if (card.clubId === HERO_CLUBID) {
      const lid = card.leagueId;
      (heroesByLeague[lid] ||= []).push(card);
    }
  }

  await fs.mkdir(OUT_ALL, { recursive: true });
  await fs.mkdir(OUT_NOBASE, { recursive: true });
  await fs.mkdir(OUT_ONLYBEST, { recursive: true });
  await fs.mkdir(OUT_ONLYBESTSPECIAL, { recursive: true });

  for (const [leagueId, cards] of Object.entries(heroesByLeague)) {
    // alle Varianten picken
    const all = cards.map((c) => pick(c, PICK_FIELDS));
    const noBase = all.filter(
      (c) => !BASE_VERSION_IDS.has(String(c.versionId))
    );
    const best = Object.values(
      all.reduce((acc, c) => {
        const key = c.resourceId;
        if (!acc[key] || acc[key].rating < c.rating) acc[key] = c;
        return acc;
      }, {})
    );
    const bestSpecial = best.filter(
      (c) => !BASE_VERSION_IDS.has(String(c.versionId))
    );

    const fname = `${leagueId}_${HERO_CLUBID}.json`;
    await Promise.all([
      fs.writeFile(path.join(OUT_ALL, fname), JSON.stringify(all, null, 2)),
      fs.writeFile(
        path.join(OUT_NOBASE, fname),
        JSON.stringify(noBase, null, 2)
      ),
      fs.writeFile(
        path.join(OUT_ONLYBEST, fname),
        JSON.stringify(best, null, 2)
      ),
      fs.writeFile(
        path.join(OUT_ONLYBESTSPECIAL, fname),
        JSON.stringify(bestSpecial, null, 2)
      ),
    ]);

    // League-Index um Hero-Pseudo-Club ergänzen
    const clubArray = leaguesIdx.leagues[leagueId].clubIds;
    if (!clubArray.some((c) => c.id === `${leagueId}_${HERO_CLUBID}`)) {
      clubArray.push({
        name: "Heros",
        id: `${leagueId}_${HERO_CLUBID}`,
      });
    }
  }

  await fs.writeFile(INDEX_FILE, JSON.stringify(leaguesIdx, null, 2));
  console.log("Hero-Clubs erstellt und leaguesIndex.json aktualisiert.");
}

buildHeroClubs().catch((err) => {
  console.error("Fehler beim Erstellen der Hero-Clubs:", err);
  process.exit(1);
});
