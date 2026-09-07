import { store } from "./store.js";
import { GEO_REGIONS } from "./model.js";
import {
  coberturaLookThrough,
  exposicionGeograficaLookThrough,
  exposicionDivisaLookThrough,
  conclusionesXray,
  estadoRevisionXray,
} from "./metrics.js";

// Reutiliza colores ya validados en el resto de la app (liquidez, inversión
// financiera, riesgo moderado/decidido, mixto) en vez de inventar una
// paleta nueva sin validar para las 5 regiones.
const REGION_COLORS = {
  espana: "#4c9f70",
  europa: "#3d7ab8",
  eeuu: "#cc7a2e",
  emergentes: "#bf4560",
  otros: "#8a5fb0",
};

function fmtEUR(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function fmtPct1(n) {
  if (n == null || isNaN(n)) return "—";
  return `${n.toFixed(1)} %`;
}

function legendRow(color, label, value, total) {
  const pct = total ? (value / total) * 100 : 0;
  return `<div class="legend-row">
    <span class="legend-dot" style="background:${color}"></span>
    <span class="legend-label">${label}</span>
    <span class="legend-value">${fmtEUR(value)}</span>
    <span class="legend-pct">${fmtPct1(pct)}</span>
  </div>`;
}

export function renderXray(container) {
  const cobertura = coberturaLookThrough();
  const geo = exposicionGeograficaLookThrough();
  const divisa = exposicionDivisaLookThrough();
  const conclusiones = conclusionesXray();
  const revision = estadoRevisionXray();

  const revisionCard = `
    <section class="card${revision.toca ? " card-warning" : ""}">
      ${revision.toca ? "<strong>Toca revisar el X-Ray</strong><br/>" : ""}
      <p class="muted">
        ${
          revision.ultima
            ? `Última revisión: ${revision.ultima} (hace ${revision.diasDesde} día${revision.diasDesde === 1 ? "" : "s"}).`
            : "Todavía no has marcado ninguna revisión."
        }
        Los fondos cambian de composición de vez en cuando — merece la pena repasar los desgloses en Activos periódicamente.
      </p>
      <button type="button" id="btn-marcar-revisado" class="link-btn">Marcar como revisado hoy</button>
    </section>
  `;

  container.innerHTML = `
    <div class="section-head">
      <h3>X-Ray</h3>
    </div>

    ${revisionCard}

    <section class="card">
      <h3>Cobertura del análisis</h3>
      <p class="muted">Solo se puede mirar look-through lo que tenga composición introducida en Activos ("Cubierto a EUR" + reparto geográfico). Añádela poco a poco — no hace falta rellenarla toda de golpe, empieza por tus mayores posiciones.</p>
      <div class="kpi-row"><span>Con composición introducida</span><span>${fmtEUR(cobertura.valorConDatos)} de ${fmtEUR(cobertura.total)} (${fmtPct1(cobertura.pctConDatos)})</span></div>
      ${
        cobertura.sinDatos.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>Pendiente de desglosar</th><th>Valor</th></tr></thead>
              <tbody>${cobertura.sinDatos
                .slice(0, 10)
                .map((r) => `<tr><td>${r.asset.name}</td><td>${fmtEUR(r.value)}</td></tr>`)
                .join("")}</tbody>
            </table></div>
            ${cobertura.sinDatos.length > 10 ? `<p class="muted">Y ${cobertura.sinDatos.length - 10} más.</p>` : ""}`
          : `<p class="muted">Todo tu patrimonio financiero tiene composición introducida.</p>`
      }
    </section>

    <section class="card">
      <h3>Exposición geográfica real (look-through)</h3>
      <p class="muted">Ponderada por lo que hay dentro de cada fondo, no por su etiqueta. Calculada solo sobre el ${fmtPct1(cobertura.pctConDatos)} ya desglosado.</p>
      ${
        geo.totalConDatos > 0
          ? `<div class="legend">${GEO_REGIONS.map((r) => legendRow(REGION_COLORS[r.key], r.label, geo.porRegion[r.key], geo.totalConDatos)).join("")}</div>`
          : `<p class="muted">Añade composición a algún fondo en Activos para ver esto.</p>`
      }
    </section>

    <section class="card">
      <h3>Exposición real a divisa no-euro</h3>
      ${
        divisa.totalConDatos > 0
          ? `<div class="kpi-row"><span>Expuesto a divisa distinta del euro</span><span class="${divisa.pctExpuesto > 0 ? "neg" : ""}">${fmtEUR(divisa.expuestoNoEur)} (${fmtPct1(divisa.pctExpuesto)})</span></div>
             <p class="muted">Un fondo marcado "Cubierto a EUR" no cuenta aquí aunque invierta fuera. Para el resto, España + resto de Europa se tratan como euro y el resto como no-euro — una aproximación a partir del reparto geográfico, no un desglose de divisa aparte.</p>`
          : `<p class="muted">Añade composición a algún fondo en Activos para ver esto.</p>`
      }
    </section>

    <section class="card">
      <h3>Conclusiones automáticas</h3>
      <ul class="simple-list">
        ${conclusiones.map((c) => `<li>${c}</li>`).join("")}
      </ul>
      <p class="muted">Todavía no cubre la concentración real por emisor (p.ej. cuánto tienes en una empresa concreta repartido entre varios fondos) — eso exigiría introducir las principales posiciones de cada fondo, no solo su reparto geográfico, y queda pendiente como siguiente paso.</p>
    </section>
  `;

  container.querySelectorAll("#btn-marcar-revisado").forEach((btn) =>
    btn.addEventListener("click", () => {
      store.updateMeta({ xrayUltimaRevision: new Date().toISOString().slice(0, 10) });
      renderXray(container);
    })
  );
}
