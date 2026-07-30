import { qsa, qs } from "./ui.js";

const icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 18V8m0 0 4 4m-4-4L8 4m12 2v10m0 0-4-4m4 4-4 4M8 18h8M9 7h6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const features = [
  ["Organização de entregas", "Centralize endereços, observações e status."], ["Sequência otimizada", "Receba uma ordem sugerida para suas paradas."],
  ["Geolocalização", "Comece de onde estiver ou escolha outro ponto."], ["Waze e Google Maps", "Abra a próxima entrega no app que preferir."],
  ["Endereços favoritos", "Reutilize destinos frequentes com rapidez."], ["Histórico de rotas", "Consulte jornadas e entregas concluídas."],
  ["Acompanhamento", "Veja parada atual, próxima e progresso da rota."], ["Sincronização segura", "Mantenha seus dados vinculados à sua conta."],
  ["Funciona offline", "Continue usando dados locais e sincronize depois."], ["PWA", "Adicione à tela inicial sem depender de uma loja."]
];
const faqs = [
  ["Preciso instalar um aplicativo?", "Não. O Luvit funciona no navegador e também pode ser adicionado à tela inicial como um PWA."],
  ["Quais cidades são atendidas?", "O Luvit não limita você a uma cidade. A disponibilidade de endereços e rotas depende dos serviços de mapas utilizados."],
  ["Funciona bem no celular?", "Sim. A interface foi desenhada para celulares, tablets e computadores."],
  ["Posso usar Waze e Google Maps?", "Sim. Durante a rota, você pode abrir a parada atual no Waze ou no Google Maps."],
  ["Meus dados ficam seguros?", "Com o Supabase configurado, políticas de acesso garantem que cada conta acesse apenas os próprios dados."],
  ["Funciona offline?", "A interface e dados recentes permanecem disponíveis. Consultas de endereço, mapas e novas rotas dependem de internet; alterações locais sincronizam ao reconectar."],
  ["Como faço para cancelar?", "Você pode deixar de usar a plataforma quando quiser. Condições comerciais serão apresentadas antes de qualquer contratação."],
  ["Existe período gratuito?", "Você pode criar sua conta gratuitamente. Eventuais limites e planos são informados com transparência na plataforma."]
];
const featureGrid = qs("#feature-grid");
features.forEach(([title, description]) => { const article = document.createElement("article"); article.className = "feature-card"; const iconBox = document.createElement("div"); iconBox.className = "icon-box"; iconBox.innerHTML = icon; const h3 = document.createElement("h3"); h3.textContent = title; const p = document.createElement("p"); p.textContent = description; article.append(iconBox, h3, p); featureGrid?.append(article); });
const faqList = qs("#faq-list");
faqs.forEach(([question, answer], i) => { const item = document.createElement("div"); item.className = "faq-item"; const button = document.createElement("button"); button.className = "faq-question"; button.id = `faq-button-${i}`; button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-controls", `faq-answer-${i}`); const text = document.createElement("span"); text.textContent = question; const mark = document.createElement("span"); mark.textContent = "+"; const panel = document.createElement("div"); panel.className = "faq-answer"; panel.id = `faq-answer-${i}`; panel.setAttribute("role", "region"); panel.setAttribute("aria-labelledby", button.id); panel.textContent = answer; button.append(text, mark); button.addEventListener("click", () => { const open = button.getAttribute("aria-expanded") === "true"; button.setAttribute("aria-expanded", String(!open)); mark.textContent = open ? "+" : "−"; }); item.append(button, panel); faqList?.append(item); });
qs("#faq-schema").textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })) });
const menuButton = qs("#menu-button"), nav = qs("#site-nav"), header = qs("#site-header");
menuButton?.addEventListener("click", () => { const open = nav.classList.toggle("open"); menuButton.setAttribute("aria-expanded", String(open)); });
qsa("#site-nav a").forEach(link => link.addEventListener("click", () => { nav.classList.remove("open"); menuButton?.setAttribute("aria-expanded", "false"); }));
const sections = qsa("main section[id]");
const observe = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) qsa("#site-nav a").forEach(a => { const active = a.hash === `#${entry.target.id}`; a.classList.toggle("active", active); if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }); }), { rootMargin: "-35% 0px -55%" });
sections.forEach(section => observe.observe(section));
window.addEventListener("scroll", () => header?.classList.toggle("compact", scrollY > 30), { passive: true });
const calculate = () => { const km = +qs("#km-dia").value || 0, days = +qs("#dias-mes").value || 0, consumption = +qs("#consumo").value || 1, price = +qs("#combustivel").value || 0, reduction = +qs("#reducao").value || 0; const savedKm = km * days * reduction / 100, liters = savedKm / consumption; qs("#reducao-output").textContent = `${reduction}%`; qs("#resultado-km").textContent = `${savedKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`; qs("#resultado-litros").textContent = `${liters.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} l`; qs("#resultado-valor").textContent = (liters * price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); };
qs("#calculator")?.addEventListener("input", calculate); calculate(); qs("#current-year").textContent = new Date().getFullYear();
if (window.LUVIT_CONFIG?.canonicalUrl) qs("#canonical")?.setAttribute("href", `${window.LUVIT_CONFIG.canonicalUrl.replace(/\/$/, "")}/`);
if ("serviceWorker" in navigator && location.protocol !== "file:") window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
