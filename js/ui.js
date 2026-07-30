export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
export function setLoading(button, loading, label = "Aguarde...") {
  if (!button) return;
  if (loading) { button.dataset.label = button.textContent; button.disabled = true; button.replaceChildren(spinner(), document.createTextNode(` ${label}`)); }
  else { button.disabled = false; button.textContent = button.dataset.label || button.textContent; }
}
function spinner() { const node = document.createElement("span"); node.className = "spinner"; node.setAttribute("aria-hidden", "true"); return node; }
export function toast(message, type = "info") {
  let region = qs(".toast-region");
  if (!region) { region = document.createElement("div"); region.className = "toast-region"; region.setAttribute("aria-live", "polite"); document.body.append(region); }
  const item = document.createElement("div"); item.className = `toast ${type}`; item.textContent = message; region.append(item);
  window.setTimeout(() => item.remove(), 4500);
}
export function formatDistance(meters = 0) { return meters >= 1000 ? `${(meters / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(meters)} m`; }
export function debounce(fn, wait = 350) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }
export function uid() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
export function openDialog(dialog, trigger) { dialog.dataset.triggerId = trigger?.id || ""; if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", ""); document.body.classList.add("modal-open"); }
export function closeDialog(dialog) { dialog.close?.(); dialog.removeAttribute("open"); document.body.classList.remove("modal-open"); const trigger = document.getElementById(dialog.dataset.triggerId); trigger?.focus(); }
