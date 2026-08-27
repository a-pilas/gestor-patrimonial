import { ASSET_CLASSES, RISK_SCALE_MAX } from "./model.js";
import { store } from "./store.js";
import {
  totalsByClass,
  totalPatrimonio,
  totalAportadoNeto,
  rentabilidadYtdPct,
  riskScores,
  fechaUltimaActualizacion,
  assetsWithoutPosition,
  totalDeudaPendiente,
  patrimonioNeto,
  financialBreakdownBySubclass,
  financialLiquidezVsResto,
  financialTotalsByEntity,
  patrimonioConsolidado,
  evolucionAnualPatrimonio,
  bandasDeRiesgo,
} from "./metrics.js";

// Paleta validada (validate_palette.js, modo dark, superficie --bg-card
// #17281f): las 5 comprobaciones (banda de luminosidad, croma, separación
// CVD, umbral de visión normal y contraste) pasan tanto para el par de la
// barra como para el trío del anillo consolidado.
const COLOR_LIQUIDEZ = "#4c9f70";
const COLOR_INVERTIDO = "#3d7ab8";
const COLOR_INMOBILIARIO = "#a85c32";

// Paleta de riesgo, validada por separado (verde-ámbar-rosa/rojo en vez del
// dorado de --accent, que en modo oscuro queda demasiado claro y falla la
// banda de luminosidad): las 5 comprobaciones pasan en ambos pares
// adyacentes de la barra Conservador→Moderado→Decidido.
const RISK_BAND_COLORS = {
  conservador: "#4c9f70",
  moderado: "#cc7a2e",
  decidido: "#bf4560",
};

function fmtEUR(n) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)} %`;
}

function donutSvg(totals, total) {
  const size = 220;
  const r = 80;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  let segments = "";
  const entries = Object.entries(totals).filter(([, v]) => v > 0);

  if (!total || entries.length === 0) {
    return `<svg viewBox="0 0 ${size} ${size}" class="donut">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2a2a2a" stroke-width="28" />
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" class="donut-empty">Sin datos</text>
    </svg>`;
  }

  for (const [cls, value] of entries) {
    const frac = value / total;
    const len = frac * circumference;
    segments += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ASSET_CLASSES[cls].color}"
      stroke-width="28" stroke-dasharray="${len} ${circumference - len}"
      stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" />`;
    offset += len;
  }

  return `<svg viewBox="0 0 ${size} ${size}" class="donut">
    ${segments}
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" class="donut-total">${fmtEUR(total)}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-label">Patrimonio total</text>
  </svg>`;
}

function fmtPct1(n) {
  return `${n.toFixed(1)} %`;
}

