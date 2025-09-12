import fs from "fs/promises";
import path from "path";

const INPUT_ALL_CARDS = path.join("db", "core-data", "all-cards.json");
const INPUT_LEAGUES_DATA = path.join(
  "db",
  "core-data",
  "manager-fetched-data.json"
);

const INDEX_DIR = path.join("db", "index-data");
const INDEX_FILE = path.join(INDEX_DIR, "leaguesIndex.json");
const OUT_DIR = path.join("db", "leagues");
const OUT_DIR_ALL = path.join(OUT_DIR, "leagues-all");
const OUT_DIR_NO_BASE = path.join(OUT_DIR, "leagues-noBase");
const OUT_DIR_ONLY_BEST = path.join(OUT_DIR, "leagues-onlyBest");

const BETTER_LEAGUE_NAMES = {
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

const COUNTRYID_FOR_LEAGUEID = {
  1:   { lid: 13, sortId: 0 },
  4:   { lid: 7, sortId: 0 },
  10:  { lid: 34, sortId: 0 },
  13:  { lid: 14, sortId: 5 },
  14:  { lid: 14, sortId: 6 },
  16:  { lid: 18, sortId: 15 },
  17:  { lid: 18, sortId: 16 },
  19:  { lid: 21, sortId: 1 },
  20:  { lid: 21, sortId: 2 },
  31:  { lid: 27, sortId: 12 },
  32:  { lid: 27, sortId: 13 },
  39:  { lid: 95, sortId: 0 },
  41:  { lid: 36, sortId: 0 },
  50:  { lid: 42, sortId: 0 },
  53:  { lid: 45, sortId: 9 },
  54:  { lid: 45, sortId: 10 },
  58:  { lid: 46, sortId: 0 },
  60:  { lid: 14, sortId: 7 },
  61:  { lid: 14, sortId: 8 },
  63:  { lid: 22, sortId: 0 },
  65:  { lid: 25, sortId: 0 },
  66:  { lid: 37, sortId: 0 },
  68:  { lid: 48, sortId: 0 },
  80:  { lid: 4, sortId: 18 },
  83:  { lid: 166, sortId: 0 },
  189: { lid: 47, sortId: 19 },
  308: { lid: 38, sortId: 21 },
  317: { lid: 10, sortId: 0 },
  319: { lid: 12, sortId: 0 },
  322: { lid: 17, sortId: 0 },
  330: { lid: 39, sortId: 0 },
  332: { lid: 49, sortId: 0 },
  350: { lid: 183, sortId: 0 },
  351: { lid: 195, sortId: 0 },
  353: { lid: 52, sortId: 0 },
  1003:{ lid: 54, sortId: 0 },
  1014:{ lid: 54, sortId: 0 },
  2012:{ lid: 155, sortId: 0 },
  2076:{ lid: 21, sortId: 3 },
  2149:{ lid: 159, sortId: 0 },
  2172:{ lid: 190, sortId: 0 },
  2209:{ lid: 56, sortId: 0 },
  2210:{ lid: 11, sortId: 0 },
  2211:{ lid: 23, sortId: 0 },
  2215:{ lid: 21, sortId: 4 },
  2216:{ lid: 14, sortId: 0 },
  2218:{ lid: 18, sortId: 17 },
  2221:{ lid: 95, sortId: 0 },
  2222:{ lid: 45, sortId: 11 },
  2228:{ lid: 38, sortId: 22 },
  2229:{ lid: 34, sortId: 0 },
  2230:{ lid: 12, sortId: 0 },
  2231:{ lid: 47, sortId: 20 },
  2232:{ lid: 46, sortId: 0 },
  2233:{ lid: 42, sortId: 0 },
  2236:{ lid: 27, sortId: 14 },
  2244:{ lid: 5, sortId: 0 },
};


async function loadLeaguesMeta() {
  const raw = await fs.readFile(INPUT_LEAGUES_DATA, "utf8");
  const data = JSON.parse(raw);

  const result = new Map();
  for (const meta of data.leagues) {
    const name = meta?.name ?? null;
    const abbrName = meta?.abbrName ?? null;
    const id = meta?.id ?? null;
    const isWomen = meta?.isWomen ?? null;
    const betterName = BETTER_LEAGUE_NAMES[name] ?? null;

    result.set(String(id), { name, abbrName, isWomen, betterName });
  }
  return result;
}

async function main() {
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

  const leaguesMeta = await loadLeaguesMeta();
  setLeagueCountryIdFromCards(leaguesMeta, cards);

  //   console.log(leaguesMeta);
}
main();
