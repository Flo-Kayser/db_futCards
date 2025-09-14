import fs from "fs/promises";
import path from "path";
import { remapVersionId, pick } from "./helpers/helperFunctions.js";
import { PICK_FIELDS } from "./helpers/constantsHelper.js";

const INPUT     = path.join("db", "core-data", "all-cards.json");
const OUT_DIR   = path.join("db", "players");
const INDEX_DIR = path.join("db", "index-data");
const META_FILE = path.join(INDEX_DIR, "metaIndex.json");

const readJson  = (file) => fs.readFile(file, "utf8").then(JSON.parse);
const writeJson = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");

// wie in deinem Beispiel: erweitert vorhandenes metaFile statt zu überschreiben
async function upsertMetaFlatCounts(file, counts) {
  let obj = {};
  try { obj = await readJson(file); } catch {}
  Object.assign(obj, counts);
  const tmp = file + ".tmp";
  await writeJson(tmp, obj);
  await fs.rename(tmp, file);
}

async function main() {
  console.time("buildPlayersJson");

  // players-Ordner neu erstellen
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  // meta-Ordner sicherstellen (wir löschen hier NICHTS)
  await fs.mkdir(INDEX_DIR, { recursive: true });

  // Karten einlesen
  const raw = await fs.readFile(INPUT, "utf8");
  const cards = JSON.parse(raw);
  if (!Array.isArray(cards)) throw new Error("Invalid all-cards.json");

  const perPlayer = new Map();

  // Karten pro assetId sammeln
  for (const card of cards) {
    if (!card) continue;

    const assetId = String(card.assetId ?? "");
    const resourceId = String(card.resourceId ?? "");
    if (!assetId || !resourceId) continue;

    if (!perPlayer.has(assetId)) perPlayer.set(assetId, {});
    const playerObj = perPlayer.get(assetId);

    if (!playerObj.cardName && card.cardName) playerObj.cardName = String(card.cardName);
    if (!playerObj.name && card.name) playerObj.name = String(card.name);

    const cardVersionData = pick(card, PICK_FIELDS);

    const rawVersionId = cardVersionData.versionId ?? card.versionId;
    const mappedVersionId = remapVersionId(
      rawVersionId,
      card.cardVersionLevel ?? card.cardLevel ?? card.versionLevel ?? card.level ?? null
    );

    cardVersionData.versionId = mappedVersionId;
    if (rawVersionId !== mappedVersionId) {
      cardVersionData.originalVersionId = rawVersionId;
    }

    playerObj[resourceId] = cardVersionData;
  }

  // einzelne Player-Dateien schreiben
  let written = 0;
  for (const [assetId, payload] of perPlayer.entries()) {
    const filePath = path.join(OUT_DIR, `${assetId}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    written++;
  }

  // --- Meta: onlyBest = Anzahl eindeutiger assetIds ---
  await upsertMetaFlatCounts(META_FILE, {
    totalCardsOnlyBest: perPlayer.size,
  });

  console.timeEnd("buildPlayersJson");
  console.log(`Wrote ${written} player files to ${OUT_DIR}`);
  console.log(`Updated meta → ${META_FILE} (totalCardsOnlyBest=${perPlayer.size})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
