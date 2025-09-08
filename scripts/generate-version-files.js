import fs from "fs/promises";
import path from "path";
import { remapVersionId, pick } from "./helperFunctions/remapVersionId.js";
import { PICK_FIELDS } from "./helperFunctions/constantsHelper.js";
const INPUT = path.join("db", "core-data", "all-cards.json");
const OUT_DIR = path.join("db", "versions");

async function main() {
  console.log("starting version file generation");
  console.time("genVersionFiles");

  await fs.rmdir(OUT_DIR, { recursive: true, force: true });
  console.log(`Cleared ${OUT_DIR}`);
  await fs.mkdir(OUT_DIR, { recursive: true });

  const raw = await fs.readFile(INPUT, "utf8");
  const cards = JSON.parse(raw);

  if (!Array.isArray(cards)) {
    throw new Error("Invalid all-cards.json");
  }
  console.log(`Read ${cards.length} cards from all-cards.json`);

  const versionMap = new Map();

  for (const card of cards) {
    if (!card) continue;

    const originalVersionId = String(card.versionId);
    const effectiveVersionId = remapVersionId(originalVersionId, card.rating);
    const assetId = String(card.assetId ?? "");
    const resourceId = String(card.resourceId ?? "");

    if (!effectiveVersionId || !assetId || !resourceId) continue;

    if (!versionMap.has(effectiveVersionId)) {
      versionMap.set(effectiveVersionId, {});
    }
    const versionObj = versionMap.get(effectiveVersionId);

    const entry = {
      name: card.name,
      cardName: card.cardName,
      originalVersionId: originalVersionId,
      ...pick(card, PICK_FIELDS),
    };

    entry.versionId = effectiveVersionId;
    versionObj[resourceId] = entry;
  }

  for (const [versionId, mapping] of versionMap.entries()) {
    const fileName = `${versionId}.json`;
    const filePath = path.join(OUT_DIR, fileName);

    await fs.writeFile(filePath, JSON.stringify(mapping, null, 2), "utf8");
  }

  console.timeEnd("genVersionFiles");
  console.log("version file generation complete");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
