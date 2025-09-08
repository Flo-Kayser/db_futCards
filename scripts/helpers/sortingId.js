// helpers/sortingId.js
export function assignSortIdsByGermanName(itemsMap, preferredByDeName = {}) {
  const norm = (s) => String(s ?? "").replace(/\u2019/g, "'").replace(/ \(.*\)$/, "").trim();
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  // Clone: gleiche Keys behalten!
  const out = Object.fromEntries(
    Object.entries(itemsMap).map(([id, meta]) => [id, { ...meta }])
  );

  // Labels vorbereiten
  const entries = Object.entries(itemsMap).map(([id, meta]) => ({
    id,
    label: norm(meta?.deName ?? meta?.name ?? "")
  }));

  // split: gepinnt vs. ungepinnt
  const pinned = [], unpinned = [];
  for (const e of entries) {
    if (has(preferredByDeName, e.label)) pinned.push({ ...e, pref: Number(preferredByDeName[e.label]) });
    else unpinned.push(e);
  }

  // sortieren
  pinned.sort((a, b) =>
    a.pref - b.pref ||
    a.label.localeCompare(b.label, "de", { sensitivity: "base" }) ||
    a.id.localeCompare(b.id, "de", { numeric: true })
  );
  unpinned.sort((a, b) =>
    a.label.localeCompare(b.label, "de", { sensitivity: "base" }) ||
    a.id.localeCompare(b.id, "de", { numeric: true })
  );

  // sortId nur als Feld setzen – Keys bleiben die originalen IDs
  for (const e of pinned) out[e.id].sortId = e.pref;
  let next = pinned.length + 1;        // kein fillGaps
  for (const e of unpinned) out[e.id].sortId = next++;

  return out; // -> { "<countryId>": { ..., sortId } }
}
