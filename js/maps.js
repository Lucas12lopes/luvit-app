import { searchAddresses } from "./services/geocoding.js";

const DEFAULT_START = { lat: -25.534, lon: -49.184, label: "São José dos Pinhais (preferência inicial)" };

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

export function createMap(elementId, options = {}) {
  if (!window.L) return null;
  const element = document.getElementById(elementId);
  if (!element) return null;
  const map = L.map(elementId, { zoomControl: options.zoomControl ?? false, scrollWheelZoom: options.scrollWheelZoom ?? false }).setView([DEFAULT_START.lat, DEFAULT_START.lon], 12);
  map._luvitLayers = {
    light: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }),
    dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap &copy; CARTO" })
  };
  map._luvitLayerName = "light"; map._luvitLayers.light.addTo(map);
  return map;
}

export function toggleMapLayer(map) { if (!map?._luvitLayers) return; map.removeLayer(map._luvitLayers[map._luvitLayerName]); map._luvitLayerName = map._luvitLayerName === "light" ? "dark" : "light"; map._luvitLayers[map._luvitLayerName].addTo(map); }

export function drawRoute(map, start, stops, geometry, options = {}) {
  if (!map) return;
  map.eachLayer(layer => { if (!(layer instanceof L.TileLayer)) map.removeLayer(layer); });
  const coordinates = [];
  if (start) { coordinates.push([start.lat, start.lon]); L.marker([start.lat, start.lon], { icon: L.divIcon({ className: "", html: '<span class="start-marker" aria-label="Ponto inicial">S</span>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).bindTooltip("Ponto inicial").addTo(map); }
  stops.filter(stop => stop.latitude != null).forEach((stop, index) => { coordinates.push([stop.latitude, stop.longitude]); const selected = stop.id === options.selectedStopId, active = stop.status === "active"; const marker = L.marker([stop.latitude, stop.longitude], { icon: L.divIcon({ className: "", html: `<span class="number-marker${selected ? " selected" : ""}${active ? " active" : ""}" aria-label="Parada ${index + 1}">${index + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }), keyboard: true, title: `Parada ${index + 1}: ${stop.address}` }).bindTooltip(`${index + 1}. ${stop.address}`).addTo(map); marker.on("click", () => options.onSelectStop?.(stop.id)); });
  if (options.temporaryPoint) { coordinates.push([options.temporaryPoint.latitude, options.temporaryPoint.longitude]); L.marker([options.temporaryPoint.latitude, options.temporaryPoint.longitude], { icon: L.divIcon({ className: "", html: '<span class="start-marker temporary-marker">+</span>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(map); }
  if (geometry?.coordinates) L.geoJSON(geometry, { style: { color: "#f45b0b", weight: 5, opacity: .9 } }).addTo(map);
  else if (coordinates.length > 1) L.polyline(coordinates, { color: "#ff5c00", weight: 4, dashArray: "8 8" }).addTo(map);
  if (coordinates.length && options.fit !== false) map.fitBounds(coordinates, { padding: [35, 35], maxZoom: 15 });
  window.setTimeout(() => map.invalidateSize(), 80);
}

export { DEFAULT_START };
