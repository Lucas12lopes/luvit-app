import { localStore, normalize } from "../storage.js";
import { fetchWithTimeout } from "./http.js";

let nominatimLastRequest = 0;
let nominatimQueue = Promise.resolve();

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value || "").trim();
const joinPresent = (items, separator) => items.map(clean).filter(Boolean).join(separator);

const TYPE_TOKENS = new Set(["rua", "r", "avenida", "av", "travessa", "tv", "alameda", "al", "estrada", "est", "rodovia", "rod", "praca", "pc", "pca"]);
const fold = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

function analyzeBrAddress(input) {
  const raw = clean(input);
  const main = (raw.split(/[,;·|—–]/)[0] || raw).trim();
  const tokens = fold(main).split(" ").filter(Boolean);
  const cleaned = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^\d{8}$/.test(token)) continue;
    if (/^\d{5}$/.test(token) && tokens[i + 1] && /^\d{3}$/.test(tokens[i + 1])) { i += 1; continue; }
    cleaned.push(token);
  }
  let words = cleaned.slice();
  let type = null;
  if (words.length && TYPE_TOKENS.has(words[0])) { type = words[0]; words = words.slice(1); }
  let number = null;
  const lastToken = words[words.length - 1];
  if (lastToken && /^\d+[a-z]?$/i.test(lastToken)) { number = lastToken; words.pop(); }
  const street = words.join(" ");
  const name = [street, number].filter(Boolean).join(" ");
  return { type, name, street, number, raw };
}

function buildQueries(input) {
  const a = analyzeBrAddress(input);
  const raw = clean(input);
  const out = [raw];
  if (a.name && a.name !== raw) out.push(a.name);
  if (a.street && a.street !== a.name && a.street !== raw) out.push(a.street);
  return out.filter((q, i, arr) => clean(q).length >= 3 && arr.indexOf(q) === i);
}

function enrichResult(result, parsed) {
  const typed = parsed.number;
  const provider = clean(result.number);
  result.typedNumber = typed || null;
  result.providerNumber = provider || null;
  result.numberMatch = !!(typed && provider && String(typed).toLowerCase() === String(provider).toLowerCase());
  result.numberConfirmed = !!provider;
  return result;
}

function rankResults(results, bias) {
  const bx = +bias?.lat, by = +bias?.lon;
  const useBias = Number.isFinite(bx) && Number.isFinite(by);
  const dist = r => useBias ? Math.hypot(r.latitude - bx, (r.longitude - by) * Math.cos(bx * Math.PI / 180)) : 0;
  return results.sort((a, b) => ((b.numberMatch ? 1 : 0) - (a.numberMatch ? 1 : 0)) || (dist(a) - dist(b)) || (normalize(b.label || b.address).length - normalize(a.label || a.address).length));
}

function formatPhotonFeature(feature) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !Number.isFinite(+coordinates[0]) || !Number.isFinite(+coordinates[1])) return null;
  const street = clean(properties.street || properties.name);
  const number = clean(properties.housenumber);
  const neighborhood = clean(properties.district || properties.suburb || properties.locality);
  const city = clean(properties.city || properties.locality || properties.county);
  const state = clean(properties.state);
  const postcode = clean(properties.postcode);
  const country = clean(properties.country);
  const countrycode = clean(properties.countrycode).toUpperCase();
  const label = joinPresent([street, number], ", ") || joinPresent([city, state], " - ");
  if (!label) return null;
  const cityState = joinPresent([city, state], " - ");
  const detail = joinPresent([neighborhood, cityState, postcode], " · ");
  const address = joinPresent([label, detail], " — ");
  return { address, label, detail, street, number, neighborhood: neighborhood || null, city: city || null, state: state || null, postcode: postcode || null, country: country || null, countrycode: countrycode || null, latitude: +coordinates[1], longitude: +coordinates[0] };
}

async function photonSearch(term, bias, signal) {
  const params = new URLSearchParams({ q: term, limit: "8", countrycode: "BR", zoom: "14", location_bias_scale: "0.25" });
  if (Number.isFinite(+bias?.lat) && Number.isFinite(+bias?.lon)) {
    params.set("lat", String(bias.lat));
    params.set("lon", String(bias.lon));
  }
  const response = await fetchWithTimeout(`https://photon.komoot.io/api/?${params.toString()}`, { signal }, 9000);
  if (!response.ok) throw new Error(`Photon HTTP ${response.status}`);
  const data = await response.json();
  const unique = new Map();
  for (const feature of data.features || []) {
    const result = formatPhotonFeature(feature);
    if (!result) continue;
    const key = `${normalize(result.address)}|${result.latitude.toFixed(5)}|${result.longitude.toFixed(5)}`;
    if (!unique.has(key)) unique.set(key, result);
  }
  return [...unique.values()];
}

