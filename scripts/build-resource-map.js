// scripts/build-resource-map.js
import fs from "fs/promises";
import path from "path";
import { BASE_VERSION_IDS } from "./helpers/constantsHelper.js";

const PLAYERS_DIR = path.join("db", "players");
const INDEX_DIR   = path.join("db", "index-data");
const OUT_FILE    = path.join(INDEX_DIR, "resourceMap.json");

// normalisiert Array- oder Objekt-Dateien
function normalizeAssetFile(json) {
  if (Array.isArray(json)) {
    return json.map(c => ({
      rid: String(c.resourceId ?? ""),
      countryId: c.countryId,
      leagueId: c.leagueId,
      versionId: String(c.versionId ?? ""),
      clubId: c.clubId,
      rating: Number(c.rating ?? 0)
    })).filter(c => c.rid);
  }
  return Object.entries(json).map(([rid, c]) => ({
    rid: String(rid),
    countryId: c.countryId,
    leagueId: c.leagueId,
    versionId: String(c.versionId ?? ""),
    clubId: c.clubId,
    rating: Number(c.rating ?? 0)
  }));
}

function bestIdsForAsset(items) {
  const max = Math.max(...items.map(i => i.rating));
  return new Set(items.filter(i => i.rating === max).map(i => i.rid));
}

async function buildMap() {
  const files = await fs.readdir(PLAYERS_DIR);
  const outMap = {};

  // globale Sets für eindeutige IDs
  const allIds        = new Set();
  const noBaseIds     = new Set();
  const onlyBestIds   = new Set();
  const onlyBestSpec  = new Set();

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const raw = JSON.parse(await fs.readFile(path.join(PLAYERS_DIR, file), "utf8"));
    const items = normalizeAssetFile(raw);
    if (!items.length) continue;

    const bestIds = bestIdsForAsset(items);

    for (const i of items) {
      // Eintrag schreiben
      outMap[i.rid] = {
        c: i.countryId,
        l: i.leagueId,
        v: i.versionId,
        club: i.clubId,
        m: 1, // all
      };

      // eindeutige Zähler
      allIds.add(i.rid);
      if (!BASE_VERSION_IDS.has(i.versionId)) {
        outMap[i.rid].m |= 2;
        noBaseIds.add(i.rid);
      }
      if (bestIds.has(i.rid)) {
        outMap[i.rid].m |= 4;
        onlyBestIds.add(i.rid);
        if (!BASE_VERSION_IDS.has(i.versionId)) {
          outMap[i.rid].m |= 8;
          onlyBestSpec.add(i.rid);
        }
      }
    }
  }

  const payload = {
    meta: {
      totalAll:           allIds.size,
      totalNoBase:        noBaseIds.size,
      totalOnlyBest:      onlyBestIds.size,
      totalOnlyBestSpecial: onlyBestSpec.size,
      updatedAt: new Date().toISOString(),
    },
    data: outMap,
  };

  await fs.mkdir(INDEX_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");

  console.log(`✔ resourceMap.json geschrieben – ${allIds.size} Karten`);
  console.log("Meta:", payload.meta);
}

buildMap().catch(err => {
  console.error("Fehler beim Erstellen der resourceMap:", err);
  process.exit(1);
});
