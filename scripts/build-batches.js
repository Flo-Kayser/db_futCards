import fs from "fs/promises";
import path from "path";
import { PICK_FIELDS } from "./helpers/constantsHelper.js";

const INPUT_ALL_CARDS = path.join("db", "core-data", "all-cards.json");
const INPUT_FETCHED_COLLECTIONS = path.join(
  "db",
  "core-data",
  "collections.json"
);
const OUT_INDEX_DIR = path.join("db", "index-data", "batches");
const OUT_FILE_TOTW = path.join(OUT_INDEX_DIR, "index-totw-batches.json");
const OUT_FILE_OTHER = path.join(OUT_INDEX_DIR, "index-other-batches.json");
const OUT_BATCHES_DIR = path.join("db", "batches");

function pickFields(obj, fields) {
  const out = {};
  for (const key of fields) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  if (obj.cardName !== undefined) out.cardName = obj.cardName;
  if (obj.name !== undefined) out.name = obj.name;
  return out;
}

async function buildBatches() {
  console.log("📦 Starting to build batches...");
  const allCards = JSON.parse(await fs.readFile(INPUT_ALL_CARDS, "utf-8"));
  const fetchedCollections = JSON.parse(
    await fs.readFile(INPUT_FETCHED_COLLECTIONS, "utf-8")
  );

  const findPlayerData = (id) => {
    const card = allCards.find((card) => card.resourceId === id);
    return card ? pickFields(card, PICK_FIELDS) : null;
  };

  const totwCollections = fetchedCollections
    .filter(
      (c) =>
        c.name.toLowerCase().includes("totw") ||
        c.name.toLowerCase().includes("team of the week")
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      allIds: c.allIds,
      highlightedPlayers:
        c.highlightedIds
          ?.slice(0, 6)
          .map(findPlayerData)
          .filter(Boolean)
          .sort((a, b) => b.rating - a.rating) ?? [],
    }));
  const otherCollections = fetchedCollections
    .filter(
      (c) =>
        !c.name.toLowerCase().includes("totw") &&
        !c.name.toLowerCase().includes("team of the week")
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      allIds: c.allIds,
      highlightedPlayers:
        c.highlightedIds
          ?.slice(0, 6)
          .map(findPlayerData)
          .filter(Boolean)
          .sort((a, b) => b.rating - a.rating) ?? [],
    }));

  fs.mkdir(OUT_INDEX_DIR, { recursive: true });
  fs.writeFile(OUT_FILE_TOTW, JSON.stringify(totwCollections, null, 2));
  fs.writeFile(OUT_FILE_OTHER, JSON.stringify(otherCollections, null, 2));

  console.log("Index files written.");

  fs.mkdir(OUT_BATCHES_DIR, { recursive: true });

  const allCollections = [...totwCollections, ...otherCollections];
  for (const c of allCollections) {
    const players =
      c.allIds
        ?.map(findPlayerData)
        ?.filter(Boolean)
        .sort((a, b) => b.rating - a.rating) || [];

    const filePath = path.join(OUT_BATCHES_DIR, `${c.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(players, null, 2));
  }
  console.log("Batch files written.");
}

buildBatches().catch((error) => {
  console.error("Error building batches:", error);
});
