import fs from "fs/promises";
import path from "path";
import { remapVersionId, pick } from "./helperFunctions/remapVersionId.js";
import { PICK_FIELDS } from "./helperFunctions/constantsHelper.js";

const INPUT = path.join("db", "core-data", "all-cards.json");
const OUT_DIR = path.join("db", "players");

async function main() {
  console.time("buildPlayersJson");
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const raw = await fs.readFile(INPUT, "utf8");
  const cards = JSON.parse(raw);
  if (!Array.isArray(cards)) throw new Error("Invalid all-cards.json");

  const perPlayer = new Map();

  for (const card of cards) {
    if (!card) continue;

    const assetId = String(card.assetId ?? "");
    const resourceId = String(card.resourceId ?? "");
    if (!assetId || !resourceId) continue;

    if (!perPlayer.has(assetId)) perPlayer.set(assetId, {});
    const playerObj = perPlayer.get(assetId);

    if (!playerObj.cardName && card.cardName)
      playerObj.cardName = String(card.cardName);
    if (!playerObj.name && card.name) playerObj.name = String(card.name);

    const cardVersionData = pick(card, PICK_FIELDS);

    const rawVersionId = cardVersionData.versionId ?? card.versionId;
    const mappedVersionId = remapVersionId(
      rawVersionId,
      card.versionLevel ?? card.level ?? null
    );

    cardVersionData.versionId = mappedVersionId;
    if (rawVersionId !== mappedVersionId) {
      cardVersionData.originalVersionId = rawVersionId;
    }

    playerObj[resourceId] = cardVersionData;
  }

  let written = 0;
  for (const [assetId, payload] of perPlayer.entries()) {
    const filePath = path.join(OUT_DIR, `${assetId}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    written++;
  }

  console.timeEnd("buildPlayersJson");
  console.log(`Wrote ${written} player files to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
