import { localStore, normalize } from "../storage.js";
import { fetchWithTimeout } from "./http.js";

let nominatimLastRequest = 0;
let nominatimQueue = Promise.resolve();

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value || "").trim();
const joinPresent = (items, separator) => items.map(clean).filter(Boolean).join(separator);

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

export async function searchAddresses(query, bias, { signal } = {}) {
  const term = clean(query);
  if (term.length < 3) return [];
  if (!navigator.onLine) throw new Error("OFFLINE");
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

async function performGeocode(address, bias) {
  const key = normalize(address);
  const cache = localStore.getGeoCache();
  if (cache[key]) return { ...cache[key], cached: true };
  if (!navigator.onLine) throw new Error("OFFLINE");
  const sinceLast = Date.now() - nominatimLastRequest;
  if (sinceLast < 1000) await wait(1000 - sinceLast);
  nominatimLastRequest = Date.now();
  const params = new URLSearchParams({ q: clean(address), format: "jsonv2", limit: "1", addressdetails: "1", countrycodes: "br", "accept-language": "pt-BR" });
  if (Number.isFinite(+bias?.lat) && Number.isFinite(+bias?.lon)) params.set("viewbox", `${bias.lon - 2},${bias.lat + 2},${bias.lon + 2},${bias.lat - 2}`);
  const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { headers: { Accept: "application/json" } }, 10000);
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  const [item] = await response.json();
  if (!item) return null;
  const details = item.address || {};
  const street = clean(details.road || details.pedestrian || details.residential || details.footway);
  const number = clean(details.house_number);
  const neighborhood = clean(details.suburb || details.neighbourhood || details.city_district);
  const city = clean(details.city || details.town || details.municipality || details.village);
  const state = clean(details.state);
  const postcode = clean(details.postcode);
  const label = joinPresent([street, number], ", ") || clean(address);
  const detail = joinPresent([neighborhood, joinPresent([city, state], " - "), postcode], " · ");
  const result = { address: joinPresent([label, detail], " — "), label, detail, latitude: +item.lat, longitude: +item.lon, neighborhood: neighborhood || null, city: city || null, state: state || null, postcode: postcode || null };
  cache[key] = result;
  cache[normalize(result.address)] = result;
  localStore.saveGeoCache(cache);
  return result;
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
