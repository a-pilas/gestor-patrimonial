import { store } from "./store.js";
import { gananciasRealizadasEnAño, dividendosEnAño, comisionesEnAño, cuotaAhorroEstimada } from "./metrics.js";

// Recuerda el año seleccionado entre renders (p.ej. al volver a esta pestaña).
let selectedYear = null;

function fmtEUR(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function aniosDisponibles(data) {
  const years = new Set([new Date().getFullYear()]);
  for (const m of data.movements) years.add(Number(m.date.slice(0, 4)));
  for (const p of data.positions) years.add(Number(p.date.slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}

export function renderFiscal(container) {
  const data = store.get();
  const years = aniosDisponibles(data);
  const year = years.includes(selectedYear) ? selectedYear : years[0];
  selectedYear = year;

  const { total: ganancias, detalle } = gananciasRealizadasEnAño(year);
  const dividendos = dividendosEnAño(year);
  const comisiones = comisionesEnAño(year);
  const baseAhorro = ganancias + dividendos;
  const tramos = data.meta.tramosAhorro || [];
  const cuota = cuotaAhorroEstimada(Math.max(0, baseAhorro), tramos);
  const tramosOrdenados = [...tramos].sort((a, b) => (a.hasta ?? Infinity) - (b.hasta ?? Infinity));

  container.innerHTML = `
    <div class="section-head">
      <h3>Fiscalidad</h3>
      <select id="fiscal-year">${years.map((y) => `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select>
    </div>

    <section class="card card-warning">
      <p class="muted">Estimación orientativa a partir de tus datos, no es asesoramiento fiscal. Las reglas reales de compensación de pérdidas y los tramos vigentes pueden variar — revisa siempre con tu asesor o gestoría antes de declarar.</p>
    </section>

    <section class="card">
      <h3>Ganancias y pérdidas patrimoniales realizadas en ${year}</h3>
      <p class="muted">Solo cuenta activos vendidos o retirados del todo en ${year}. Los traspasos entre fondos no aparecen aquí porque no tributan al no considerarse una venta.</p>
      <div class="kpi-row"><span>Total</span><span class="${ganancias >= 0 ? "pos" : "neg"}">${fmtEUR(ganancias)}</span></div>
      ${
        detalle.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>Activo</th><th>Ganancia/pérdida</th></tr></thead>
              <tbody>${detalle
                .map((d) => `<tr><td>${d.asset.name}</td><td class="${d.ganancia >= 0 ? "pos" : "neg"}">${fmtEUR(d.ganancia)}</td></tr>`)
                .join("")}</tbody>
            </table></div>`
          : `<p class="muted">Sin ventas o retiradas completas registradas en ${year}.</p>`
      }
    </section>

    <section class="card">
      <h3>Dividendos y cupones cobrados en ${year}</h3>
      <div class="kpi-row"><span>Total</span><span class="pos">${fmtEUR(dividendos)}</span></div>
    </section>

    <section class="card">
      <h3>Comisiones pagadas en ${year}</h3>
      <div class="kpi-row"><span>Total</span><span class="neg">${fmtEUR(comisiones)}</span></div>
    </section>

    <section class="card">
      <h3>Estimación de tributación (base del ahorro)</h3>
      <div class="kpi-row"><span>Base (ganancias + dividendos)</span><span>${fmtEUR(baseAhorro)}</span></div>
      <div class="kpi-row"><span>Cuota estimada</span><span>${fmtEUR(cuota)}</span></div>
      ${
        baseAhorro < 0
          ? `<p class="muted">La base sale negativa (más pérdidas que ganancias/dividendos): no habría cuota este año, y esa pérdida podría compensarse en años siguientes según las reglas reales de compensación (no calculadas aquí).</p>`
          : ""
      }
      <p class="muted">Tramos usados: ${tramosOrdenados.map((t) => `${t.hasta ? "hasta " + fmtEUR(t.hasta) : "resto"} al ${t.pct}%`).join(" · ")}. Ajústalos en Ajustes si cambia la normativa.</p>
    </section>
  `;

  container.querySelector("#fiscal-year").addEventListener("change", (ev) => {
    selectedYear = Number(ev.target.value);
    renderFiscal(container);
  });
}