function financialBreakdownTable() {
  const { groups, total } = financialBreakdownBySubclass();
  const rows = groups;
  return `
    <section class="card">
      <h3>Patrimonio financiero por tipo de producto</h3>
      <p class="muted">Excluye inmobiliario.</p>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Tipo</th><th>Importe</th><th>%</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr>
                  <td>${r.label}</td>
                  <td>${fmtEUR(r.value)}</td>
                  <td>${fmtPct1(total ? (r.value / total) * 100 : 0)}</td>
                </tr>`
              )
              .join("") || '<tr><td colspan="3" class="muted">Sin datos</td></tr>'}
          </tbody>
          <tfoot><tr><td><strong>Total</strong></td><td><strong>${fmtEUR(total)}</strong></td><td><strong>100.0 %</strong></td></tr></tfoot>
        </table>
      </div>
    </section>
  `;
}

function legendRow(color, label, value, pct) {
  return `<div class="legend-row">
    <span class="legend-dot" style="background:${color}"></span>
    <span class="legend-label">${label}</span>
    <span class="legend-value">${fmtEUR(value)}</span>
    <span class="legend-pct">${fmtPct1(pct)}</span>
  </div>`;
}

// Barra apilada: mucho más fácil de leer de un vistazo que una tabla de 2
// filas para una proporción tan simple — el ojo compara longitudes al
// instante, sin tener que leer números.
function liquidezVsRestoCard() {
  const { cuentaCorriente, resto, total } = financialLiquidezVsResto();
  const pctCC = total ? (cuentaCorriente / total) * 100 : 0;
  const pctResto = total ? (resto / total) * 100 : 0;
  return `
    <section class="card">
      <h3>Liquidez en cuenta corriente vs. resto</h3>
      <p class="muted">Excluye inmobiliario.</p>
      <div class="stackbar-total">${fmtEUR(total)}</div>
      <div class="stackbar" role="img" aria-label="Cuenta corriente ${fmtPct1(pctCC)}, resto invertido ${fmtPct1(pctResto)}">
        <div class="stackbar-seg" style="width:${pctCC}%; background:${COLOR_LIQUIDEZ}"></div>
        <div class="stackbar-seg" style="width:${pctResto}%; background:${COLOR_INVERTIDO}"></div>
      </div>
      <div class="legend">
        ${legendRow(COLOR_LIQUIDEZ, "Liquidez en cuentas corrientes", cuentaCorriente, pctCC)}
        ${legendRow(COLOR_INVERTIDO, "Resto invertido", resto, pctResto)}
      </div>
    </section>
  `;
}

// Anillo consolidado: liquidez / inversión financiera / inversión
// inmobiliaria, sobre TODO el patrimonio (a diferencia de las otras tablas de
// este bloque, que excluyen inmobiliario a propósito).
function consolidatedDonutSvg(entries, total) {
  const size = 180;
  const r = 62;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const gap = 3; // separación visual entre segmentos, en unidades del perímetro

  let offset = 0;
  let segments = "";
  const visible = entries.filter((e) => e.value > 0);

  if (!total || !visible.length) {
    return `<svg viewBox="0 0 ${size} ${size}" class="donut">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2a2a2a" stroke-width="24" />
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" class="donut-empty">Sin datos</text>
    </svg>`;
  }

  for (const e of visible) {
    const frac = e.value / total;
    const len = Math.max(0, frac * circumference - gap);
    segments += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${e.color}"
      stroke-width="24" stroke-linecap="round" stroke-dasharray="${len} ${circumference - len}"
      stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" />`;
    offset += frac * circumference;
  }

  return `<svg viewBox="0 0 ${size} ${size}" class="donut">
    ${segments}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-total" style="font-size:15px">${fmtEUR(total)}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-label">Patrimonio total</text>
  </svg>`;
}

function consolidatedDonutCard() {
  const { liquidez, inversionFinanciera, inversionInmobiliaria, total } = patrimonioConsolidado();
  const entries = [
    { label: "Liquidez", value: liquidez, color: COLOR_LIQUIDEZ },
    { label: "Inversión financiera", value: inversionFinanciera, color: COLOR_INVERTIDO },
    { label: "Inversión inmobiliaria", value: inversionInmobiliaria, color: COLOR_INMOBILIARIO },
  ];
  return `
    <section class="card card-donut">
      <h3>Liquidez, inversión financiera e inmobiliaria</h3>
      ${consolidatedDonutSvg(entries, total)}
      <div class="legend">
        ${entries.map((e) => legendRow(e.color, e.label, e.value, total ? (e.value / total) * 100 : 0)).join("")}
      </div>
    </section>
  `;
}

