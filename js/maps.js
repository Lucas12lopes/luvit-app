import { localStore, normalize } from "./storage.js";

const DEFAULT_START = { lat: -25.534, lon: -49.184, label: "São José dos Pinhais (preferência inicial)" };
let nominatimLastRequest = 0;
let nominatimQueue = Promise.resolve();

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value || "").trim();
const joinPresent = (items, separator) => items.map(clean).filter(Boolean).join(separator);

export function fetchWithTimeout(url, options = {}, timeout = 9000) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => controller.abort(new DOMException("Timeout", "AbortError")), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abort);
  });
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

export class AddressAutocomplete {
  constructor({ input, list, getBias, onSelect, debounceMs = 400 }) {
    this.input = typeof input === "string" ? document.querySelector(input) : input;
    this.list = typeof list === "string" ? document.querySelector(list) : list;
    this.getBias = getBias;
    this.onSelect = onSelect;
    this.debounceMs = debounceMs;
    this.results = [];
    this.activeIndex = -1;
    this.selected = null;
    this.requestId = 0;
    this.controller = null;
    this.timer = null;
    this.bind();
  }
  bind() {
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-controls", this.list.id);
    this.input.setAttribute("aria-expanded", "false");
    this.list.setAttribute("role", "listbox");
    this.input.addEventListener("input", () => this.schedule());
    this.input.addEventListener("keydown", event => this.onKeydown(event));
    this.input.addEventListener("focus", () => { if (this.results.length) this.open(); });
    document.addEventListener("pointerdown", event => { if (!event.target.closest(`[data-autocomplete-id="${this.list.id}"]`)) this.close(); });
  }
  schedule() {
    this.selected = null;
    this.onSelect?.(null);
    window.clearTimeout(this.timer);
    this.controller?.abort();
    const query = this.input.value.trim();
    if (query.length < 3) { this.results = []; this.close(true); return; }
    if (!navigator.onLine) { this.showState("Você está offline. Digite o endereço completo.", "offline"); return; }
    this.timer = window.setTimeout(() => this.search(query), this.debounceMs);
  }
  async search(query) {
    const currentId = ++this.requestId;
    this.controller?.abort();
    this.controller = new AbortController();
    if (!this.results.length) this.showState("Buscando endereços...", "loading");
    try {
      const results = await searchAddresses(query, this.getBias?.(), { signal: this.controller.signal });
      if (currentId !== this.requestId || query !== this.input.value.trim()) return;
      this.results = results;
      this.activeIndex = -1;
      if (!results.length) this.showState("Nenhum endereço encontrado. Inclua rua, número e cidade.", "empty");
      else this.renderResults();
    } catch (error) {
      if (error.name === "AbortError" || currentId !== this.requestId) return;
      console.error("[Luvit autocomplete]", error);
      if (!this.results.length) this.showState(error.message === "OFFLINE" ? "Você está offline. Digite o endereço completo." : "Não foi possível consultar endereços agora. Tente novamente.", "error");
    }
  }
  renderResults() {
    this.list.replaceChildren();
    this.results.forEach((result, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "suggestion";
      option.id = `${this.list.id}-option-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      const primary = document.createElement("strong");
      primary.textContent = result.label;
      const secondary = document.createElement("small");
      secondary.textContent = result.detail || "Brasil";
      option.append(primary, secondary);
      option.addEventListener("pointerdown", event => event.preventDefault());
      option.addEventListener("click", () => this.select(index));
      this.list.append(option);
    });
    this.open();
  }
  showState(text, state) {
    const item = document.createElement("div");
    item.className = `suggestion-state ${state}`;
    item.setAttribute("role", "status");
    item.textContent = text;
    this.list.replaceChildren(item);
    this.open();
  }
  select(index) {
    const result = this.results[index];
    if (!result) return;
    this.selected = result;
    this.input.value = result.address;
    this.close();
    this.onSelect?.(result);
    this.input.dispatchEvent(new CustomEvent("luvit:address-selected", { detail: result }));
  }
  onKeydown(event) {
    if (event.key === "Escape") { this.close(); return; }
    if (!this.results.length || this.list.hidden) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      this.activeIndex = (this.activeIndex + direction + this.results.length) % this.results.length;
      this.updateActive();
    } else if (event.key === "Enter" && this.activeIndex >= 0) {
      event.preventDefault();
      this.select(this.activeIndex);
    }
  }
  updateActive() {
    [...this.list.querySelectorAll('[role="option"]')].forEach((option, index) => {
      const active = index === this.activeIndex;
      option.setAttribute("aria-selected", String(active));
      option.classList.toggle("active", active);
      if (active) {
        this.input.setAttribute("aria-activedescendant", option.id);
        const listRect = this.list.getBoundingClientRect();
        const optionRect = option.getBoundingClientRect();
        if (optionRect.top < listRect.top || optionRect.bottom > listRect.bottom) option.scrollIntoView({ block: "nearest" });
      }
    });
  }
  open() { this.list.hidden = false; this.input.setAttribute("aria-expanded", "true"); }
  close(clear = false) { this.list.hidden = true; this.input.setAttribute("aria-expanded", "false"); this.input.removeAttribute("aria-activedescendant"); this.activeIndex = -1; if (clear) this.list.replaceChildren(); }
  getSelected() { return this.selected; }
  setSelected(value) { this.selected = value; }
  destroy() { window.clearTimeout(this.timer); this.controller?.abort(); }
}

export function getCurrentLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ ...DEFAULT_START, error: "Geolocalização não disponível." });
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lon: position.coords.longitude, label: "Minha localização" }),
      error => resolve({ ...DEFAULT_START, error: error.code === 1 ? "Permissão de localização negada. Escolha o ponto inicial manualmente." : "Não foi possível obter sua localização." }),
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 300000 }
    );
  });
}

export function createMap(elementId) {
  if (!window.L) return null;
  const element = document.getElementById(elementId);
  if (!element) return null;
  const map = L.map(elementId, { zoomControl: true, scrollWheelZoom: false }).setView([DEFAULT_START.lat, DEFAULT_START.lon], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
  return map;
}

export function drawRoute(map, start, stops, geometry) {
  if (!map) return;
  map.eachLayer(layer => { if (!(layer instanceof L.TileLayer)) map.removeLayer(layer); });
  const coordinates = [];
  if (start) { coordinates.push([start.lat, start.lon]); L.circleMarker([start.lat, start.lon], { radius: 7, color: "#111827", fillOpacity: 1 }).bindTooltip("Início").addTo(map); }
  stops.filter(stop => stop.latitude != null).forEach((stop, index) => { coordinates.push([stop.latitude, stop.longitude]); L.circleMarker([stop.latitude, stop.longitude], { radius: 8, color: "#fff", weight: 3, fillColor: "#ff5c00", fillOpacity: 1 }).bindTooltip(`${index + 1}. ${stop.address}`).addTo(map); });
  if (geometry?.coordinates) L.geoJSON(geometry, { style: { color: "#ff5c00", weight: 5, opacity: .85 } }).addTo(map);
  else if (coordinates.length > 1) L.polyline(coordinates, { color: "#ff5c00", weight: 4, dashArray: "8 8" }).addTo(map);
  if (coordinates.length) map.fitBounds(coordinates, { padding: [35, 35], maxZoom: 15 });
  window.setTimeout(() => map.invalidateSize(), 80);
}

export { DEFAULT_START };
