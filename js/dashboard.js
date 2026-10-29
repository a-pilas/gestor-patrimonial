import { ASSET_CLASSES, RISK_SCALE_MAX, LIQUIDEZ_OPERATIVA_SUBCLASSES } from "./model.js";
import { store } from "./store.js";
import {
  totalsByClass,
  totalPatrimonio,
  plusvaliaAcumuladaInversiones,
  rentabilidadYtdInversionFinancieraPct,
  rentabilidadYtdInmobiliarioPct,
  revalorizacionYtdInversionFinanciera,
  revalorizacionYtdInmobiliario,
  detalleTwrInversionFinanciera,
  detalleTwrInmobiliario,
  riskScores,
  asignacionRvRfInversionFinanciera,
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
  plusvaliaRealizadaVsLatentePorBloque,
  evolucionMensualLiquidez,
  evolucionMensualConsolidada,
  estadoRevisionXray,
} from "./metrics.js";
import { resumenActivosImprimibleHtml } from "./positions.js";

// AAAA-MM-DD en hora local (toISOString() daría la fecha UTC, que de noche puede ser otro día).
function fechaLocalIso() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

let showTwrDetail = false;
let showYtdNotas = false;
let showResumenNota = false;

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

function fmtEURSigned(n) {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : "−"}${fmtEUR(Math.abs(n))}`;
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

// Gráfico de líneas YTD (enero a mes actual) con el Total consolidado como
// protagonista visual (línea gruesa + área rellena con degradado) y las 3
// líneas de liquidez/inversión financiera/inmobiliario como trazos finos y
// más apagados en segundo plano — el ojo debe irse primero al Total.
function consolidatedEvolutionSvg(points) {
  const width = 700;
  const height = 260;
  const marginLeft = 8;
  const marginRight = 8;
  const marginTop = 24;
  const marginBottom = 30;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const maxValue = Math.max(...points.map((p) => p.total), 1);

  const xFor = (i) => marginLeft + (points.length === 1 ? plotWidth / 2 : (i / (points.length - 1)) * plotWidth);
  const yFor = (v) => marginTop + plotHeight - (v / maxValue) * plotHeight;

  const lineFor = (key) => points.map((p, i) => `${xFor(i)},${yFor(p[key])}`).join(" ");

  const totalLinePoints = lineFor("total");
  const areaPath =
    `M ${xFor(0)},${marginTop + plotHeight} ` +
    points.map((p, i) => `L ${xFor(i)},${yFor(p.total)}`).join(" ") +
    ` L ${xFor(points.length - 1)},${marginTop + plotHeight} Z`;

  const last = points[points.length - 1];
  const lastX = xFor(points.length - 1);

  const monthLabels = points
    .map((p, i) => {
      const [y, m] = p.month.split("-");
      const label = p.esReferencia ? `${MESES_CORTOS[Number(m) - 1]} ${y.slice(2)}` : MESES_CORTOS[Number(m) - 1];
      return `<text x="${xFor(i)}" y="${height - 8}" text-anchor="middle" class="evo-line-month${p.esReferencia ? " evo-line-month-ref" : ""}">${label}</text>`;
    })
    .join("");

  // Línea vertical fija separando el punto de referencia (cierre del año
  // anterior) del resto del año, para poder comparar de un vistazo "de
  // dónde partíamos" contra la evolución YTD sin confundirlo con un mes más.
  const referenceIndex = points.findIndex((p) => p.esReferencia);
  const separator =
    referenceIndex >= 0 && points.length > referenceIndex + 1
      ? `<line x1="${(xFor(referenceIndex) + xFor(referenceIndex + 1)) / 2}" y1="${marginTop}" x2="${(xFor(referenceIndex) + xFor(referenceIndex + 1)) / 2}" y2="${marginTop + plotHeight}" class="evo-line-separator" />`
      : "";

  return `
    <svg id="evo-ytd-svg" viewBox="0 0 ${width} ${height}" class="evo-line-chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id="evoTotalGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <polyline points="${lineFor("liquidez")}" fill="none" stroke="${COLOR_LIQUIDEZ}" stroke-width="1.5" opacity="0.85" />
      <polyline points="${lineFor("inversionFinanciera")}" fill="none" stroke="${COLOR_INVERTIDO}" stroke-width="1.5" opacity="0.85" />
      <polyline points="${lineFor("inmobiliario")}" fill="none" stroke="${COLOR_INMOBILIARIO}" stroke-width="1.5" opacity="0.85" />
      <path d="${areaPath}" fill="url(#evoTotalGradient)" />
      <polyline points="${totalLinePoints}" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="${lastX}" cy="${yFor(last.total)}" r="4" fill="var(--accent)" />
      <text x="${lastX}" y="${yFor(last.total) - 10}" text-anchor="end" class="evo-line-total-label">${fmtEUR(last.total)}</text>
      ${separator}
      ${monthLabels}
      <line id="evo-ytd-guide" x1="0" y1="${marginTop}" x2="0" y2="${marginTop + plotHeight}" class="evo-line-guide" style="display:none" />
    </svg>
    <div class="evo-tooltip" id="evo-ytd-tooltip" style="display:none"></div>
  `;
}

function evolutionYtdCard() {
  const points = evolucionMensualConsolidada();
  if (points.length < 2) {
    return `
      <section class="card">
        <h3>Evolución del patrimonio YTD</h3>
        <p class="muted">Necesitas posiciones de al menos dos meses distintos este año para ver la evolución.</p>
      </section>
    `;
  }

  const last = points[points.length - 1];
  const entries = [
    { label: "Liquidez", value: last.liquidez, color: COLOR_LIQUIDEZ },
    { label: "Inversión financiera", value: last.inversionFinanciera, color: COLOR_INVERTIDO },
    { label: "Inmobiliario", value: last.inmobiliario, color: COLOR_INMOBILIARIO },
  ];

  return `
    <section class="card card-chart-hover">
      <h3>Evolución del patrimonio YTD</h3>
      <p class="muted">Enero a mes actual, mes a mes. El primer punto (antes de la línea vertical) es el cierre de ${points[0].month.split("-")[0]}, como referencia fija. El Total destaca en el gráfico; las 3 líneas finas son cada bloque por separado.</p>
      ${consolidatedEvolutionSvg(points)}
      <div class="legend">
        ${legendRow("var(--accent)", "Total", last.total, 100)}
        ${entries.map((e) => legendRow(e.color, e.label, e.value, last.total ? (e.value / last.total) * 100 : 0)).join("")}
      </div>
    </section>
  `;
}

// Desglose sub-periodo a sub-periodo del cálculo del TWR: deja ver en qué
// fecha concreta se dispara una rentabilidad de periodo fuera de lo normal,
// en vez de tener que confiar a ciegas en el porcentaje final del año. Se
// marca en rojo cualquier sub-periodo con |rentabilidad| > 50%, que casi
// siempre delata un dato mal introducido (una Compra/Aportación con el
// importe equivocado, una Posición que debería ser una Venta, etc.) en vez
// de una rentabilidad real.
function twrDetailTable(label, detalle) {
  if (!detalle.length) return `<p class="muted">${label}: sin histórico suficiente.</p>`;
  return `
    <p class="muted" style="margin-top:12px"><strong>${label}</strong></p>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Periodo</th><th>Valor inicio</th><th>Valor fin</th><th>Flujo</th><th>Rentabilidad del periodo</th></tr></thead>
        <tbody>
          ${detalle
            .map((d) => {
              const sospechoso = d.rPct != null && Math.abs(d.rPct) > 50;
              return `<tr${sospechoso ? ' class="neg"' : ""}>
                <td>${d.desde} → ${d.hasta}</td>
                <td>${fmtEUR(d.valorInicio)}</td>
                <td>${fmtEUR(d.valorFin)}</td>
                <td>${fmtEUR(d.flujo)}</td>
                <td>${d.rPct == null ? "—" : `${d.rPct >= 0 ? "+" : ""}${d.rPct.toFixed(2)}%`}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function twrDetailSection() {
  return `
    <div class="twr-detail">
      <p class="muted">Solo diagnóstico: este desglose encadena un periodo por cada fecha con posiciones y ya no determina el porcentaje de arriba. Si el valor baja o sube de golpe en una fecha (por ejemplo, un fondo traspasado que se pone a 0 un día y el destino aparece semanas después), saldrán rentabilidades ficticias aquí. Filas en rojo: sub-periodos con una rentabilidad por encima del ±50%, casi siempre señal de un dato mal introducido (una Compra/Aportación con el importe equivocado, una Posición que en realidad era una Venta, etc.) en vez de una rentabilidad real de mercado.</p>
      ${twrDetailTable("Inversión financiera", detalleTwrInversionFinanciera())}
      ${twrDetailTable("Inmobiliario", detalleTwrInmobiliario())}
    </div>
  `;
}

// Tooltip al pasar el ratón por el gráfico YTD: encuentra el mes más
// cercano a la posición X del cursor (convertida a coordenadas del viewBox,
// ya que el SVG escala de forma responsive) y muestra los 4 valores de ese
// mes, con una línea vertical guía marcando el punto.
function wireYtdChart(container) {
  const svg = container.querySelector("#evo-ytd-svg");
  const tooltip = container.querySelector("#evo-ytd-tooltip");
  const guide = container.querySelector("#evo-ytd-guide");
  if (!svg || !tooltip || !guide) return;

  const points = evolucionMensualConsolidada();
  if (points.length < 2) return;

  const width = 700;
  const marginLeft = 8;
  const marginRight = 8;
  const plotWidth = width - marginLeft - marginRight;
  const xFor = (i) => marginLeft + (points.length === 1 ? plotWidth / 2 : (i / (points.length - 1)) * plotWidth);

  function handleMove(ev) {
    const rect = svg.getBoundingClientRect();
    const relX = ((ev.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let minDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(xFor(i) - relX);
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    });
    const p = points[nearest];
    const [y, m] = p.month.split("-");

    guide.setAttribute("x1", xFor(nearest));
    guide.setAttribute("x2", xFor(nearest));
    guide.style.display = "";

    tooltip.innerHTML = `
      <div class="evo-tooltip-month">${MESES_CORTOS[Number(m) - 1]} ${y}</div>
      <div class="evo-tooltip-row"><span class="evo-tooltip-dot" style="background:var(--accent)"></span>Total <strong>${fmtEUR(p.total)}</strong></div>
      <div class="evo-tooltip-row"><span class="evo-tooltip-dot" style="background:${COLOR_LIQUIDEZ}"></span>Liquidez <strong>${fmtEUR(p.liquidez)}</strong></div>
      <div class="evo-tooltip-row"><span class="evo-tooltip-dot" style="background:${COLOR_INVERTIDO}"></span>Inversión financiera <strong>${fmtEUR(p.inversionFinanciera)}</strong></div>
      <div class="evo-tooltip-row"><span class="evo-tooltip-dot" style="background:${COLOR_INMOBILIARIO}"></span>Inmobiliario <strong>${fmtEUR(p.inmobiliario)}</strong></div>
    `;
    tooltip.style.display = "block";

    const cardRect = svg.closest(".card").getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth || 190;
    let left = ev.clientX - cardRect.left + 14;
    if (left + tooltipWidth > cardRect.width) left = ev.clientX - cardRect.left - tooltipWidth - 14;
    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.top = `${ev.clientY - cardRect.top - 10}px`;
  }

  function handleLeave() {
    tooltip.style.display = "none";
    guide.style.display = "none";
  }

  svg.addEventListener("mousemove", handleMove);
  svg.addEventListener("mouseleave", handleLeave);
}

// Plusvalía realizada (activos ya vendidos/retirados del todo) vs. latente
// (lo que sigues manteniendo). Con KPIs en vez de barra apilada porque
// cualquiera de las dos puede ser negativa (una pérdida), y una barra
// apilada solo tiene sentido con magnitudes positivas.
function plusvaliaCard() {
  const bloques = plusvaliaRealizadaVsLatentePorBloque();
  const filas = [
    ["Plusvalías financieras", bloques.financiera],
    ["Plusvalías inmobiliarias (sin vivienda habitual)", bloques.inmobiliaria],
    ["Vivienda habitual", bloques.viviendaHabitual],
  ];
  const suma = (campo) => filas.reduce((s, [, b]) => s + b[campo], 0);
  const celda = (n) => `<td class="${n >= 0 ? "pos" : "neg"}">${fmtEUR(n)}</td>`;
  return `
    <section class="card print-compact">
      <h3>Plusvalía realizada vs. latente</h3>
      <p class="muted">Sin cuentas corrientes, remuneradas ni depósitos. Realizada: activos vendidos del todo; latente: lo que mantienes.<span class="no-print"> Un activo recién dado de alta sin posición ni venta registrada no cuenta en ninguna de las dos.</span></p>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th></th><th>Latente</th><th>Realizada</th><th>Total</th></tr></thead>
          <tbody>
            ${filas.map(([nombre, b]) => `<tr><td>${nombre}</td>${celda(b.latente)}${celda(b.realizada)}${celda(b.latente + b.realizada)}</tr>`).join("")}
          </tbody>
          <tfoot><tr><td><strong>Total</strong></td>${celda(suma("latente"))}${celda(suma("realizada"))}${celda(suma("latente") + suma("realizada"))}</tr></tfoot>
        </table>
      </div>
    </section>
  `;
}

// Colchón de liquidez mes a mes (cuentas corrientes + ahorro + depósitos),
// mismo formato de gráfico de barras que la evolución anual del patrimonio.
function liquidityEvolutionCard() {
  const points = evolucionMensualLiquidez();
  if (points.length < 2) {
    return `
      <section class="card print-compact print-page-start">
        <h3>Colchón de liquidez en el tiempo</h3>
        <p class="muted">Necesitas posiciones de liquidez de al menos dos meses distintos para ver la evolución.</p>
      </section>
    `;
  }

  const maxValue = Math.max(...points.map((pt) => pt.total), 1);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const bars = points
    .map((pt) => {
      const pct = Math.max(2, (pt.total / maxValue) * 100);
      const isCurrent = pt.month === currentMonth;
      const [y, m] = pt.month.split("-");
      const label = `${MESES_CORTOS[Number(m) - 1]} ${y.slice(2)}`;
      const mom =
        pt.momPct == null
          ? `<span class="evo-bar-yoy muted">—</span>`
          : `<span class="evo-bar-yoy ${pt.momPct >= 0 ? "pos" : "neg"}">${pt.momPct >= 0 ? "+" : ""}${pt.momPct.toFixed(1)}%</span>`;
      return `
        <div class="evo-bar-col">
          <div class="evo-bar-value">${fmtEUR(pt.total)}</div>
          ${mom}
          <div class="evo-bar" style="height:${pct}%; background:${isCurrent ? "var(--accent)" : COLOR_LIQUIDEZ}"></div>
          <div class="evo-bar-year">${label}</div>
        </div>
      `;
    })
    .join("");

  return `
    <section class="card print-compact print-page-start">
      <h3>Colchón de liquidez en el tiempo</h3>
      <p class="muted">Cuentas corrientes + ahorro + depósitos, mes a mes.</p>
      <div class="evo-chart">${bars}</div>
    </section>
  `;
}

function financialByEntityTable() {
  const { rows, total } = financialTotalsByEntity();
  return `
    <section class="card print-compact">
      <h3>Patrimonio financiero por entidad</h3>
      <p class="muted">Ordenado de mayor a menor, excluye inmobiliario.</p>
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
// RV / RF sobre la inversión financiera SOLA (sin liquidez ni inmuebles),
// repartiendo los Mixtos según su "% en RV" de Activos.
function rvRfCard() {
  const a = asignacionRvRfInversionFinanciera();
  const filas = [
    { color: ASSET_CLASSES.renta_variable.color, label: "Renta variable", value: a.rv, siempre: true },
    { color: ASSET_CLASSES.renta_fija.color, label: "Renta fija", value: a.rf, siempre: true },
    { color: ASSET_CLASSES.mixto.color, label: "Mixto sin reparto RV/RF", value: a.mixtoSinReparto },
    { color: ASSET_CLASSES.liquidez.color, label: "Otros (monetario en clase Liquidez)", value: a.otros },
  ]
    .filter((f) => f.siempre || f.value > 0)
    .map((f) => ({ ...f, pct: a.total ? (f.value / a.total) * 100 : 0 }));
  return `
    <section class="card">
      <h3>Renta variable / Renta fija</h3>
      <p class="muted">Sobre tu inversión financiera, sin cuentas, ahorro ni depósitos y sin inmuebles. Los fondos Mixtos se reparten según su "% en RV" de Activos.</p>
      <div class="stackbar-total">${fmtEUR(a.total)}</div>
      <div class="stackbar" role="img" aria-label="${filas.map((f) => `${f.label} ${fmtPct1(f.pct)}`).join(", ")}">
        ${filas.map((f) => `<div class="stackbar-seg" style="width:${f.pct}%; background:${f.color}"></div>`).join("")}
      </div>
      <div class="legend">
        ${filas.map((f) => legendRow(f.color, f.label, f.value, f.pct)).join("")}
      </div>
      ${a.mixtoSinReparto > 0 ? `<p class="muted">Hay ${fmtEUR(a.mixtoSinReparto)} en fondos Mixtos sin "% en RV" informado: indícalo en Activos para repartirlos entre RV y RF.</p>` : ""}
    </section>
  `;
}

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
  const inversiones = plusvaliaAcumuladaInversiones();
  const ytd = rentabilidadYtdInversionFinancieraPct();
  const ytdInmobiliario = rentabilidadYtdInmobiliarioPct();
  const revalFinanciera = revalorizacionYtdInversionFinanciera();
  const revalInmobiliario = revalorizacionYtdInmobiliario();
  const benchmarkYtd = data.meta.benchmarkYtdPct;
  const risks = riskScores();
  const lastUpdate = fechaUltimaActualizacion();
  const missing = assetsWithoutPosition();
  // La plusvalía no incluye liquidez operativa, así que una cuenta sin valor registrado no la bloquea.
  const missingInversion = missing.filter((a) => !LIQUIDEZ_OPERATIVA_SUBCLASSES.includes(a.subclass));
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

  const revisionXray = estadoRevisionXray();
  const xrayBanner = revisionXray.toca
    ? `<section class="card card-warning no-print">
        <strong>Toca revisar el X-Ray</strong>
        <p class="muted">${
          revisionXray.ultima
            ? `Han pasado ${revisionXray.diasDesde} días desde la última revisión.`
            : "Todavía no lo has revisado nunca."
        } Ve a <a href="#xray">X-Ray</a> para repasar la composición real de tus fondos.</p>
      </section>`
    : "";

  container.innerHTML = `
    <div class="print-only print-header">Gestor Patrimonial — Indicadores · ${fechaLocalIso()}</div>
    <div class="dash-actions no-print">
      <button type="button" id="btn-export-pdf" class="link-btn" title="Se abre la ventana de impresión: elige «Guardar como PDF» como destino">Descargar PDF de esta pantalla</button>
    </div>
    ${missingBanner}
    ${xrayBanner}
    <div class="dash-grid">
      <section class="card card-donut">
        ${donutSvg(totals, total)}
        <div class="legend">${legend}</div>
      </section>

      <section class="card card-summary">
        <h3>Resumen</h3>
        <div class="kpi-row"><span>Patrimonio total</span><strong>${fmtEUR(total)}</strong></div>
        <div class="kpi-row"><span>Inversiones</span><strong>${fmtEUR(inversiones.valorInversiones)}</strong></div>
        <div class="kpi-row"><span>Inmuebles</span><strong>${fmtEUR(inversiones.valorInmuebles)}</strong></div>
        <div class="kpi-row"><span>Aportado neto</span><strong>${fmtEUR(inversiones.aportado)}</strong></div>
        <div class="kpi-row"><span>Plusvalía acumulada</span><strong class="${inversiones.plusvalia >= 0 ? "pos" : "neg"}">${missingInversion.length ? "—" : `${fmtEUR(inversiones.plusvalia)}${inversiones.pct != null ? ` (${fmtPct(inversiones.pct)})` : ""}`}</strong></div>
        <button type="button" id="btn-toggle-resumen-nota" class="link-btn">${showResumenNota ? "Ocultar explicación" : "Ver explicación"}</button>
        ${
          showResumenNota
            ? `<p class="muted">Aportado y plusvalía se calculan sobre inversiones e inmuebles, sin cuentas corrientes, remuneradas ni depósitos: su saldo cambia por gastos, nóminas y vencimientos que casi nunca se registran como movimientos y daba pérdidas ficticias.</p>`
            : ""
        }
        ${missingInversion.length ? `<p class="muted">No se calcula hasta que todas las inversiones e inmuebles tengan una posición con su valor actual.</p>` : ""}
        ${
          deuda
            ? `<div class="kpi-row"><span>Deudas</span><strong class="neg">−${fmtEUR(deuda)}</strong></div>
               <div class="kpi-row"><span>Patrimonio neto</span><strong>${fmtEUR(neto)}</strong></div>`
            : ""
        }
        <p class="muted">Última actualización de posiciones: ${lastUpdate || "sin datos"}</p>
      </section>

      <section class="card card-ytd">
        <h3>Rentabilidad YTD — Inversión financiera</h3>
        <div class="ytd-compare">
          <div class="ytd-box">
            <span class="ytd-label">Inversión financiera</span>
            <span class="ytd-value ${ytd >= 0 ? "pos" : "neg"}">${fmtPct(ytd)}</span>
            <span class="ytd-eur ${revalFinanciera.ganancia >= 0 ? "pos" : "neg"}">${fmtEURSigned(revalFinanciera.ganancia)}</span>
          </div>
          <div class="ytd-box">
            <span class="ytd-label">${data.meta.benchmarkName}</span>
            <span class="ytd-value">${fmtPct(benchmarkYtd)}</span>
            <button id="edit-benchmark" class="link-btn">editar</button>
          </div>
          <div class="ytd-box">
            <span class="ytd-label">Inmobiliario</span>
            <span class="ytd-value ${ytdInmobiliario >= 0 ? "pos" : "neg"}">${fmtPct(ytdInmobiliario)}</span>
            <span class="ytd-eur ${revalInmobiliario.ganancia >= 0 ? "pos" : "neg"}">${fmtEURSigned(revalInmobiliario.ganancia)}</span>
          </div>
        </div>
        <div class="ytd-links">
          <button type="button" id="btn-toggle-ytd-notas" class="link-btn">${showYtdNotas ? "Ocultar explicación" : "Ver explicación"}</button>
          <button type="button" id="btn-toggle-twr-detail" class="link-btn">${showTwrDetail ? "Ocultar detalle del cálculo" : "Ver detalle del cálculo"}</button>
        </div>
        ${
          showYtdNotas
            ? `<p class="muted">Ganancia del año (valor actual − valor a 31/12 − aportaciones netas + dividendos y cupones cobrados) dividida entre el capital medio invertido, contando cada aportación solo por los días que ha estado dentro (Dietz modificado). Así las aportaciones no inflan la rentabilidad y las actualizaciones de posiciones a medias no la distorsionan. Excluye cuentas corrientes e inmobiliario — la liquidez operativa no tiene "rentabilidad" y mezclarla distorsiona el cálculo.</p>
               <p class="muted">En euros: lo que ha subido o bajado de valor este año sin contar el dinero que has metido o sacado (valor actual − valor a 31/12 − aportaciones netas del año). Si falta registrar algún movimiento, esta cifra sale distorsionada.</p>`
            : ""
        }
        ${showTwrDetail ? twrDetailSection() : ""}
      </section>

      <section class="card card-risk">
        <h3>Score de riesgo (SRRI, 1-${RISK_SCALE_MAX})</h3>
        <p class="muted">Excluye inmobiliario y cuentas corrientes.</p>
        ${riskBar("Renta fija", risks.rentaFija)}
        ${riskBar("Renta variable", risks.rentaVariable)}
        ${riskBar("Combinado", risks.combinado)}
      </section>

      ${riskBandsCard()}

      ${rvRfCard()}
    </div>

    ${evolutionChartCard()}

    ${evolutionYtdCard()}

    ${financialBreakdownTable()}

    <div class="dash-grid">
      ${liquidezVsRestoCard()}
      ${consolidatedDonutCard()}
    </div>

    ${liquidityEvolutionCard()}

    ${plusvaliaCard()}

    ${financialByEntityTable()}

    ${resumenActivosImprimibleHtml()}
  `;

  wireYtdChart(container);

  container.querySelector("#btn-toggle-resumen-nota")?.addEventListener("click", () => {
    showResumenNota = !showResumenNota;
    renderDashboard(container);
  });

  container.querySelector("#btn-toggle-ytd-notas")?.addEventListener("click", () => {
    showYtdNotas = !showYtdNotas;
    renderDashboard(container);
  });

  // El PDF sale de la ventana de impresión del navegador (destino «Guardar como
  // PDF»), con una hoja de estilos de impresión en tema claro. El título del
  // documento da el nombre por defecto al archivo.
  container.querySelector("#btn-export-pdf")?.addEventListener("click", () => {
    const tituloOriginal = document.title;
    document.title = `${fechaLocalIso()}-Gestor-Patrimonial-indicadores`;
    window.addEventListener("afterprint", () => (document.title = tituloOriginal), { once: true });
    window.print();
  });

  container.querySelector("#btn-toggle-twr-detail")?.addEventListener("click", () => {
    showTwrDetail = !showTwrDetail;
    renderDashboard(container);
  });

  container.querySelector("#edit-benchmark")?.addEventListener("click", () => {
    const current = data.meta.benchmarkYtdPct;
    const val = prompt(`Rentabilidad YTD del benchmark (${data.meta.benchmarkName}), en %:`, current ?? "");
    if (val === null) return;
    const num = parseFloat(val.replace(",", "."));
    store.updateMeta({ benchmarkYtdPct: isNaN(num) ? null : num });
    renderDashboard(container);
  });
}
