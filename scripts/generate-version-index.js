import fs from "fs/promises";
import path from "path";

const VERSIONS_DIR = path.join("db", "versions");
const INDEX_DIR    = path.join("db", "index-data");
const INDEX_FILE   = path.join(INDEX_DIR, "versionIndex.json");
const META_FILE    = path.join(INDEX_DIR, "metaIndex.json");
const ASSETS_INPUT = path.join("db", "core-data", "versions-fetched-data.json");

const LEVEL_PREFIX = { 1: "Bronze ", 2: "Silver ", 3: "Gold " };

const readJson  = (file) => fs.readFile(file, "utf8").then(JSON.parse);
const writeJson = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");

async function upsertMetaFlatCounts(file, counts) {
  let obj = {};
  try { obj = await readJson(file); } catch {}
  Object.assign(obj, counts);
  const tmp = file + ".tmp";
  await writeJson(tmp, obj);
  await fs.rename(tmp, file);
}

function extractLarge(asset, level) {
  const node = asset?.large && typeof asset.large === "object"
    ? (level != null ? asset.large?.[level] : asset.large)
    : null;
  const obj = node && typeof node === "object" ? node : {};
  return { url: obj.url ?? null, colors: obj.colors ?? null };
}

function normalizeAssets(root) {
  if (!root) return [];
  return Array.isArray(root) ? root : Object.entries(root).map(([id, obj]) => ({ id, ...obj }));
}

function toDetails(asset, level, prefix = "") {
  const { name, hasStrip, createdAt } = asset ?? {};
  const { url, colors } = extractLarge(asset, level);
  return {
    name: name ? prefix + name : null,
    hasStrip: hasStrip ?? null,
    createdAt: createdAt ?? null,
    url,
    primaryColor: '#' + colors?.topText ?? null,
    secondaryColor: '#' + colors?.strip ?? null,
    tertiaryColor: '#' + colors?.lines ?? null,
  };
}

function numericLevels(asset) {
  return asset?.large
    ? Object.keys(asset.large)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 1)
        .sort((a, b) => a - b)
    : [];
}

function buildDetailsMap(rawAssets) {
  const map = new Map();

  for (const asset of normalizeAssets(rawAssets)) {
    const idNum = Number(asset?.id);
    if (!Number.isFinite(idNum)) continue;

    const hasLevels = Boolean(asset?.hasLevels);

    if (!hasLevels) {
      map.set(String(idNum), toDetails(asset));
      continue;
    }

    const levels = numericLevels(asset);
    if ((idNum === 0 || idNum === 1) && levels.length) {
      const base = idNum === 0 ? 2000 : 3000;
      for (const lvl of levels) {
        map.set(String(base + lvl - 1), toDetails(asset, lvl, LEVEL_PREFIX[lvl] ?? ""));
      }
      continue;
    }

    if (idNum === 3) {
      map.set("3", toDetails(asset, 1));
      continue;
    }

    map.set(String(idNum), toDetails(asset, 1));
  }

  return map;
}

function buildBasicRemappedIdSet(rawAssets) {
  const basics = new Set();
  for (const asset of normalizeAssets(rawAssets)) {
    const idNum = Number(asset?.id);
    if (!(idNum === 0 || idNum === 1)) continue;

    const levels = numericLevels(asset);
    if (!levels.length) continue;

    const base = idNum === 0 ? 2000 : 3000;
    for (const lvl of levels) basics.add(String(base + lvl - 1));
  }
  return basics;
}

async function main() {
  console.log("build-version-index");
  console.time("build-version-index");
  await fs.mkdir(INDEX_DIR, { recursive: true });

  let detailsMap = new Map();
  let basicVersionIds = new Set();
  try {
    const assetsRaw = await readJson(ASSETS_INPUT);
    detailsMap      = buildDetailsMap(assetsRaw);
    basicVersionIds = buildBasicRemappedIdSet(assetsRaw);
    console.log(`details mapped: ${detailsMap.size}, basics mapped: ${basicVersionIds.size}`);
  } catch {
    console.warn("versions-fetched-data.json not found/invalid → skipping details enrichment");
  }

  const versionFiles = (await fs.readdir(VERSIONS_DIR)).filter((f) => f.endsWith(".json"));

  const entries = await Promise.all(
    versionFiles.map(async (fileName) => {
      const versionId = path.basename(fileName, ".json");
      const filePath = path.join(VERSIONS_DIR, fileName);
      const mapping  = await readJson(filePath);
      const count    = Object.keys(mapping).length;
      return [
        versionId,
        {
          count,
          file: `db/versions/${fileName}`,
          details: detailsMap.get(String(versionId)) ?? null,
        },
      ];
    })
  );

  const versions              = Object.fromEntries(entries);
  const totalCards            = entries.reduce((sum, [, v]) => sum + v.count, 0);
  const totalVersions         = Object.keys(versions).length;
  const basicVersionsPresent  = entries.reduce((n, [id]) => n + (basicVersionIds.has(String(id)) ? 1 : 0), 0);
  const totalVersionsWithoutBase = totalVersions - basicVersionsPresent;

  const totalCardsWithoutBase = entries.reduce(
    (sum, [versionId, v]) => sum + (basicVersionIds.has(String(versionId)) ? 0 : v.count),
    0
  );

  const indexData = {
    versions,
    meta: {
      totalVersions,
      totalVersionsWithoutBase,
      updatedAt: new Date().toISOString(),
    },
  };
  await writeJson(INDEX_FILE, indexData);

  await upsertMetaFlatCounts(META_FILE, {
    totalCards,
    totalCardsWithoutBase,
    totalVersions,
    totalVersionsWithoutBase,
  });

  console.timeEnd("build-version-index");
  console.log(`wrote index → ${INDEX_FILE}`);
  console.log(`updated meta → ${META_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
