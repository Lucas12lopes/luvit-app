export const formatDistance = meters => meters == null ? "—" : meters >= 1000 ? `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : `${Math.round(meters)} m`;
export const formatDuration = seconds => { if (seconds == null) return "—"; const minutes = Math.round(seconds / 60); return minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`; };
export const formatDate = value => value ? new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const formatTime = value => value ? new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
export const plural = (count, singular, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;
