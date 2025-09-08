import * as constants from "./constantsHelper.js";
const { EN_TO_DE_COUNTRIES } = constants;

export function remapVersionId(originalVersionId, ratingRaw) {
  const v = Number(originalVersionId);
  const r = Number(ratingRaw);
  if (Number.isNaN(v) || Number.isNaN(r)) return String(originalVersionId);

  const band = r < 65 ? 0 : r < 75 ? 1 : 2;

  if (v === 0) {
    return String(2000 + band);
  }
  if (v === 1) {
    return String(3000 + band);
  }
  return String(originalVersionId);
}

export function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(obj, key) &&
      obj[key] !== undefined
    ) {
      out[key] = obj[key];
    }
  }
  return out;
}

export function translateCountryNameToGerman(enName = "") {
  const normalized = (enName || "")
    .replace(/\u2019/g, "'")
    .replace(/ \(.*\)$/, "")
    .trim();

  return (
    EN_TO_DE_COUNTRIES[normalized] ||
    EN_TO_DE_COUNTRIES[enName] ||
    enName ||
    null
  );
}