export async function searchAddresses(query, bias, { signal } = {}) {
  const term = clean(query);
  if (term.length < 3) return [];
  if (!navigator.onLine) throw new Error("OFFLINE");
  const parsed = analyzeBrAddress(term);
  const queries = buildQueries(term);
  const seen = new Set();
  let results = [];
  for (const q of queries) {
    const batch = await photonSearch(q, bias, signal);
    if (!batch.length) continue;
    for (const result of batch) {
      const key = `${normalize(result.address)}|${result.latitude.toFixed(5)}|${result.longitude.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(enrichResult(result, parsed));
    }
    break;
  }
  return rankResults(results, bias);
}

async function performGeocode(address, bias) {
  const parsed = analyzeBrAddress(address);
  const queries = buildQueries(address);
  const cache = localStore.getGeoCache();
  for (const q of queries) {
    const key = normalize(q);
    if (cache[key]) return enrichResult({ ...cache[key], cached: true }, analyzedFor(q, address));
    if (!navigator.onLine) throw new Error("OFFLINE");
    const sinceLast = Date.now() - nominatimLastRequest;
    if (sinceLast < 1000) await wait(1000 - sinceLast);
    nominatimLastRequest = Date.now();
    const params = new URLSearchParams({ q: clean(q), format: "jsonv2", limit: "1", addressdetails: "1", countrycodes: "br", "accept-language": "pt-BR" });
    if (Number.isFinite(+bias?.lat) && Number.isFinite(+bias?.lon)) params.set("viewbox", `${bias.lon - 2},${bias.lat + 2},${bias.lon + 2},${bias.lat - 2}`);
    const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { headers: { Accept: "application/json" } }, 10000);
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    const [item] = await response.json();
    if (!item) continue;
    const details = item.address || {};
    const street = clean(details.road || details.pedestrian || details.residential || details.footway);
    const number = clean(details.house_number);
    const neighborhood = clean(details.suburb || details.neighbourhood || details.city_district);
    const city = clean(details.city || details.town || details.municipality || details.village);
    const state = clean(details.state);
    const postcode = clean(details.postcode);
    const label = joinPresent([street, number], ", ") || clean(q);
    const detail = joinPresent([neighborhood, joinPresent([city, state], " - "), postcode], " · ");
    const base = { address: joinPresent([label, detail], " — "), label, detail, latitude: +item.lat, longitude: +item.lon, neighborhood: neighborhood || null, city: city || null, state: state || null, postcode: postcode || null };
    const result = enrichResult(base, parsed);
    cache[key] = result;
    cache[normalize(result.address)] = result;
    localStore.saveGeoCache(cache);
    return result;
  }
  return null;
}

function analyzedFor(q, address) {
  const parsed = analyzeBrAddress(address);
  if (clean(q) === clean(address)) return parsed;
  return analyzeBrAddress(q);
}

export function geocode(address, bias) {
  const task = nominatimQueue.then(() => performGeocode(address, bias));
  nominatimQueue = task.catch(() => undefined);
  return task;
}

export function reverseGeocode(latitude, longitude) {
  const addressKey = `reverse:${Number(latitude).toFixed(5)},${Number(longitude).toFixed(5)}`;
  const cache = localStore.getGeoCache();
  if (cache[addressKey]) return Promise.resolve({ ...cache[addressKey], cached: true });
  const task = nominatimQueue.then(async () => {
    if (!navigator.onLine) throw new Error("OFFLINE");
    const sinceLast = Date.now() - nominatimLastRequest;
    if (sinceLast < 1000) await wait(1000 - sinceLast);
    nominatimLastRequest = Date.now();
    const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude), format: "jsonv2", addressdetails: "1", zoom: "18", "accept-language": "pt-BR" });
    const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, { headers: { Accept: "application/json" } }, 10000);
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    const item = await response.json();
    const details = item.address || {};
    const street = clean(details.road || details.pedestrian || details.residential || details.footway || details.amenity);
    const number = clean(details.house_number);
    const neighborhood = clean(details.suburb || details.neighbourhood || details.city_district);
    const city = clean(details.city || details.town || details.municipality || details.village);
    const state = clean(details.state);
    const postcode = clean(details.postcode);
    const label = joinPresent([street, number], ", ") || "Local marcado no mapa";
    const detail = joinPresent([neighborhood, joinPresent([city, state], " - "), postcode], " · ");
    const result = { address: joinPresent([label, detail], " — "), label, detail, street, number, latitude: +latitude, longitude: +longitude, neighborhood: neighborhood || null, city: city || null, state: state || null, postcode: postcode || null };
    cache[addressKey] = result; localStore.saveGeoCache(cache); return result;
  });
  nominatimQueue = task.catch(() => undefined);
  return task;
}
