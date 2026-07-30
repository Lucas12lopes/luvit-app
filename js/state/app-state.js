const clone = value => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

export function createAppState(initial) {
  let state = clone(initial);
  const listeners = new Set();
  const notify = (reason = "update") => listeners.forEach(listener => listener(state, reason));
  return {
    get: () => state,
    set(patch, reason) { state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }; notify(reason); return state; },
    update(updater, reason) { const next = updater(clone(state)); if (next) state = next; notify(reason); return state; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

export const initialUiState = {
  view: "dashboard",
  mode: "planning",
  plannerTab: "list",
  stopFilter: "all",
  stopSearch: "",
  selectedStopIds: [],
  selectedStopId: null,
  sidebarCollapsed: localStorage.getItem("luvit:sidebar-collapsed") === "true",
  connection: navigator.onLine ? "online" : "offline",
  sync: "local",
  mapSelection: false,
  optimizationProposal: null
};
