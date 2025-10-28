import fs from "fs/promises";
import path from "path";

const BASE_URL = "https://www.fut.gg/api/fut/collections/26/?";
const PAGE_ENDPOINT = (page) => `page=${page}`;
const OUT_FILE = path.join("db", "core-data", "collections.json");

const TOTW_1 = {
  id: 1,
  name: "TOTW 1",
  highlightedIds: [
    50570733, 50533774, 50541683, 50590354, 50592984, 50521244,
  ],
  allIds: [
    50570733, 50533774, 50541683, 50590354, 50592984, 50580365, 50508651,
    67335715, 50536173, 50557809, 50605646, 50407246, 50521244, 50548464,
    50572884, 50577691, 50583684, 50590026, 50594046, 50597030, 50604574,
    50608827, 50609602,
  ],
};

const TOTW_2 = {
  id: 2,
  name: "TOTW 2",
  highlightedIds: [
    50559444, 50574092, 50557599, 50558541, 50559899, 50558975,
  ],
  allIds: [
    50559444, 50574092, 50557599, 50558541, 50559899, 50558975, 50577752,
    50568351, 50571778, 50588839, 50546964, 50403375, 50518723, 50548392,
    50551381, 50551440, 50557280, 50575314, 50584652, 50590377, 50597477,
    50598152, 67380259,
  ],
};

const CORNERSTONES_1={
  id: 3,
  name: "Cornerstones 1",
  highlightedIds: [50561790,50543846,50572732,50589182,50588501,50570701],
  allIds: [50561790,50543846,50572732,50589182,50588501,50570701,50572286,50588164,50558964,50549518,50496153,50534715,50551331,50561230,50565204,50567290,50567538,50596717,50598886,50607432]
}

async function fetchCollections() {
  console.log("📦 Starting to fetch collections...");
  let allCollections = [];
  let page = 1;

  while (true) {
    const url = `${BASE_URL}${PAGE_ENDPOINT(page)}`;
    console.log(`Fetching page ${page}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch page ${page}: ${res.status}`);
    const json = await res.json();

    if (json.data && Array.isArray(json.data)) {
      const filtered = json.data.map((item) => ({
        id: item.id,
        name: item.name,
        highlightedIds: item.highlightedPlayerItemEaIds,
        allIds: item.allPlayerItemEaIds,
      }));
      allCollections.push(...filtered);
    }

    if (json.next === null) {
      console.log("Reached last page.");
      break;
    }

    page = json.next;
  }

  allCollections.push(TOTW_2);
  allCollections.push(TOTW_1);
  allCollections.push(CORNERSTONES_1);

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(allCollections, null, 2));
  console.log(`✅ Saved ${allCollections.length} collections to ${OUT_FILE}`);
}

fetchCollections().catch(console.error);
