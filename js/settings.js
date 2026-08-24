import { store } from "./store.js";

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
}
