import { store } from "./store.js";
import {
  duracionPatrimonio,
  alquilerAnualTotal,
  simulacionCompraPropiedad,
  evolucionHerencias,
  simulacionRetirada,
  composicionFinancieraParaRetirada,
  volatilidadCartera,
} from "./metrics.js";
import { simulacionMonteCarlo, MC_SIMULACIONES } from "./montecarlo.js";
import { uid, DEFAULT_TASA_RETIRADA_PCT, DEFAULT_INTERES_LIQUIDEZ_PCT, DEFAULT_MC_SEMILLA, DEFAULT_MC_VOLATILIDADES_PCT } from "./model.js";
import { openModal } from "./modal.js";
import { esModoFamilia } from "./modo.js";

function fmtEUR(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return "—";
  return `${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

// Referencias habituales del mercado español (no son límites legales): los
// bancos suelen financiar hasta ~80% del menor entre tasación y precio en
// vivienda habitual (~60-70% en segunda residencia), y recomiendan que las
// cuotas totales no superen ~35% de los ingresos netos.
const REF_FINANCIACION_PCT = 80;
const REF_ESFUERZO_PCT = 35;
const REF_COLCHON_MIN_MESES = 3;

function fmtTipo(n) {
  if (n == null || isNaN(n)) return "—";
  return `${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

function fmtMeses(n) {
  if (n == null || isNaN(n)) return "—";
  return `${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} meses`;
}

function resultadoCompraHtml(r) {
  const cambioInversion = r.inversionFinancieraTras - r.inversionFinancieraActual;
  const esfuerzoHtml =
    r.ingresosMensuales > 0
      ? `<div class="kpi-row"><span>Cuota de esta hipoteca sobre tus ingresos</span><span>${fmtPct(r.esfuerzoEstaHipotecaPct)}</span></div>
         <div class="kpi-row"><span>Cuotas totales sobre tus ingresos (hoy: ${fmtPct(r.esfuerzoActualPct)})</span><span class="${r.esfuerzoTotalPct > REF_ESFUERZO_PCT ? "neg" : ""}"><strong>${fmtPct(r.esfuerzoTotalPct)}</strong></span></div>
         <p class="muted">Sobre ingresos netos de ${fmtEUR(r.ingresosMensuales)}/mes. Referencia habitual: que el total de cuotas no pase de ~${REF_ESFUERZO_PCT}% (recomendación prudencial, no un límite legal).</p>`
      : `<p class="muted">Para ver qué % de tus ingresos se llevaría la cuota, indica tus ingresos netos mensuales en Ajustes → Simulador — Compra de propiedad.</p>`;
  const tipoHipotecaHtml =
    r.tipoHipoteca === "variable"
      ? `<div class="kpi-row"><span>Tipo de interés (Euríbor + diferencial)</span><span>${fmtTipo(r.tipoInicialPct)}</span></div>`
      : r.tipoHipoteca === "mixta"
      ? `<div class="kpi-row"><span>Tipo fijo inicial · después Euríbor + diferencial</span><span>${fmtTipo(r.tipoInicialPct)} · ${fmtTipo(r.tipoVariablePct)}</span></div>`
      : `<div class="kpi-row"><span>Tipo de interés fijo</span><span>${fmtTipo(r.tipoInicialPct)}</span></div>`;

  const estresHtml = r.estres
    ? `<p class="muted" style="margin-top:14px"><strong>Prueba de estrés: si sube el Euríbor</strong></p>
       <div class="table-wrap"><table class="table">
         <thead><tr><th>Euríbor</th><th>Tipo</th><th>Cuota${r.tipoHipoteca === "mixta" ? " tras el periodo fijo" : ""}</th><th>Cuotas totales</th>${r.ingresosMensuales > 0 ? "<th>% ingresos</th>" : ""}</tr></thead>
         <tbody>${r.estres
           .map(
             (e) => `<tr>
               <td>${e.subida === 0 ? "Actual" : `+${e.subida} pt`}</td>
               <td>${fmtTipo(e.tipoPct)}</td>
               <td>${fmtEUR(e.cuota)}</td>
               <td>${fmtEUR(e.cuotaTotal)}</td>
               ${r.ingresosMensuales > 0 ? `<td class="${e.esfuerzoTotalPct > REF_ESFUERZO_PCT ? "neg" : ""}">${fmtPct(e.esfuerzoTotalPct)}</td>` : ""}
             </tr>`
           )
           .join("")}</tbody>
       </table></div>
       <p class="muted">Escenario pesimista a propósito, no una previsión: el Euríbor sube de golpe ${r.tipoHipoteca === "mixta" ? "al acabar el periodo fijo" : "desde el primer día"} y se queda ahí todo el préstamo. En la realidad la cuota se revisa cada 6-12 meses sobre el capital ya amortizado, así que el impacto real suele ser algo menor.</p>`
    : "";

  const colchonHtml =
    r.gastosMensualesHogar > 0
      ? `<div class="kpi-row"><span>Colchón de liquidez hoy</span><span>${fmtMeses(r.colchonHoyMeses)}</span></div>
         <div class="kpi-row"><span><strong>Colchón de liquidez tras la operación</strong></span><span class="${r.colchonTrasMeses < REF_COLCHON_MIN_MESES ? "neg" : ""}"><strong>${fmtMeses(r.colchonTrasMeses)}</strong></span></div>
         <p class="muted">Meses que aguantaría tu liquidez (cuentas, ahorro y depósitos) cubriendo tus gastos habituales (${fmtEUR(r.gastosMensualesHogar)}/mes) más todas las cuotas de hipoteca. Suele recomendarse tener entre ${REF_COLCHON_MIN_MESES} y 6 meses.</p>`
      : `<p class="muted">Para ver cuántos meses de colchón te quedarían, indica tus gastos mensuales habituales en Ajustes → Simulador — Compra de propiedad.</p>`;

  return `
    <div class="kpi-row"><span>Impuestos de la operación</span><span>${fmtEUR(r.impuestos)}</span></div>
    <div class="kpi-row"><span>Otros gastos (notaría, registro, gestoría)</span><span>${fmtEUR(r.otrosGastos)}</span></div>
    <div class="kpi-row"><span>Coste total de adquisición</span><span>${fmtEUR(r.costeTotalAdquisicion)}</span></div>
    ${r.valorVentaViviendaHabitual > 0 ? `<div class="kpi-row"><span>Aportado por venta de vivienda habitual</span><span class="pos">${fmtEUR(r.valorVentaViviendaHabitual)}</span></div>` : ""}
    <div class="kpi-row"><span><strong>${r.entradaNecesaria >= 0 ? "Entrada necesaria de tu liquidez" : "Sobrante tras cubrir la entrada"}</strong></span><span class="${r.entradaNecesaria >= 0 ? "" : "pos"}"><strong>${fmtEUR(Math.abs(r.entradaNecesaria))}</strong></span></div>
    <div class="kpi-row"><span>Liquidez disponible hoy</span><span>${fmtEUR(r.liquidezActual)}</span></div>
    <div class="kpi-row"><span>Liquidez restante tras la entrada</span><span class="${r.liquidezRestante >= 0 ? "" : "neg"}">${fmtEUR(r.liquidezRestante)}</span></div>
    <div class="kpi-row"><span>Patrimonio financiero invertido hoy</span><span>${fmtEUR(r.inversionFinancieraActual)}</span></div>
    <div class="kpi-row"><span><strong>Patrimonio financiero invertido tras la operación</strong></span><span class="${cambioInversion < 0 ? "neg" : ""}"><strong>${fmtEUR(r.inversionFinancieraTras)}</strong></span></div>
    <p class="muted">Solo inversiones financieras (sin cuentas corrientes, cuentas de ahorro ni depósitos, ni inmuebles). La entrada se paga primero de esa liquidez${
      r.faltanteDeInversiones > 0
        ? `; como no alcanza, hay que vender ${fmtEUR(r.faltanteDeInversiones)} de inversiones (sin contar el coste fiscal de venderlas)`
        : " y, al alcanzar, tu patrimonio invertido no cambia"
    }.</p>
    <div class="kpi-row"><span>Financiación sobre el precio de compra</span><span class="${r.financiacionSobrePrecioPct > REF_FINANCIACION_PCT ? "neg" : ""}">${fmtPct(r.financiacionSobrePrecioPct)}</span></div>
    <div class="kpi-row"><span>Financiación sobre el coste total (con impuestos y gastos)</span><span>${fmtPct(r.financiacionSobreCostePct)}</span></div>
    <p class="muted">Referencia habitual: los bancos financian hasta ~${REF_FINANCIACION_PCT}% del menor entre precio y tasación en vivienda habitual, y suelen bajar a ~60-70% en segunda residencia o inversión.</p>
    ${tipoHipotecaHtml}
    <div class="kpi-row"><span>${r.tipoHipoteca === "mixta" ? "Cuota mensual durante el periodo fijo" : "Cuota mensual de esta hipoteca"}</span><span>${fmtEUR(r.cuotaMensual)}</span></div>
    ${r.tipoHipoteca === "mixta" ? `<div class="kpi-row"><span>Cuota mensual tras los ${r.aniosFijos} años fijos (con el Euríbor actual)</span><span>${fmtEUR(r.cuotaTrasFijo)}</span></div>` : ""}
    <div class="kpi-row"><span>Total intereses a lo largo del préstamo${r.tipoHipoteca === "fija" ? "" : " (suponiendo Euríbor constante)"}</span><span>${fmtEUR(r.totalIntereses)}</span></div>
    <div class="kpi-row"><span>Cuota mensual total (con hipotecas actuales)</span><span>${fmtEUR(r.cuotaMensualTotalDespues)}</span></div>
    ${esfuerzoHtml}
    ${estresHtml}
    ${colchonHtml}
    <div class="kpi-row"><span>Patrimonio neto actual</span><span>${fmtEUR(r.patrimonioNetoActual)}</span></div>
    <div class="kpi-row"><span><strong>Impacto inmediato en patrimonio neto</strong></span><span class="neg"><strong>${fmtEUR(r.impactoPatrimonioNeto)}</strong></span></div>
    <p class="muted">El precio pagado se convierte en un activo del mismo valor, así que el patrimonio neto solo baja por los costes de la operación (impuestos + gastos) — el precio en sí no te empobrece, solo cambia de forma.</p>
    ${
      r.valorVentaViviendaHabitual > 0
        ? `<p class="muted">La venta de tu vivienda habitual se cuenta solo como fuente de financiación (la cantidad que aportas a la operación) — no se modelan sus propios gastos (agencia, notaría) ni una posible ganancia patrimonial en el IRPF.</p>`
        : ""
    }
  `;
}

function fmtPct2(n) {
  if (n == null || isNaN(n)) return "—";
  return `${Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

// Desglose del gasto bruto → neto mensual (simulacionRetirada, en metrics.js).
function netoMensualHtml(s) {
  const fila = (etiqueta, valor, clase = "") => `<div class="kpi-row"><span>${etiqueta}</span><span class="${clase}">${valor}</span></div>`;
  const menos = (valor) => (valor > 0.5 ? `−${fmtEUR(valor)}` : fmtEUR(0));
  const pctReparto = (x) => fmtPct(x * 100);
  const avisos = s.avisos.map((a) => `<p class="muted">⚠ ${esc(a)}</p>`).join("");

  const detalleAhorro = `plusvalías de fondos ${fmtEUR(s.plusvaliaRealizada)} + dividendos ${fmtEUR(s.dividendos)} + intereses ${fmtEUR(s.intereses)}`;

  return `
    <h4 style="margin:18px 0 6px">Neto mensual disponible (estimación a fecha de hoy)</h4>
    ${fila(
      `Gasto bruto anual <span class="muted">(retirada de la cartera ${fmtEUR(s.retirada)}${s.alquiler > 0 ? ` + alquiler ${fmtEUR(s.alquiler)}` : ""})</span>`,
      `<strong>${fmtEUR(s.gastoBruto)}</strong>`
    )}
    ${fila(
      `IRPF base del ahorro <span class="muted">(${detalleAhorro})</span>`,
      menos(s.cuotaAhorro),
      "neg"
    )}
    ${s.alquiler > 0 ? fila(`IRPF alquileres <span class="muted">(base general)</span>`, menos(s.irpfAlquiler), "neg") : ""}
    ${s.reparto.planes > 0 ? fila(`IRPF rescate de planes de pensiones <span class="muted">(base general: ${fmtEUR(s.retiradaPlanes)} rescatados)</span>`, menos(s.irpfPlanes), "neg") : ""}
    ${fila(`Impuesto sobre el Patrimonio <span class="muted">(estimado hoy, ver Fiscalidad)</span>`, menos(s.patrimonioImpuesto), "neg")}
    ${fila(`Neto anual`, `<strong>${fmtEUR(s.netoAnual)}</strong>`)}
    ${fila(`<strong>Neto mensual disponible</strong>`, `<strong class="${s.netoMensual < 0 ? "neg" : "pos"}">${fmtEUR(s.netoMensual)}</strong>`)}
    ${fila(`Impuestos totales sobre el gasto bruto`, `${fmtEUR(s.impuestosTotales)} (${fmtPct(s.tipoEfectivoPct)})`)}
    ${avisos}
    <p class="muted">La retirada sale a prorrata de lo que tienes: ${pctReparto(s.reparto.inversion)} fondos/ETF/acciones, ${pctReparto(s.reparto.planes)} planes de pensiones, ${pctReparto(s.reparto.liquidez)} liquidez. En fondos solo tributa la parte de plusvalía (${fmtPct(s.plusvaliaPct)} de lo retirado); en planes de pensiones tributa todo el rescate como rendimiento del trabajo (base general); en cuentas y depósitos, solo los intereses (supuesto ${fmtPct(s.interesLiquidezPct)} anual). Dividendos: los de los últimos 12 meses registrados. Reparto a partes iguales entre ${s.contribuyentes} contribuyente${s.contribuyentes > 1 ? "s" : ""}, con la escala del ahorro y la general de Galicia de Ajustes (el alquiler se grava sin reducción ni gastos salvo que los indiques en los supuestos). No incluye pensión pública, deducciones personales distintas del mínimo, ni cambios futuros de normativa: es una foto de hoy, aproximada y no sustituye a tu declaración.</p>
  `;
}

// --- Monte Carlo ---

// 1.234.567 → "1,2 M€"; 56.000 → "56 k€" (etiquetas de los ejes).
function fmtCorto(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M€`;
  if (a >= 1e3) return `${Math.round(n / 1e3).toLocaleString("es-ES")} k€`;
  return `${Math.round(n)} €`;
}

// Gráfico de abanico: banda entre el escenario bajista (percentil 10) y el
// alcista (90), con el central (mediana) en medio. Colores por CSS para que
// respete el tema claro/oscuro; los tres trazos se distinguen también por el
// estilo de línea, no solo por el color.
function graficoAbanicoHtml(mc) {
  const W = 640;
  const H = 280;
  const mIzq = 64;
  const mDer = 12;
  const mSup = 12;
  const mInf = 30;
  const d90 = mc.duracion.alcista;
  const ultimo = Number.isFinite(d90) ? Math.min(mc.anios, Math.max(10, d90 + 3)) : mc.anios;
  const pts = mc.serie.filter((s) => s.anio <= ultimo);
  const yMax = Math.max(...pts.map((s) => s.p90), 1) * 1.05;
  const x = (anio) => mIzq + (anio / ultimo) * (W - mIzq - mDer);
  const y = (v) => mSup + (1 - v / yMax) * (H - mSup - mInf);
  const punto = (s, clave) => `${x(s.anio).toFixed(1)},${y(s[clave]).toFixed(1)}`;
  const linea = (clave) => pts.map((s, i) => `${i ? "L" : "M"}${punto(s, clave)}`).join(" ");
  const banda = `${pts.map((s, i) => `${i ? "L" : "M"}${punto(s, "p90")}`).join(" ")} ${[...pts].reverse().map((s) => `L${punto(s, "p10")}`).join(" ")} Z`;

  const paso = ultimo <= 20 ? 5 : 10;
  let ejeX = "";
  for (let a = 0; a <= ultimo; a += paso) {
    ejeX += `<line x1="${x(a)}" y1="${mSup}" x2="${x(a)}" y2="${H - mInf}" style="stroke:var(--border);stroke-width:1" />
             <text x="${x(a)}" y="${H - 10}" text-anchor="middle" style="fill:var(--muted);font-size:11px">${a === 0 ? "hoy" : `año ${a}`}</text>`;
  }
  let ejeY = "";
  for (let k = 0; k <= 4; k++) {
    const v = (yMax * k) / 4;
    ejeY += `<line x1="${mIzq}" y1="${y(v)}" x2="${W - mDer}" y2="${y(v)}" style="stroke:var(--border);stroke-width:1" />
             <text x="${mIzq - 6}" y="${y(v) + 4}" text-anchor="end" style="fill:var(--muted);font-size:11px">${fmtCorto(v)}</text>`;
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:10px" role="img" aria-label="Abanico de escenarios del patrimonio año a año: bajista, central y alcista">
      ${ejeX}${ejeY}
      <path d="${banda}" style="fill:var(--brand-light);fill-opacity:0.2;stroke:none" />
      <path d="${linea("p10")}" style="fill:none;stroke:var(--neg);stroke-width:2;stroke-dasharray:6 4" />
      <path d="${linea("p90")}" style="fill:none;stroke:var(--pos);stroke-width:2;stroke-dasharray:2 4" />
      <path d="${linea("p50")}" style="fill:none;stroke:var(--text);stroke-width:2.4" />
    </svg>
    <p class="muted" style="margin-top:4px"><span style="color:var(--neg)">- - Bajista</span> (1 de cada 10 futuros es peor) · <span style="color:var(--text)">— Central</span> (mediana) · <span style="color:var(--pos)">··· Alcista</span> (1 de cada 10 es mejor)</p>
  `;
}

function duracionTexto(d, anios) {
  return Number.isFinite(d) ? `${d} años` : `más de ${anios} años`;
}

function patrimonioEn(serie, anio, clave) {
  const s = serie[anio];
  return s && s[clave] > 0 ? fmtEUR(s[clave]) : "agotado";
}

function monteCarloHtml(mc, info) {
  const probs = mc.probabilidades
    .map((p) => {
      const pct = p.prob * 100;
      const clase = pct >= 90 ? "pos" : pct < 75 ? "neg" : "";
      return `<div class="kpi-row"><span>Probabilidad de que el patrimonio dure ${p.horizonte} años</span><span class="${clase}"><strong>${fmtPct(pct)}</strong></span></div>`;
    })
    .join("");
  const filaEsc = (nombre, clave, serieClave) =>
    `<tr><td>${nombre}</td><td><strong>${duracionTexto(mc.duracion[clave], mc.anios)}</strong></td>${[10, 20, 30]
      .map((a) => `<td>${patrimonioEn(mc.serie, a, serieClave)}</td>`)
      .join("")}</tr>`;

  return `
    <h4 style="margin:22px 0 6px">Monte Carlo: ${mc.simulaciones.toLocaleString("es-ES")} futuros posibles</h4>
    <p class="muted">Rentabilidad media ${fmtPct(info.rentabilidadPct)}, volatilidad ${fmtPct(mc.volatilidadPct)} ${info.volManual ? "(indicada por ti)" : "(media de tus clases de activo, sin descontar diversificación: prudente)"}, inflación ${fmtPct(info.inflacionPct)}.</p>
    ${probs}
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Escenario</th><th>Dura</th><th>Patrimonio a los 10 años</th><th>A los 20 años</th><th>A los 30 años</th></tr></thead>
      <tbody>
        ${filaEsc("Bajista", "bajista", "p10")}
        ${filaEsc("Central", "central", "p50")}
        ${filaEsc("Alcista", "alcista", "p90")}
      </tbody>
    </table></div>
    ${graficoAbanicoHtml(mc)}
    <p class="muted">Cada futuro aplica una rentabilidad distinta cada año (distribución lognormal con la rentabilidad media y la volatilidad de arriba) y retira el gasto bruto de la cartera, creciendo con la inflación. Bajista = el 10 % de futuros peores; alcista = el 10 % mejores. El escenario central queda por debajo del cálculo determinista de más arriba porque la volatilidad resta rentabilidad compuesta. Importes nominales (sin descontar inflación). Los años de cada rentabilidad son independientes y sin «colas gordas»: un desplome como el de 2008 o una década perdida pueden ser peores que lo que genera este modelo, y la volatilidad por clase es un supuesto mío, no medida en tu cartera. Colores orientativos: verde ≥ 90 %, rojo &lt; 75 %. Semilla ${mc.semilla}.</p>
    <div class="btn-row"><button type="button" class="link-btn" id="btn-mc-semilla">Simular otros ${MC_SIMULACIONES.toLocaleString("es-ES")} futuros (cambiar semilla)</button></div>
  `;
}

function resultadoHtml(resultado, sim) {
  const maxValue = Math.max(...resultado.serie.map((s) => s.patrimonio), 1);
  const bars = resultado.serie
    .map(
      (s) => `
        <div class="evo-bar-col">
          <div class="evo-bar-value">${fmtEUR(s.patrimonio)}</div>
          <div class="evo-bar" style="height:${Math.max(2, (s.patrimonio / maxValue) * 100)}%; background:${s.patrimonio > 0 ? "var(--brand-light)" : "var(--neg)"}"></div>
          <div class="evo-bar-year">Año ${s.anio}</div>
        </div>
      `
    )
    .join("");

  return `
    <div class="kpi-row">
      <span>Patrimonio financiero de partida${sim.personalizado ? ` <span class="muted">(el real con tus casillas es ${fmtEUR(sim.patrimonioReal)})</span>` : ""}</span><span>${fmtEUR(sim.patrimonioBase)}</span>
    </div>
    <div class="kpi-row">
      <span>Retirada anual de la cartera${sim.gastoManual ? " (según tu gasto indicado)" : ` (regla del ${fmtPct(sim.tasaRetiradaPct)})`}</span><span>${fmtEUR(sim.retirada)} · ${fmtPct2(sim.tasaEfectivaPct)} del patrimonio</span>
    </div>
    ${resultado.alquilerAnual > 0 ? `<div class="kpi-row"><span>Ingreso por alquiler incluido</span><span class="pos">${fmtEUR(resultado.alquilerAnual)}/año</span></div>` : ""}
    <div class="kpi-row">
      <span><strong>${resultado.agotado ? "El patrimonio se agota en" : "Aguanta más de"}</strong></span>
      <span><strong>${resultado.aniosDuracion} años</strong></span>
    </div>
    ${netoMensualHtml(sim)}
    <div class="evo-chart">${bars}</div>
  `;
}

// --- Seguimiento de herencias ---

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function fmtFecha(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtEURSigno(n) {
  if (n == null || isNaN(n)) return "—";
  return (n > 0 ? "+" : "") + fmtEUR(n);
}

function fmtPctSigno(n, decimales = 1) {
  if (n == null || isNaN(n)) return "—";
  const txt = Number(n).toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return `${n > 0 ? "+" : ""}${txt} %`;
}

function claseSigno(n) {
  return n > 0 ? "pos" : n < 0 ? "neg" : "";
}

function filaResultado(etiqueta, valorHtml, claseValor = "") {
  return `<div class="kpi-row"><span>${etiqueta}</span><span class="${claseValor}">${valorHtml}</span></div>`;
}

function bloqueHerenciaHtml(r, editable) {
  const h = r.herencia;
  const botones = editable
    ? `<span><button type="button" class="link-btn" data-edit-herencia="${h.id}">editar</button> <button type="button" class="link-btn danger" data-remove-herencia="${h.id}">eliminar</button></span>`
    : "";
  const dondeEsta = r.destino ? esc(r.destino.name) : "—";
  const avisos = r.avisos.map((a) => `<p class="muted neg">⚠ ${esc(a)}</p>`).join("");
  const cabecera = `<div class="kpi-row"><span><strong>${esc(h.nombre)}</strong></span>${botones}</div>`;
  if (!r.ok) return `<div class="herencia">${cabecera}${avisos}</div>`;

  const desdeControl = r.desdeControl
    ? `${filaResultado(
        `Desde la toma de control (${fmtFecha(r.desdeControl.fecha)}, ${fmtEUR(r.desdeControl.importe)})`,
        `${fmtEURSigno(r.desdeControl.gananciaEur)} (${fmtPctSigno(r.desdeControl.gananciaPct)})`,
        claseSigno(r.desdeControl.gananciaEur)
      )}
       ${filaResultado(
        "Media mensual desde la toma de control",
        `${fmtEURSigno(r.desdeControl.mediaMensualEur)}/mes · ${fmtPctSigno(r.desdeControl.mensualEquivPct, 2)}/mes`,
        claseSigno(r.desdeControl.mediaMensualEur)
      )}`
    : "";

  const serie = `
    <details>
      <summary class="muted">Evolución con las posiciones registradas</summary>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Fecha</th><th>Qué</th><th>Valor</th><th>Frente al importe de partida</th></tr></thead>
        <tbody>${r.serie
          .map(
            (s) => `<tr>
              <td>${fmtFecha(s.fecha)}</td>
              <td>${esc(s.etiqueta)}</td>
              <td>${fmtEUR(s.valor)}</td>
              <td class="${claseSigno(s.gananciaEur)}">${fmtEURSigno(s.gananciaEur)} (${fmtPctSigno(s.gananciaPct)})</td>
            </tr>`
          )
          .join("")}</tbody>
      </table></div>
    </details>`;

  return `<div class="herencia">
    ${cabecera}
    ${filaResultado("Dónde está hoy", dondeEsta)}
    ${filaResultado(`Valor en la herencia (${fmtFecha(h.fecha)})`, fmtEUR(r.inicial))}
    ${filaResultado(`Valor actual (última posición, ${fmtFecha(r.fechaDatos)})`, fmtEUR(r.valorActual))}
    ${filaResultado("<strong>Ganancia / pérdida total</strong>", `<strong>${fmtEURSigno(r.gananciaEur)} (${fmtPctSigno(r.gananciaPct)})</strong>`, claseSigno(r.gananciaEur))}
    ${filaResultado("Tiempo transcurrido", fmtMeses(r.meses))}
    ${filaResultado("<strong>Media mensual (ganancia ÷ meses)</strong>", `<strong>${fmtEURSigno(r.mediaMensualEur)}/mes</strong>`, claseSigno(r.mediaMensualEur))}
    ${filaResultado("Rentabilidad mensual equivalente (compuesta)", `${fmtPctSigno(r.mensualEquivPct, 2)}/mes`, claseSigno(r.mensualEquivPct))}
    ${r.anualEquivPct != null ? filaResultado("Equivalente anual", fmtPctSigno(r.anualEquivPct), claseSigno(r.anualEquivPct)) : ""}
    ${desdeControl}
    ${avisos}
    ${serie}
  </div>`;
}

function renderHerencias(seccion) {
  const editable = !esModoFamilia();
  const { items, total } = evolucionHerencias();

  const totalHtml = total
    ? `<div class="herencia">
        <div class="kpi-row"><span><strong>Total de las herencias</strong></span><span></span></div>
        ${filaResultado("Valor en las herencias", fmtEUR(total.inicial))}
        ${filaResultado(`Valor actual (hasta ${fmtFecha(total.fechaDatos)})`, fmtEUR(total.valorActual))}
        ${filaResultado("<strong>Ganancia / pérdida total</strong>", `<strong>${fmtEURSigno(total.gananciaEur)} (${fmtPctSigno(total.gananciaPct)})</strong>`, claseSigno(total.gananciaEur))}
        ${filaResultado("<strong>Media mensual (suma de las de cada herencia)</strong>", `<strong>${fmtEURSigno(total.mediaMensualEur)}/mes</strong>`, claseSigno(total.mediaMensualEur))}
      </div>`
    : "";

  seccion.innerHTML = `
    <h3>Herencias: ¿cuánto han ganado o perdido desde que las heredé?</h3>
    <p class="muted">Compara lo que valían los fondos heredados el día de la herencia con la última posición registrada del activo donde están hoy, y reparte la ganancia o pérdida por meses. No son precios en vivo: «hoy» es la fecha de tu última posición en Posiciones, y el resultado se recalcula solo al actualizarla. Es una variación bruta (antes de impuestos); la media mensual simple es ganancia ÷ meses, y la equivalente compuesta es el % mensual constante que daría el mismo resultado final.</p>
    ${items.map((r) => bloqueHerenciaHtml(r, editable)).join("") || '<p class="muted">Todavía no hay ninguna herencia registrada.</p>'}
    ${totalHtml}
    ${editable ? '<div class="btn-row"><button type="button" id="btn-new-herencia">+ Añadir herencia</button></div>' : ""}
  `;

  if (!editable) return;

  const guardar = (lista) => {
    store.updateMeta({ herencias: lista });
    renderHerencias(seccion);
  };
  const listaActual = () => [...(store.get().meta.herencias || [])];

  seccion.querySelector("#btn-new-herencia").addEventListener("click", () => abrirFormularioHerencia(null, guardar, listaActual));
  seccion.querySelectorAll("[data-edit-herencia]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const h = listaActual().find((x) => x.id === btn.dataset.editHerencia);
      if (h) abrirFormularioHerencia(h, guardar, listaActual);
    })
  );
  seccion.querySelectorAll("[data-remove-herencia]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (confirm("¿Eliminar esta herencia del seguimiento? No se borra ninguna posición ni movimiento, solo este cálculo.")) {
        guardar(listaActual().filter((x) => x.id !== btn.dataset.removeHerencia));
      }
    })
  );
}

function abrirFormularioHerencia(editing, guardar, listaActual) {
  const data = store.get();
  const entidad = (id) => data.entities.find((e) => e.id === id)?.name;
  const activos = data.assets
    .filter((a) => a.class !== "inmobiliario")
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const opciones = (seleccionado) =>
    activos
      .map((a) => `<option value="${a.id}" ${a.id === seleccionado ? "selected" : ""}>${esc(a.name)}${entidad(a.entityId) ? ` · ${esc(entidad(a.entityId))}` : ""}</option>`)
      .join("");

  openModal(editing ? "Editar herencia" : "Añadir herencia", (body, closeModal) => {
    body.innerHTML = `
      <form id="form-herencia" class="stacked-form">
        <label>Nombre
          <input name="nombre" required placeholder="Ej.: Herencia Quality → Cartesio" value="${esc(editing?.nombre || "")}" />
        </label>
        <label>Fecha de la herencia
          <input name="fecha" type="date" min="2000-01-01" required value="${editing?.fecha || ""}" />
        </label>
        <label>Valor a esa fecha (€) — el del certificado de posiciones
          <input name="importeInicial" type="number" step="any" min="0.01" required value="${editing?.importeInicial ?? ""}" />
        </label>
        <label>Dónde está hoy
          <select name="assetId" required><option value="">Elige el activo…</option>${opciones(editing?.assetId)}</select>
        </label>
        <label>Dónde estaba antes (opcional, si ya lo has traspasado y figura en la app)
          <select name="origenId"><option value="">(no figura en la app)</option>${opciones(editing?.origenId)}</select>
        </label>
        <label>Toma de control efectivo — fecha (opcional)
          <input name="fechaControl" type="date" min="2000-01-01" value="${editing?.fechaControl || ""}" />
        </label>
        <label>Toma de control efectivo — valor ese día (€, opcional)
          <input name="importeControl" type="number" step="any" min="0.01" value="${editing?.importeControl ?? ""}" />
        </label>
        <button type="submit">${editing ? "Guardar cambios" : "Guardar herencia"}</button>
      </form>
    `;
    const form = body.querySelector("#form-herencia");
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const fecha = fd.get("fecha");
      const fechaControl = fd.get("fechaControl") || null;
      const importeControl = fd.get("importeControl") ? Number(fd.get("importeControl")) : null;
      const origenId = fd.get("origenId") || null;
      if (origenId && origenId === fd.get("assetId")) {
        alert("«Dónde estaba antes» y «Dónde está hoy» no pueden ser el mismo activo.");
        return;
      }
      if ((fechaControl && !importeControl) || (!fechaControl && importeControl)) {
        alert("Para la toma de control indica la fecha y el valor, o deja las dos casillas en blanco.");
        return;
      }
      if (fechaControl && fechaControl <= fecha) {
        alert("La toma de control tiene que ser posterior a la fecha de la herencia.");
        return;
      }
      const payload = {
        id: editing?.id || uid(),
        nombre: fd.get("nombre").trim(),
        fecha,
        importeInicial: Number(fd.get("importeInicial")),
        assetId: fd.get("assetId"),
        origenId,
        fechaControl,
        importeControl,
      };
      const lista = listaActual();
      const idx = lista.findIndex((x) => x.id === payload.id);
      if (idx >= 0) lista[idx] = payload;
      else lista.push(payload);
      closeModal();
      guardar(lista);
    });
  });
}

export function renderSimuladores(container) {
  const data = store.get();
  const meta = data.meta;
  const alquiler = alquilerAnualTotal();
  const compTotal = composicionFinancieraParaRetirada();
  const tipoHipotecaGuardado = meta.compraPropiedadTipoHipoteca || "fija";

  container.innerHTML = `
    <div class="section-head">
      <h3>Simuladores</h3>
    </div>

    <section class="card">
      <h3>¿Cuánto dura mi patrimonio?</h3>
      <p class="muted">Simulación simplificada: rentabilidad anual constante (sin volatilidad de mercado ni riesgo de secuencia de rentabilidad) y gasto que crece con la inflación, sin pensión pública. Parte de tu patrimonio financiero (los inmuebles no se venden, solo aportan su alquiler si lo activas). Si dejas el gasto en blanco se aplica la regla de retirada (por defecto el 4 % del patrimonio de partida, más el alquiler si lo incluyes); el gasto es <strong>bruto</strong> y de él salen los impuestos, que se estiman abajo para darte el neto mensual.</p>
      <form id="form-simulador" class="stacked-form">
        <label>Tasa de retirada anual (%) — regla del 4 %
          <input name="tasaRetiradaPct" type="number" step="any" min="0" value="${meta.jubilacionTasaRetiradaPct ?? DEFAULT_TASA_RETIRADA_PCT}" required />
        </label>
        <label>Patrimonio financiero de partida (€) — en blanco = el real
          <input name="patrimonioInicial" type="number" step="any" min="0" value="${meta.jubilacionPatrimonioInicial ?? ""}" />
        </label>
        <label class="checkbox-label">
          <input name="incluirPlanes" type="checkbox" ${meta.jubilacionIncluirPlanes !== false ? "checked" : ""} />
          Incluir planes de pensiones (${fmtEUR(compTotal.planesTotal)}; tributan aparte al rescatarlos)
        </label>
        <label class="checkbox-label">
          <input name="incluirLiquidez" type="checkbox" ${meta.jubilacionIncluirLiquidez !== false ? "checked" : ""} />
          Incluir liquidez: cuentas y depósitos (${fmtEUR(compTotal.liquidezTotal)})
        </label>
        <p class="muted" id="ayuda-patrimonio"></p>
        <label>Gasto anual deseado BRUTO (€) — en blanco = regla de retirada
          <input name="gastoAnual" type="number" step="any" min="0" value="${meta.jubilacionGastoAnual ?? ""}" />
        </label>
        <div class="btn-row">
          <button type="button" class="link-btn" id="btn-usar-regla">Usar la regla de retirada (borrar el gasto indicado)</button>
        </div>
        <label>Rentabilidad anual esperada de la cartera (%)
          <input name="rentabilidadPct" type="number" step="any" value="${meta.jubilacionRentabilidadPct ?? ""}" required />
        </label>
        <label>Inflación anual esperada (%)
          <input name="inflacionPct" type="number" step="any" value="${meta.jubilacionInflacionPct}" required />
        </label>
        <label class="checkbox-label">
          <input name="incluirAlquileres" type="checkbox" ${meta.jubilacionIncluirAlquileres ? "checked" : ""} />
          Incluir ingresos por alquiler (${fmtEUR(alquiler)}/año hoy)
        </label>
        <details class="supuestos">
          <summary>Supuestos fiscales (editables)</summary>
          <label>Contribuyentes entre los que se reparte (gananciales = 2)
            <input name="contribuyentes" type="number" step="1" min="1" value="${meta.jubilacionContribuyentes ?? 2}" />
          </label>
          <label>Otras rentas anuales de base general del hogar (€) — solo para saber en qué tramo caen alquiler y planes
            <input name="otrasRentasGeneral" type="number" step="any" min="0" value="${meta.jubilacionOtrasRentasGeneral ?? 0}" />
          </label>
          <label>Interés medio de cuentas y depósitos (%/año)
            <input name="interesLiquidezPct" type="number" step="any" min="0" value="${meta.jubilacionInteresLiquidezPct ?? DEFAULT_INTERES_LIQUIDEZ_PCT}" />
          </label>
          <label>% de plusvalía en lo que se retira de fondos — en blanco = el de tu cartera hoy (${fmtPct(compTotal.plusvaliaPct)})
            <input name="plusvaliaPct" type="number" step="any" min="0" max="100" value="${meta.jubilacionPlusvaliaPct ?? ""}" />
          </label>
          <label>Gastos deducibles del alquiler (% sobre el alquiler: IBI, comunidad, seguro, amortización…)
            <input name="gastosAlquilerPct" type="number" step="any" min="0" max="100" value="${meta.jubilacionGastosAlquilerPct ?? 0}" />
          </label>
          <label>Reducción del rendimiento neto del alquiler (%) — la que te corresponda por tu contrato (a 0 se grava entero)
            <input name="reduccionAlquilerPct" type="number" step="any" min="0" max="100" value="${meta.jubilacionReduccionAlquilerPct ?? 0}" />
          </label>
          <p class="muted">Las reducciones del alquiler de vivienda dependen de la fecha del contrato y de la zona, y el Real Decreto-ley 29/2026 (octubre) las ha modificado: por eso empiezan a 0 %. Consúltalo con tu gestor. Las escalas del IRPF se editan en Ajustes.</p>
        </details>
        <details class="supuestos">
          <summary>Supuestos del Monte Carlo (volatilidad)</summary>
          <label>Volatilidad anual de la renta variable (%)
            <input name="mcVolRentaVariable" type="number" step="any" min="0" value="${meta.jubilacionMcVolRentaVariable ?? DEFAULT_MC_VOLATILIDADES_PCT.renta_variable}" />
          </label>
          <label>Volatilidad anual de los fondos mixtos (%)
            <input name="mcVolMixto" type="number" step="any" min="0" value="${meta.jubilacionMcVolMixto ?? DEFAULT_MC_VOLATILIDADES_PCT.mixto}" />
          </label>
          <label>Volatilidad anual de la renta fija (%) — si es monetaria, mucho menos
            <input name="mcVolRentaFija" type="number" step="any" min="0" value="${meta.jubilacionMcVolRentaFija ?? DEFAULT_MC_VOLATILIDADES_PCT.renta_fija}" />
          </label>
          <label>Volatilidad anual de la liquidez (%)
            <input name="mcVolLiquidez" type="number" step="any" min="0" value="${meta.jubilacionMcVolLiquidez ?? DEFAULT_MC_VOLATILIDADES_PCT.liquidez}" />
          </label>
          <label>Volatilidad de toda la cartera (%) — en blanco = media ponderada por tus pesos (<span id="vol-defecto">—</span>)
            <input name="mcVolCartera" type="number" step="any" min="0" value="${meta.jubilacionMcVolCartera ?? ""}" />
          </label>
          <p class="muted">La volatilidad es cuánto se mueve la rentabilidad de un año a otro. Son valores orientativos míos, no medidos sobre tu cartera; la media ponderada es prudente porque no descuenta el efecto de diversificar.</p>
        </details>
        <div class="btn-row">
          <button type="submit">Calcular</button>
        </div>
      </form>
      <div id="resultado-simulador"></div>
    </section>

    <section class="card">
      <h3>¿Podemos comprar otra propiedad?</h3>
      <p class="muted">Simulación de una compra financiada con hipoteca fija, variable o mixta (cuota constante, sistema francés). Impuestos, gastos, ingresos y gastos del hogar configurables en Ajustes.</p>
      <form id="form-compra" class="stacked-form">
        <label>Precio de la propiedad (€)
          <input name="precio" type="number" step="any" min="0" value="${meta.compraPropiedadPrecio ?? ""}" required />
        </label>
        <label>Tipo de vivienda
          <select name="tipoVivienda">
            <option value="usada" ${meta.compraPropiedadTipoVivienda !== "nueva" ? "selected" : ""}>Usada (ITP)</option>
            <option value="nueva" ${meta.compraPropiedadTipoVivienda === "nueva" ? "selected" : ""}>Nueva (IVA + AJD)</option>
          </select>
        </label>
        <label>Importe a hipotecar (€)
          <input name="importeHipoteca" type="number" step="any" min="0" value="${meta.compraPropiedadImporteHipoteca ?? ""}" required />
        </label>
        <label>Tipo de hipoteca
          <select name="tipoHipoteca" id="tipo-hipoteca">
            <option value="fija" ${tipoHipotecaGuardado === "fija" ? "selected" : ""}>Fija</option>
            <option value="variable" ${tipoHipotecaGuardado === "variable" ? "selected" : ""}>Variable (Euríbor + diferencial)</option>
            <option value="mixta" ${tipoHipotecaGuardado === "mixta" ? "selected" : ""}>Mixta (fija los primeros años, luego variable)</option>
          </select>
        </label>
        <label id="grupo-tipo-fijo"><span id="label-tipo-fijo">Tipo de interés fijo anual (%)</span>
          <input name="tipoInteresPct" type="number" step="any" min="0" value="${meta.compraPropiedadTipoInteresPct ?? ""}" required />
        </label>
        <label id="grupo-anios-fijos">Años a tipo fijo
          <input name="aniosFijos" type="number" step="any" min="0" value="${meta.compraPropiedadAniosFijos ?? ""}" required />
        </label>
        <label id="grupo-euribor">Euríbor actual (%)
          <input name="euriborPct" type="number" step="any" value="${meta.compraPropiedadEuriborPct ?? ""}" required />
        </label>
        <label id="grupo-diferencial">Diferencial sobre el Euríbor (%)
          <input name="diferencialPct" type="number" step="any" value="${meta.compraPropiedadDiferencialPct ?? ""}" required />
        </label>
        <label>Plazo (años)
          <input name="plazoAnios" type="number" step="1" min="1" value="${meta.compraPropiedadPlazoAnios ?? ""}" required />
        </label>
        <label>Valor de venta de vivienda habitual aportado a la operación (€, opcional)
          <input name="valorVentaViviendaHabitual" type="number" step="any" min="0" value="${meta.compraPropiedadValorVentaViviendaHabitual ?? ""}" placeholder="Déjalo en blanco si no vendes tu vivienda actual" />
        </label>
        <div class="btn-row">
          <button type="submit">Calcular</button>
        </div>
      </form>
      <div id="resultado-compra"></div>
    </section>

    <section class="card" id="card-herencias"></section>
  `;

  const form = container.querySelector("#form-simulador");
  const resultadoDiv = container.querySelector("#resultado-simulador");

  // Un campo en blanco se guarda como null (= "usa el valor por defecto").
  const numOpcional = (fd, nombre) => {
    const v = fd.get(nombre);
    return v === null || String(v).trim() === "" ? null : Number(v);
  };

  function leerParametros() {
    const fd = new FormData(form);
    return {
      tasaRetiradaPct: numOpcional(fd, "tasaRetiradaPct") ?? DEFAULT_TASA_RETIRADA_PCT,
      patrimonioInicial: numOpcional(fd, "patrimonioInicial"),
      incluirPlanes: fd.get("incluirPlanes") === "on",
      incluirLiquidez: fd.get("incluirLiquidez") === "on",
      gastoAnual: numOpcional(fd, "gastoAnual"),
      rentabilidadPct: Number(fd.get("rentabilidadPct")),
      inflacionPct: Number(fd.get("inflacionPct")),
      incluirAlquileres: fd.get("incluirAlquileres") === "on",
      contribuyentes: numOpcional(fd, "contribuyentes") ?? 2,
      otrasRentasGeneral: numOpcional(fd, "otrasRentasGeneral") ?? 0,
      interesLiquidezPct: numOpcional(fd, "interesLiquidezPct") ?? DEFAULT_INTERES_LIQUIDEZ_PCT,
      plusvaliaPct: numOpcional(fd, "plusvaliaPct"),
      gastosAlquilerPct: numOpcional(fd, "gastosAlquilerPct") ?? 0,
      reduccionAlquilerPct: numOpcional(fd, "reduccionAlquilerPct") ?? 0,
      mcVols: {
        renta_variable: numOpcional(fd, "mcVolRentaVariable") ?? DEFAULT_MC_VOLATILIDADES_PCT.renta_variable,
        mixto: numOpcional(fd, "mcVolMixto") ?? DEFAULT_MC_VOLATILIDADES_PCT.mixto,
        renta_fija: numOpcional(fd, "mcVolRentaFija") ?? DEFAULT_MC_VOLATILIDADES_PCT.renta_fija,
        liquidez: numOpcional(fd, "mcVolLiquidez") ?? DEFAULT_MC_VOLATILIDADES_PCT.liquidez,
      },
      mcVolCartera: numOpcional(fd, "mcVolCartera"),
    };
  }

  function calcularYMostrar() {
    const params = leerParametros();
    store.updateMeta({
      jubilacionTasaRetiradaPct: params.tasaRetiradaPct,
      jubilacionPatrimonioInicial: params.patrimonioInicial,
      jubilacionIncluirPlanes: params.incluirPlanes,
      jubilacionIncluirLiquidez: params.incluirLiquidez,
      jubilacionGastoAnual: params.gastoAnual,
      jubilacionRentabilidadPct: params.rentabilidadPct,
      jubilacionInflacionPct: params.inflacionPct,
      jubilacionIncluirAlquileres: params.incluirAlquileres,
      jubilacionContribuyentes: params.contribuyentes,
      jubilacionOtrasRentasGeneral: params.otrasRentasGeneral,
      jubilacionInteresLiquidezPct: params.interesLiquidezPct,
      jubilacionPlusvaliaPct: params.plusvaliaPct,
      jubilacionGastosAlquilerPct: params.gastosAlquilerPct,
      jubilacionReduccionAlquilerPct: params.reduccionAlquilerPct,
      jubilacionMcVolRentaVariable: params.mcVols.renta_variable,
      jubilacionMcVolMixto: params.mcVols.mixto,
      jubilacionMcVolRentaFija: params.mcVols.renta_fija,
      jubilacionMcVolLiquidez: params.mcVols.liquidez,
      jubilacionMcVolCartera: params.mcVolCartera,
    });
    const sim = simulacionRetirada(params);
    const duracion = duracionPatrimonio({
      gastoAnual: sim.gastoBruto,
      rentabilidadPct: params.rentabilidadPct,
      inflacionPct: params.inflacionPct,
      incluirAlquileres: params.incluirAlquileres,
      patrimonioInicial: sim.patrimonioBase,
    });
    const volDefecto = volatilidadCartera({ incluirPlanes: params.incluirPlanes, incluirLiquidez: params.incluirLiquidez, volatilidadesPct: params.mcVols });
    const mc = simulacionMonteCarlo({
      patrimonioInicial: sim.patrimonioBase,
      retiradaAnual: sim.retirada,
      rentabilidadPct: params.rentabilidadPct,
      inflacionPct: params.inflacionPct,
      volatilidadPct: params.mcVolCartera ?? volDefecto.volPct,
      semilla: store.get().meta.jubilacionMcSemilla ?? DEFAULT_MC_SEMILLA,
    });
    resultadoDiv.innerHTML =
      resultadoHtml(duracion, sim) +
      monteCarloHtml(mc, {
        volManual: params.mcVolCartera != null,
        rentabilidadPct: params.rentabilidadPct,
        inflacionPct: params.inflacionPct,
      });
  }

  // Otra semilla = otros 10.000 futuros distintos (el botón se repinta con el resultado).
  resultadoDiv.addEventListener("click", (ev) => {
    if (!ev.target.closest("#btn-mc-semilla")) return;
    store.updateMeta({ jubilacionMcSemilla: Math.floor(Math.random() * 2147483647) });
    calcularYMostrar();
  });

  // Ayuda en vivo: patrimonio real con las casillas marcadas y gasto que
  // saldría con la regla, para que se vea el valor por defecto antes de calcular.
  const ayudaPatrimonio = container.querySelector("#ayuda-patrimonio");
  function refrescarAyuda() {
    const p = leerParametros();
    const s = simulacionRetirada({ ...p, gastoAnual: null });
    const vol = volatilidadCartera({ incluirPlanes: p.incluirPlanes, incluirLiquidez: p.incluirLiquidez, volatilidadesPct: p.mcVols });
    container.querySelector("#vol-defecto").textContent = fmtPct(vol.volPct);
    ayudaPatrimonio.textContent = `Patrimonio financiero real con estas casillas: ${fmtEUR(s.patrimonioReal)}. Con la regla del ${fmtPct(s.tasaRetiradaPct)}${s.alquiler > 0 ? " más el alquiler" : ""}, el gasto bruto anual sería ${fmtEUR(s.gastoBruto)} (${fmtEUR(s.gastoBruto / 12)}/mes).`;
  }
  form.addEventListener("input", refrescarAyuda);
  refrescarAyuda();

  container.querySelector("#btn-usar-regla").addEventListener("click", () => {
    form.querySelector('[name="gastoAnual"]').value = "";
    refrescarAyuda();
    if (form.reportValidity()) calcularYMostrar();
  });

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    calcularYMostrar();
  });

  if (meta.jubilacionRentabilidadPct != null) {
    calcularYMostrar();
  }

  const formCompra = container.querySelector("#form-compra");
  const resultadoCompraDiv = container.querySelector("#resultado-compra");

  // Muestra solo los campos que aplican al tipo de hipoteca elegido; los
  // ocultos se desactivan para que no bloqueen el envío del formulario.
  const tipoHipotecaSelect = formCompra.querySelector("#tipo-hipoteca");
  function refrescarCamposHipoteca() {
    const tipo = tipoHipotecaSelect.value;
    const visibles = {
      "grupo-tipo-fijo": tipo === "fija" || tipo === "mixta",
      "grupo-anios-fijos": tipo === "mixta",
      "grupo-euribor": tipo === "variable" || tipo === "mixta",
      "grupo-diferencial": tipo === "variable" || tipo === "mixta",
    };
    for (const [id, visible] of Object.entries(visibles)) {
      const grupo = formCompra.querySelector(`#${id}`);
      grupo.style.display = visible ? "" : "none";
      grupo.querySelector("input").disabled = !visible;
    }
    formCompra.querySelector("#label-tipo-fijo").textContent = tipo === "mixta" ? "Tipo fijo del periodo inicial (%)" : "Tipo de interés fijo anual (%)";
  }
  tipoHipotecaSelect.addEventListener("change", refrescarCamposHipoteca);
  refrescarCamposHipoteca();

  function calcularCompraYMostrar() {
    const fd = new FormData(formCompra);
    // Un campo oculto (desactivado) no viaja en el formulario: conserva el último valor guardado.
    const guardados = store.get().meta;
    const numero = (nombre, guardado) => (fd.get(nombre) !== null && fd.get(nombre) !== "" ? Number(fd.get(nombre)) : guardado ?? null);
    const params = {
      precio: Number(fd.get("precio")),
      tipoVivienda: fd.get("tipoVivienda"),
      importeHipoteca: Number(fd.get("importeHipoteca")),
      tipoHipoteca: fd.get("tipoHipoteca"),
      tipoInteresPct: numero("tipoInteresPct", guardados.compraPropiedadTipoInteresPct),
      euriborPct: numero("euriborPct", guardados.compraPropiedadEuriborPct),
      diferencialPct: numero("diferencialPct", guardados.compraPropiedadDiferencialPct),
      aniosFijos: numero("aniosFijos", guardados.compraPropiedadAniosFijos),
      plazoAnios: Number(fd.get("plazoAnios")),
      valorVentaViviendaHabitual: fd.get("valorVentaViviendaHabitual") ? Number(fd.get("valorVentaViviendaHabitual")) : 0,
    };
    store.updateMeta({
      compraPropiedadPrecio: params.precio,
      compraPropiedadTipoVivienda: params.tipoVivienda,
      compraPropiedadImporteHipoteca: params.importeHipoteca,
      compraPropiedadTipoHipoteca: params.tipoHipoteca,
      compraPropiedadTipoInteresPct: params.tipoInteresPct,
      compraPropiedadEuriborPct: params.euriborPct,
      compraPropiedadDiferencialPct: params.diferencialPct,
      compraPropiedadAniosFijos: params.aniosFijos,
      compraPropiedadPlazoAnios: params.plazoAnios,
      compraPropiedadValorVentaViviendaHabitual: params.valorVentaViviendaHabitual,
    });
    resultadoCompraDiv.innerHTML = resultadoCompraHtml(simulacionCompraPropiedad(params));
  }

  formCompra.addEventListener("submit", (ev) => {
    ev.preventDefault();
    calcularCompraYMostrar();
  });

  if (meta.compraPropiedadPrecio != null && meta.compraPropiedadImporteHipoteca != null) {
    calcularCompraYMostrar();
  }

  renderHerencias(container.querySelector("#card-herencias"));
}
