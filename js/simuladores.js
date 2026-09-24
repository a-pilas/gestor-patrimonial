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
  const tipoHipotecaGuardado = meta.compraPropiedadTipoHipoteca || "fija";

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
}