// Evolución anual del patrimonio total (financiero + inmobiliario), como
// gráfico de barras — una barra por año con su importe encima y la variación
// interanual debajo, para leer de un vistazo tanto el nivel como el ritmo de
// crecimiento. El último año (el actual) se resalta en un color distinto.
function evolutionChartCard() {
  const years = evolucionAnualPatrimonio();
  if (years.length < 2) {
    return `
      <section class="card">
        <h3>Evolución del patrimonio</h3>
        <p class="muted">Necesitas posiciones de al menos dos años distintos para ver la evolución histórica.</p>
      </section>
    `;
  }

  const maxValue = Math.max(...years.map((y) => y.total), 1);
  const currentYear = new Date().getFullYear();

  const bars = years
    .map((y) => {
      const pct = Math.max(2, (y.total / maxValue) * 100);
      const isCurrent = y.year === currentYear;
      const yoy =
        y.yoyPct == null
          ? `<span class="evo-bar-yoy muted">—</span>`
          : `<span class="evo-bar-yoy ${y.yoyPct >= 0 ? "pos" : "neg"}">${y.yoyPct >= 0 ? "+" : ""}${y.yoyPct.toFixed(1)}%</span>`;
      return `
        <div class="evo-bar-col">
          <div class="evo-bar-value">${fmtEUR(y.total)}</div>
          ${yoy}
          <div class="evo-bar" style="height:${pct}%; background:${isCurrent ? "var(--accent)" : "var(--brand-light)"}"></div>
          <div class="evo-bar-year">${y.year}</div>
        </div>
      `;
    })
    .join("");

  return `
    <section class="card">
      <h3>Evolución del patrimonio</h3>
      <div class="evo-chart">${bars}</div>
    </section>
  `;
}

