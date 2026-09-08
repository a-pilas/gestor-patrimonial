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

await ensureUnlocked();

const TABS = [
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

window.addEventListener("hashchange", renderTab);
renderTab();

// Si este dispositivo ya se conectó a Drive antes, intenta reengancharse en
// segundo plano sin interrumpir el arranque (funciona en local mientras
// tanto). Solo se repinta la pestaña actual cuando de verdad llegan datos
// nuevos de Drive (pull) o hay un conflicto que resolver — nunca tras un
// push rutinario de tus propios cambios, porque eso borraría cualquier
// edición sin guardar que tengas en pantalla (p.ej. un simulador a medio
// rellenar antes de pulsar "Calcular").
onSyncStatus((estado) => {
  if (estado.tipo === "conflicto" || (estado.tipo === "sincronizado" && estado.origen === "pull")) renderTab();
});
conectarDrive({ interactivo: false });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
