import fs from "fs/promises";
import path from "path";

const SOURCE_URL = "https://api.easysbc.io/players/version-assets";
const OUT_FILE = path.join("db", "core-data", "versions-fetched-data.json");

async function main() {
  try {
    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });

    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();

    await fs.writeFile(OUT_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error fetching version data:", error);
  }
}

main();