function financialByEntityTable() {
  const { rows, total } = financialTotalsByEntity();
  return `
    <section class="card">
      <h3>Patrimonio financiero por entidad</h3>
      <p class="muted">Excluye inmobiliario, ordenado de mayor a menor.</p>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Entidad</th><th>Importe</th><th>%</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr>
                  <td>${r.name}</td>
                  <td>${fmtEUR(r.value)}</td>
                  <td>${fmtPct1(total ? (r.value / total) * 100 : 0)}</td>
                </tr>`
              )
              .join("") || '<tr><td colspan="3" class="muted">Sin datos</td></tr>'}
          </tbody>
          <tfoot><tr><td><strong>Total</strong></td><td><strong>${fmtEUR(total)}</strong></td><td><strong>100.0 %</strong></td></tr></tfoot>
        </table>
      </div>
    </section>
  `;
}

function riskBar(label, value, max = RISK_SCALE_MAX) {
  const pct = value == null ? 0 : Math.min(100, (value / max) * 100);
  const text = value == null ? "—" : value.toFixed(1);
  return `<div class="risk-row">
    <span class="risk-label">${label}</span>
    <div class="risk-track"><div class="risk-fill" style="width:${pct}%"></div></div>
    <span class="risk-value">${text}</span>
  </div>`;
}

// Barra apilada de 3 segmentos: qué % de TODO el patrimonio (financiero +
// inmobiliario) cae en cada banda de riesgo, más granular que el promedio
// RF/RV/Combinado de la tarjeta de al lado.
function riskBandsCard() {
  const { bands, total } = bandasDeRiesgo();
  const withPct = bands.map((b) => ({ ...b, pct: total ? (b.value / total) * 100 : 0 }));
  return `
    <section class="card">
      <h3>Bandas de riesgo</h3>
      <p class="muted">Agrupa el score SRRI (1-7) de cada activo. Excluye inmobiliario y cuentas corrientes.</p>
      <div class="stackbar-total">${fmtEUR(total)}</div>
      <div class="stackbar" role="img" aria-label="${withPct.map((b) => `${b.label} ${fmtPct1(b.pct)}`).join(", ")}">
        ${withPct.map((b) => `<div class="stackbar-seg" style="width:${b.pct}%; background:${RISK_BAND_COLORS[b.key]}"></div>`).join("")}
      </div>
      <div class="legend">
        ${withPct.map((b) => legendRow(RISK_BAND_COLORS[b.key], b.label, b.value, b.pct)).join("")}
      </div>
    </section>
  `;
}

export function renderDashboard(container) {
  const data = store.get();
  const totals = totalsByClass();
  const total = totalPatrimonio();
  const aportado = totalAportadoNeto();
  const plusvalia = total - aportado;
  const ytd = rentabilidadYtdPct();
  const benchmarkYtd = data.meta.benchmarkYtdPct;
  const risks = riskScores();
  const lastUpdate = fechaUltimaActualizacion();
  const missing = assetsWithoutPosition();
  const deuda = totalDeudaPendiente();
  const neto = patrimonioNeto();

  const legend = Object.entries(ASSET_CLASSES)
    .map(([key, cfg]) => {
      const value = totals[key] || 0;
      const pct = total ? (value / total) * 100 : 0;
      return `<div class="legend-row">
        <span class="legend-dot" style="background:${cfg.color}"></span>
        <span class="legend-label">${cfg.label}</span>
        <span class="legend-value">${fmtEUR(value)}</span>
        <span class="legend-pct">${pct.toFixed(1)} %</span>
      </div>`;
    })
    .join("");

  const missingBanner = missing.length
    ? `<section class="card card-warning">
        <strong>⚠ Activos sin valor actual registrado</strong>
        <p class="muted">Estos activos tienen movimientos pero ninguna posición (valor actual), así que no cuentan en el resumen de abajo: ${missing
          .map((a) => a.name)
          .join(", ")}. Ve a <a href="#posiciones">Posiciones</a> y añade su valor más reciente.</p>
      </section>`
    : "";

  container.innerHTML = `
    ${missingBanner}
    <div class="dash-grid">
      <section class="card card-donut">
        ${donutSvg(totals, total)}
        <div class="legend">${legend}</div>
      </section>

      <section class="card card-summary">
        <h3>Resumen</h3>
        <div class="kpi-row"><span>Patrimonio total</span><strong>${fmtEUR(total)}</strong></div>
        <div class="kpi-row"><span>Aportado neto</span><strong>${fmtEUR(aportado)}</strong></div>
        <div class="kpi-row"><span>Plusvalía acumulada</span><strong class="${plusvalia >= 0 ? "pos" : "neg"}">${missing.length ? "—" : fmtEUR(plusvalia)}</strong></div>
        ${missing.length ? `<p class="muted">No se calcula hasta que todos los activos tengan una posición con su valor actual.</p>` : ""}
        ${
          deuda
            ? `<div class="kpi-row"><span>Deudas</span><strong class="neg">−${fmtEUR(deuda)}</strong></div>
               <div class="kpi-row"><span>Patrimonio neto</span><strong>${fmtEUR(neto)}</strong></div>`
            : ""
        }
        <p class="muted">Última actualización de posiciones: ${lastUpdate || "sin datos"}</p>
      </section>

      <section class="card card-ytd">
        <h3>Rentabilidad YTD vs benchmark</h3>
        <div class="ytd-compare">
          <div class="ytd-box">
            <span class="ytd-label">Cartera</span>
            <span class="ytd-value ${ytd >= 0 ? "pos" : "neg"}">${fmtPct(ytd)}</span>
          </div>
          <div class="ytd-box">
            <span class="ytd-label">${data.meta.benchmarkName}</span>
            <span class="ytd-value">${fmtPct(benchmarkYtd)}</span>
            <button id="edit-benchmark" class="link-btn">editar</button>
          </div>
        </div>
        <p class="muted">Cálculo simplificado a partir de las últimas posiciones y flujos del año. Se refinará en próximas fases (TWR).</p>
      </section>

      <section class="card card-risk">
        <h3>Score de riesgo (SRRI, 1-${RISK_SCALE_MAX})</h3>
        ${riskBar("Renta fija", risks.rentaFija)}
        ${riskBar("Renta variable", risks.rentaVariable)}
        ${riskBar("Combinado", risks.combinado)}
      </section>

      ${riskBandsCard()}
    </div>

    ${evolutionChartCard()}

    ${financialBreakdownTable()}

    <div class="dash-grid">
      ${liquidezVsRestoCard()}
      ${consolidatedDonutCard()}
    </div>

    ${financialByEntityTable()}
  `;

  container.querySelector("#edit-benchmark")?.addEventListener("click", () => {
    const current = data.meta.benchmarkYtdPct;
    const val = prompt(`Rentabilidad YTD del benchmark (${data.meta.benchmarkName}), en %:`, current ?? "");
    if (val === null) return;
    const num = parseFloat(val.replace(",", "."));
    store.updateMeta({ benchmarkYtdPct: isNaN(num) ? null : num });
    renderDashboard(container);
  });
}
