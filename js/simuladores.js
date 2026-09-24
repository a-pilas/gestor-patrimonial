import { store } from "./store.js";
import { duracionPatrimonio, alquilerAnualTotal, financialBreakdownBySubclass, simulacionCompraPropiedad } from "./metrics.js";

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

function resultadoCompraHtml(r) {
  const cambioInversion = r.inversionFinancieraTras - r.inversionFinancieraActual;
  const esfuerzoHtml =
    r.ingresosMensuales > 0
      ? `<div class="kpi-row"><span>Cuota de esta hipoteca sobre tus ingresos</span><span>${fmtPct(r.esfuerzoEstaHipotecaPct)}</span></div>
         <div class="kpi-row"><span>Cuotas totales sobre tus ingresos (hoy: ${fmtPct(r.esfuerzoActualPct)})</span><span class="${r.esfuerzoTotalPct > REF_ESFUERZO_PCT ? "neg" : ""}"><strong>${fmtPct(r.esfuerzoTotalPct)}</strong></span></div>
         <p class="muted">Sobre ingresos netos de ${fmtEUR(r.ingresosMensuales)}/mes. Referencia habitual: que el total de cuotas no pase de ~${REF_ESFUERZO_PCT}% (recomendación prudencial, no un límite legal).</p>`
      : `<p class="muted">Para ver qué % de tus ingresos se llevaría la cuota, indica tus ingresos netos mensuales en Ajustes → Simulador — Compra de propiedad.</p>`;
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
    <div class="kpi-row"><span>Cuota mensual de esta hipoteca</span><span>${fmtEUR(r.cuotaMensual)}</span></div>
    <div class="kpi-row"><span>Total intereses a lo largo del préstamo</span><span>${fmtEUR(r.totalIntereses)}</span></div>
    <div class="kpi-row"><span>Cuota mensual total (con hipotecas actuales)</span><span>${fmtEUR(r.cuotaMensualTotalDespues)}</span></div>
    ${esfuerzoHtml}
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

function resultadoHtml(resultado) {
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
      <span>Patrimonio financiero de partida</span><span>${fmtEUR(resultado.patrimonioInicial)}</span>
    </div>
    ${resultado.alquilerAnual > 0 ? `<div class="kpi-row"><span>Ingreso por alquiler incluido</span><span class="pos">${fmtEUR(resultado.alquilerAnual)}/año</span></div>` : ""}
    <div class="kpi-row">
      <span><strong>${resultado.agotado ? "El patrimonio se agota en" : "Aguanta más de"}</strong></span>
      <span><strong>${resultado.aniosDuracion} años</strong></span>
    </div>
    <div class="evo-chart">${bars}</div>
  `;
}

export function renderSimuladores(container) {
  const data = store.get();
  const meta = data.meta;
  const patrimonioInicial = financialBreakdownBySubclass().total;
  const alquiler = alquilerAnualTotal();

  container.innerHTML = `
    <div class="section-head">
      <h3>Simuladores</h3>
    </div>

    <section class="card">
      <h3>¿Cuánto dura mi patrimonio?</h3>
      <p class="muted">Simulación simplificada: rentabilidad anual constante (sin volatilidad de mercado ni riesgo de secuencia de rentabilidad), gasto que crece con la inflación, sin fiscalidad sobre los reembolsos ni pensión pública. Parte de tu patrimonio financiero actual (${fmtEUR(patrimonioInicial)}) — los inmuebles no se venden, solo aportan su alquiler si lo activas.</p>
      <form id="form-simulador" class="stacked-form">
        <label>Gasto anual deseado (€)
          <input name="gastoAnual" type="number" step="any" min="0" value="${meta.jubilacionGastoAnual ?? ""}" required />
        </label>
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
        <div class="btn-row">
          <button type="submit">Calcular</button>
        </div>
      </form>
      <div id="resultado-simulador"></div>
    </section>

    <section class="card">
      <h3>¿Podemos comprar otra propiedad?</h3>
      <p class="muted">Simulación de una compra financiada con hipoteca a tipo fijo (cuota constante, sistema francés). Impuestos y otros gastos configurables en Ajustes.</p>
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
        <label>Tipo de interés fijo anual (%)
          <input name="tipoInteresPct" type="number" step="any" min="0" value="${meta.compraPropiedadTipoInteresPct ?? ""}" required />
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
  `;

  const form = container.querySelector("#form-simulador");
  const resultadoDiv = container.querySelector("#resultado-simulador");

  function calcularYMostrar() {
    const fd = new FormData(form);
    const params = {
      gastoAnual: Number(fd.get("gastoAnual")),
      rentabilidadPct: Number(fd.get("rentabilidadPct")),
      inflacionPct: Number(fd.get("inflacionPct")),
      incluirAlquileres: fd.get("incluirAlquileres") === "on",
    };
    store.updateMeta({
      jubilacionGastoAnual: params.gastoAnual,
      jubilacionRentabilidadPct: params.rentabilidadPct,
      jubilacionInflacionPct: params.inflacionPct,
      jubilacionIncluirAlquileres: params.incluirAlquileres,
    });
    resultadoDiv.innerHTML = resultadoHtml(duracionPatrimonio(params));
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    calcularYMostrar();
  });

  if (meta.jubilacionGastoAnual != null && meta.jubilacionRentabilidadPct != null) {
    calcularYMostrar();
  }

  const formCompra = container.querySelector("#form-compra");
  const resultadoCompraDiv = container.querySelector("#resultado-compra");

  function calcularCompraYMostrar() {
    const fd = new FormData(formCompra);
    const params = {
      precio: Number(fd.get("precio")),
      tipoVivienda: fd.get("tipoVivienda"),
      importeHipoteca: Number(fd.get("importeHipoteca")),
      tipoInteresPct: Number(fd.get("tipoInteresPct")),
      plazoAnios: Number(fd.get("plazoAnios")),
      valorVentaViviendaHabitual: fd.get("valorVentaViviendaHabitual") ? Number(fd.get("valorVentaViviendaHabitual")) : 0,
    };
    store.updateMeta({
      compraPropiedadPrecio: params.precio,
      compraPropiedadTipoVivienda: params.tipoVivienda,
      compraPropiedadImporteHipoteca: params.importeHipoteca,
      compraPropiedadTipoInteresPct: params.tipoInteresPct,
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
}
