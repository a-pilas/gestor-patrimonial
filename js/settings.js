import { store } from "./store.js";
import { changePin, removePin } from "./lock.js";
import { ASSET_CLASSES, DEFAULT_TRAMOS_AHORRO, DEFAULT_TRAMOS_PATRIMONIO } from "./model.js";

export function renderSettings(container) {
  const data = store.get();

  container.innerHTML = `
    <section class="card">
      <h3>Copia de seguridad</h3>
      <p class="muted">Mientras no esté conectada la sincronización con Google Drive, puedes descargar tus datos y guardarlos tú mismo en Drive, o cargarlos en otro dispositivo con "Importar".</p>
      <div class="btn-row">
        <button id="btn-export">Exportar datos (.json)</button>
        <label class="file-btn">Importar datos (.json)
          <input id="input-import" type="file" accept="application/json" hidden />
        </label>
      </div>
    </section>

    <section class="card">
      <h3>Benchmark</h3>
      <label>Nombre del benchmark
        <input id="benchmark-name" value="${data.meta.benchmarkName}" />
      </label>
      <button id="save-benchmark-name">Guardar</button>
    </section>

    <section class="card">
      <h3>Inmuebles</h3>
      <label>Coeficiente de seguridad (%) — minusvaloración prudente sobre la media de las tasaciones
        <input id="real-estate-safety-pct" type="number" min="0" max="100" step="1" value="${data.meta.realEstateSafetyPct}" />
      </label>
      <p class="muted">Se aplica a todas las posiciones de inmuebles con varias fuentes de valoración, en todas las pantallas, al instante.</p>
      <button id="save-safety-pct">Guardar</button>
    </section>

    <section class="card">
      <h3>Fiscalidad — Tramos IRPF del ahorro</h3>
      <p class="muted">Se usan en la pestaña Fiscalidad para estimar la cuota sobre ganancias realizadas y dividendos. Deja "Hasta" en blanco en el tramo que cubre el resto sin límite superior. Ajústalos si cambia la normativa.</p>
      <div id="tramos-rows"></div>
      <button type="button" id="btn-add-tramo" class="link-btn">+ Añadir tramo</button>
      <div class="btn-row" style="margin-top:10px">
        <button id="save-tramos">Guardar tramos</button>
      </div>
    </section>

    <section class="card">
      <h3>Impuesto sobre el Patrimonio</h3>
      <p class="muted">Valores por defecto de Galicia. Ajústalos si cambia la normativa o tu residencia fiscal.</p>
      <label>Mínimo exento por contribuyente (€)
        <input id="patrimonio-minimo-exento" type="number" step="any" min="0" value="${data.meta.patrimonioMinimoExento}" />
      </label>
      <label>Bonificación autonómica sobre la cuota íntegra (%)
        <input id="patrimonio-bonificacion" type="number" step="any" min="0" max="100" value="${data.meta.patrimonioBonificacionPct}" />
      </label>
      <p class="muted" style="margin-top:12px">Escala de tramos por contribuyente (deja "Hasta" en blanco en el tramo que cubre el resto sin límite superior):</p>
      <div id="tramos-patrimonio-rows"></div>
      <button type="button" id="btn-add-tramo-patrimonio" class="link-btn">+ Añadir tramo</button>
      <div class="btn-row" style="margin-top:10px">
        <button id="save-patrimonio">Guardar</button>
      </div>
    </section>

    <section class="card">
      <h3>Alertas y rebalanceo — Asignación objetivo</h3>
      <p class="muted">% objetivo por clase (debería sumar 100%) y umbral de desviación para las alertas de la pestaña Alertas.</p>
      ${Object.entries(ASSET_CLASSES)
        .map(
          ([k, c]) => `<label>${c.label} (%)
            <input class="objetivo-clase" data-clase="${k}" type="number" step="any" min="0" max="100" value="${data.meta.objetivoClase?.[k] ?? 0}" />
          </label>`
        )
        .join("")}
      <label>Umbral de desviación (puntos porcentuales)
        <input id="desviacion-umbral" type="number" step="any" min="0" value="${data.meta.desviacionUmbralPct}" />
      </label>
      <button id="save-objetivo-clase">Guardar</button>
    </section>

    <section class="card">
      <h3>Alertas — Concentración y vencimientos</h3>
      <label>Umbral de concentración por activo (%, sobre patrimonio financiero)
        <input id="concentracion-activo-umbral" type="number" step="any" min="0" max="100" value="${data.meta.concentracionActivoUmbralPct}" />
      </label>
      <label>Umbral de concentración por entidad (%, sobre patrimonio financiero)
        <input id="concentracion-entidad-umbral" type="number" step="any" min="0" max="100" value="${data.meta.concentracionEntidadUmbralPct}" />
      </label>
      <label>Días de aviso antes de un vencimiento (depósitos, bonos)
        <input id="vencimiento-dias-aviso" type="number" step="1" min="0" value="${data.meta.vencimientoDiasAviso}" />
      </label>
      <button id="save-alertas-umbrales">Guardar</button>
    </section>

    <section class="card">
      <h3>Seguridad</h3>
      <p class="muted">Candado de acceso a esta app en este navegador (te lo pide cada vez que la abres). No es una protección real de tus datos —siguen solo en este dispositivo— sino un filtro sencillo para que nadie la abra sin más.</p>
      <div class="btn-row">
        <button id="btn-change-pin">Cambiar contraseña</button>
        <button id="btn-remove-pin" class="link-btn danger">Quitar candado</button>
      </div>
    </section>

    <section class="card">
      <h3>Acerca de</h3>
      <p class="muted">Gestor patrimonial — Fase 0 (MVP local). Los datos se guardan en este navegador. Próximas fases: rentabilidad TWR, fiscalidad, alertas de rebalanceo, X-Ray y sincronización con Google Drive.</p>
    </section>
  `;

  container.querySelector("#btn-export").addEventListener("click", () => {
    const blob = new Blob([store.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `gestor-patrimonial-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  container.querySelector("#input-import").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      store.importJson(text);
      alert("Datos importados correctamente.");
      location.reload();
    } catch (e) {
      alert("El fichero no es un JSON válido de esta aplicación.");
    }
  });

  container.querySelector("#save-benchmark-name").addEventListener("click", () => {
    const name = container.querySelector("#benchmark-name").value.trim();
    if (name) store.updateMeta({ benchmarkName: name });
    alert("Guardado.");
  });

  container.querySelector("#save-safety-pct").addEventListener("click", () => {
    const pct = Number(container.querySelector("#real-estate-safety-pct").value);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      alert("Introduce un porcentaje entre 0 y 100.");
      return;
    }
    store.updateMeta({ realEstateSafetyPct: pct });
    alert("Guardado.");
  });

  const tramosRows = container.querySelector("#tramos-rows");

  function renderTramoRow(t) {
    const div = document.createElement("div");
    div.className = "btn-row tramo-row";
    div.innerHTML = `
      <input class="tramo-hasta" type="number" step="any" min="0" placeholder="Hasta (€, vacío = sin límite)" value="${t.hasta ?? ""}" />
      <input class="tramo-pct" type="number" step="any" min="0" max="100" placeholder="%" value="${t.pct ?? ""}" style="max-width:90px" />
      <button type="button" class="link-btn danger tramo-remove">quitar</button>
    `;
    div.querySelector(".tramo-remove").addEventListener("click", () => div.remove());
    tramosRows.appendChild(div);
  }

  (data.meta.tramosAhorro?.length ? data.meta.tramosAhorro : DEFAULT_TRAMOS_AHORRO).forEach(renderTramoRow);

  container.querySelector("#btn-add-tramo").addEventListener("click", () => {
    renderTramoRow({ hasta: "", pct: "" });
  });

  container.querySelector("#save-tramos").addEventListener("click", () => {
    const tramos = [...tramosRows.querySelectorAll(".tramo-row")]
      .map((row) => ({
        hasta: row.querySelector(".tramo-hasta").value.trim() === "" ? null : Number(row.querySelector(".tramo-hasta").value),
        pct: Number(row.querySelector(".tramo-pct").value),
      }))
      .filter((t) => !isNaN(t.pct));
    if (!tramos.length) {
      alert("Añade al menos un tramo con su porcentaje.");
      return;
    }
    store.updateMeta({ tramosAhorro: tramos });
    alert("Guardado.");
  });

  const tramosPatrimonioRows = container.querySelector("#tramos-patrimonio-rows");

  function renderTramoPatrimonioRow(t) {
    const div = document.createElement("div");
    div.className = "btn-row tramo-row";
    div.innerHTML = `
      <input class="tramo-hasta" type="number" step="any" min="0" placeholder="Hasta (€, vacío = sin límite)" value="${t.hasta ?? ""}" />
      <input class="tramo-pct" type="number" step="any" min="0" max="100" placeholder="%" value="${t.pct ?? ""}" style="max-width:90px" />
      <button type="button" class="link-btn danger tramo-remove">quitar</button>
    `;
    div.querySelector(".tramo-remove").addEventListener("click", () => div.remove());
    tramosPatrimonioRows.appendChild(div);
  }

  (data.meta.tramosPatrimonio?.length ? data.meta.tramosPatrimonio : DEFAULT_TRAMOS_PATRIMONIO).forEach(renderTramoPatrimonioRow);

  container.querySelector("#btn-add-tramo-patrimonio").addEventListener("click", () => {
    renderTramoPatrimonioRow({ hasta: "", pct: "" });
  });

  container.querySelector("#save-patrimonio").addEventListener("click", () => {
    const minimoExento = Number(container.querySelector("#patrimonio-minimo-exento").value);
    const bonificacionPct = Number(container.querySelector("#patrimonio-bonificacion").value);
    if (isNaN(minimoExento) || minimoExento < 0) {
      alert("Introduce un mínimo exento válido.");
      return;
    }
    if (isNaN(bonificacionPct) || bonificacionPct < 0 || bonificacionPct > 100) {
      alert("Introduce una bonificación entre 0 y 100.");
      return;
    }
    const tramos = [...tramosPatrimonioRows.querySelectorAll(".tramo-row")]
      .map((row) => ({
        hasta: row.querySelector(".tramo-hasta").value.trim() === "" ? null : Number(row.querySelector(".tramo-hasta").value),
        pct: Number(row.querySelector(".tramo-pct").value),
      }))
      .filter((t) => !isNaN(t.pct));
    if (!tramos.length) {
      alert("Añade al menos un tramo con su porcentaje.");
      return;
    }
    store.updateMeta({ patrimonioMinimoExento: minimoExento, patrimonioBonificacionPct: bonificacionPct, tramosPatrimonio: tramos });
    alert("Guardado.");
  });

  container.querySelector("#save-objetivo-clase").addEventListener("click", () => {
    const objetivoClase = {};
    container.querySelectorAll(".objetivo-clase").forEach((input) => {
      objetivoClase[input.dataset.clase] = Number(input.value) || 0;
    });
    const desviacionUmbralPct = Number(container.querySelector("#desviacion-umbral").value);
    if (isNaN(desviacionUmbralPct) || desviacionUmbralPct < 0) {
      alert("Introduce un umbral de desviación válido.");
      return;
    }
    store.updateMeta({ objetivoClase, desviacionUmbralPct });
    alert("Guardado.");
  });

  container.querySelector("#save-alertas-umbrales").addEventListener("click", () => {
    const concentracionActivoUmbralPct = Number(container.querySelector("#concentracion-activo-umbral").value);
    const concentracionEntidadUmbralPct = Number(container.querySelector("#concentracion-entidad-umbral").value);
    const vencimientoDiasAviso = Number(container.querySelector("#vencimiento-dias-aviso").value);
    if ([concentracionActivoUmbralPct, concentracionEntidadUmbralPct, vencimientoDiasAviso].some((n) => isNaN(n) || n < 0)) {
      alert("Introduce valores válidos.");
      return;
    }
    store.updateMeta({ concentracionActivoUmbralPct, concentracionEntidadUmbralPct, vencimientoDiasAviso });
    alert("Guardado.");
  });

  container.querySelector("#btn-change-pin").addEventListener("click", async () => {
    const current = prompt("Contraseña actual:");
    if (current === null) return;
    const next = prompt("Nueva contraseña (mínimo 4 caracteres):");
    if (next === null) return;
    if (next.length < 4) {
      alert("La contraseña debe tener al menos 4 caracteres.");
      return;
    }
    const ok = await changePin(current, next);
    alert(ok ? "Contraseña actualizada." : "La contraseña actual no es correcta.");
  });

  container.querySelector("#btn-remove-pin").addEventListener("click", () => {
    if (confirm("¿Quitar el candado de esta app en este navegador? Cualquiera que abra la app en este dispositivo entrará sin contraseña.")) {
      removePin();
      alert("Candado desactivado.");
    }
  });
}
