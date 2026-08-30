import { desviacionAsignacion, concentracionPorActivo, concentracionPorEntidad, vencimientosProximos } from "./metrics.js";

function fmtEUR(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function fmtPct1(n) {
  if (n == null || isNaN(n)) return "—";
  return `${n.toFixed(1)} %`;
}

export function renderAlerts(container) {
  const desviaciones = desviacionAsignacion();
  const concActivo = concentracionPorActivo();
  const concEntidad = concentracionPorEntidad();
  const vencimientos = vencimientosProximos();

  container.innerHTML = `
    <div class="section-head">
      <h3>Alertas y rebalanceo</h3>
    </div>

    <section class="card">
      <h3>Asignación objetivo vs. real</h3>
      <p class="muted">Configura tu % objetivo por clase y el umbral de desviación en Ajustes.</p>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Clase</th><th>Real</th><th>Objetivo</th><th>Desviación</th></tr></thead>
          <tbody>
            ${desviaciones
              .map(
                (d) => `<tr>
                  <td>${d.label}</td>
                  <td>${fmtPct1(d.actualPct)}</td>
                  <td>${fmtPct1(d.objetivoPct)}</td>
                  <td class="${d.alerta ? "neg" : ""}">${d.desviacion >= 0 ? "+" : ""}${fmtPct1(d.desviacion)}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h3>Concentración</h3>
      <p class="muted">Sobre patrimonio financiero (excluye inmobiliario: tener tu vivienda no es un riesgo de concentración a rebalancear). No detecta concentración real por emisor si un mismo valor está repartido entre varios fondos — eso requiere un análisis look-through, todavía pendiente. Umbrales configurables en Ajustes.</p>
      <p class="muted" style="margin-top:10px"><strong>Por activo</strong></p>
      ${
        concActivo.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>Activo</th><th>% del patrimonio financiero</th></tr></thead>
              <tbody>${concActivo.map((r) => `<tr><td>${r.asset.name}</td><td class="neg">${fmtPct1(r.pct)}</td></tr>`).join("")}</tbody>
            </table></div>`
          : `<p class="muted">Sin activos por encima del umbral.</p>`
      }
      <p class="muted" style="margin-top:10px"><strong>Por entidad</strong></p>
      ${
        concEntidad.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>Entidad</th><th>% del patrimonio financiero</th></tr></thead>
              <tbody>${concEntidad.map((r) => `<tr><td>${r.name}</td><td class="neg">${fmtPct1(r.pct)}</td></tr>`).join("")}</tbody>
            </table></div>`
          : `<p class="muted">Sin entidades por encima del umbral.</p>`
      }
    </section>

    <section class="card">
      <h3>Vencimientos próximos</h3>
      <p class="muted">Depósitos a plazo y bonos/obligaciones que vencen dentro del plazo de aviso configurado en Ajustes (o ya vencidos).</p>
      ${
        vencimientos.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>Activo</th><th>Vencimiento</th><th>Días</th></tr></thead>
              <tbody>${vencimientos
                .map(
                  (v) => `<tr>
                    <td>${v.asset.name}</td>
                    <td>${v.asset.vencimiento}</td>
                    <td class="${v.dias < 0 ? "neg" : ""}">${v.dias < 0 ? `vencido hace ${-v.dias} días` : `${v.dias} días`}</td>
                  </tr>`
                )
                .join("")}</tbody>
            </table></div>`
          : `<p class="muted">Sin depósitos o bonos con vencimiento próximo.</p>`
      }
    </section>
  `;
}
