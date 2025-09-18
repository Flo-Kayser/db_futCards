import fs from "fs/promises";
import path from "path";

const BATCH_SIZE = 50;

const OUT_FILE = path.join("db", "core-data", "all-cards.json");
const BASE_URL = "https://api-fc26.easysbc.io";
const CARDS_ENDPOINT = (page) => `/players?page=${page}`;

// Hilfsfunktion: lädt eine einzelne Seite
async function fetchPage(page) {
  const res = await fetch(BASE_URL + CARDS_ENDPOINT(page));
  if (!res.ok) throw new Error(`HTTP ${res.status} für Seite ${page}`);
  const data = await res.json();
  return data?.players ?? [];
}

async function main() {
  try {
    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });

    // Erst mal Seite 1 holen, um totalPages zu erfahren
    const firstRes = await fetch(BASE_URL + CARDS_ENDPOINT(1));
    if (!firstRes.ok) throw new Error(`HTTP ${firstRes.status}`);
    const firstData = await firstRes.json();

    const totalPages = firstData?.totalPages ?? 1;
    const allCards = [...(firstData?.players ?? [])];

    // Ab Seite 2 alle restlichen Seiten in 50er-Batches parallel laden
    const pages = [];
    for (let p = 2; p <= totalPages; p++) pages.push(p);

    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      const batch = pages.slice(i, i + BATCH_SIZE);
      console.log(`⏳ Lade Seiten ${batch[0]}–${batch[batch.length - 1]} …`);
      const batchResults = await Promise.all(batch.map(fetchPage));
      for (const players of batchResults) allCards.push(...players);
    }

    await fs.writeFile(OUT_FILE, JSON.stringify(allCards, null, 2), "utf8");
    console.log(`✅ ${allCards.length} Karten gespeichert in ${OUT_FILE}`);
  } catch (err) {
    console.error("Fehler beim Fetch:", err);
  }
}

main();
