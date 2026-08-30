import { store } from "./store.js";
import { duracionPatrimonio, alquilerAnualTotal, financialBreakdownBySubclass } from "./metrics.js";

function fmtEUR(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
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
}
