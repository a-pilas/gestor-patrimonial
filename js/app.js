import { renderDashboard } from "./dashboard.js";
import { renderCatalog } from "./catalog.js";
import { renderPositions } from "./positions.js";
import { renderMovements } from "./movements.js";
import { renderLiabilities } from "./liabilities.js";
import { renderFiscal } from "./fiscal.js";
import { renderAlerts } from "./alerts.js";
import { renderDecisions } from "./decisions.js";
import { renderSimuladores } from "./simuladores.js";
import { renderXray } from "./xray.js";
import { renderSettings } from "./settings.js";
import { ensureUnlocked } from "./lock.js";
import { conectar as conectarDrive, onSyncStatus } from "./sync.js";
import { esModoFamilia, SoloLecturaError } from "./modo.js";
import { iniciarRefresco } from "./familia.js";

await ensureUnlocked();

// Modo familiar: solo lectura. Si algún rincón de la app intenta modificar
// datos, el store lo rechaza con SoloLecturaError; aquí se convierte en un
// aviso discreto en vez de un error.
const familia = esModoFamilia();
function avisar(texto) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.classList.add("visible");
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => el.classList.remove("visible"), 3500);
}
const AVISO_SOLO_LECTURA = "Modo familiar: solo lectura. No se puede cambiar nada desde aquí.";
window.addEventListener("error", (ev) => {
  if (ev.error instanceof SoloLecturaError) {
    ev.preventDefault();
    avisar(AVISO_SOLO_LECTURA);
  }
});
window.addEventListener("unhandledrejection", (ev) => {
  if (ev.reason instanceof SoloLecturaError) {
    ev.preventDefault();
    avisar(AVISO_SOLO_LECTURA);
  }
});

const TODAS_LAS_PESTANAS = [
  { id: "inicio", label: "Inicio", render: renderDashboard },
  { id: "posiciones", label: "Posiciones", render: renderPositions },
  { id: "movimientos", label: "Movimientos", render: renderMovements },
  { id: "fiscalidad", label: "Fiscalidad", render: renderFiscal },
  { id: "alertas", label: "Alertas", render: renderAlerts },
  { id: "decisiones", label: "Decisiones", render: renderDecisions },
  { id: "simuladores", label: "Simuladores", render: renderSimuladores },
  { id: "xray", label: "X-Ray", render: renderXray },
  { id: "activos", label: "Activos", render: renderCatalog },
  { id: "deudas", label: "Deudas", render: renderLiabilities },
  { id: "ajustes", label: "Ajustes", render: renderSettings },
];

// Modo familiar: se oculta "Activos" (es pura gestión del catálogo).
const TABS = familia ? TODAS_LAS_PESTANAS.filter((t) => t.id !== "activos") : TODAS_LAS_PESTANAS;

const content = document.getElementById("content");
const nav = document.getElementById("nav");

function currentTabId() {
  return location.hash.replace("#", "") || "inicio";
}

function renderNav() {
  const current = currentTabId();
  nav.innerHTML = TABS.map(
    (t) => `<a href="#${t.id}" class="nav-item ${t.id === current ? "active" : ""}">${t.label}</a>`
  ).join("");
}

function renderTab() {
  const current = currentTabId();
  const tab = TABS.find((t) => t.id === current) || TABS[0];
  renderNav();
  tab.render(content);
}

if (familia) {
  // Banner de estado fijo bajo las pestañas.
  const banner = document.createElement("div");
  banner.id = "familia-banner";
  nav.insertAdjacentElement("afterend", banner);
}

window.addEventListener("hashchange", renderTab);
renderTab();

// Si este dispositivo ya se conectó a Drive antes, intenta reengancharse en
// segundo plano sin interrumpir el arranque (funciona en local mientras
// tanto). Solo se repinta la pestaña actual cuando de verdad llegan datos
// nuevos de Drive (pull) o hay un conflicto que resolver — nunca tras un
// push rutinario de tus propios cambios, porque eso borraría cualquier
// edición sin guardar que tengas en pantalla (p.ej. un simulador a medio
// rellenar antes de pulsar "Calcular").
if (familia) {
  // Sin sincronización de escritura: solo lectura periódica del fichero compartido.
  iniciarRefresco(renderTab);
} else {
  onSyncStatus((estado) => {
    if (estado.tipo === "conflicto" || (estado.tipo === "sincronizado" && estado.origen === "pull")) renderTab();
  });
  conectarDrive({ interactivo: false });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
