// Pequeña utilidad para abrir un formulario dentro de una ventana modal reutilizable.

let dialogEl = null;

// Si el usuario cambia de pestaña con el modal abierto, lo cerramos para que
// no se quede flotando sobre una pantalla distinta.
window.addEventListener("hashchange", () => {
  if (dialogEl && dialogEl.open) dialogEl.close();
});

function ensureDialog() {
  if (dialogEl) return dialogEl;
  dialogEl = document.createElement("dialog");
  dialogEl.className = "app-modal";
  dialogEl.innerHTML = `
    <div class="app-modal-head">
      <h3 id="app-modal-title"></h3>
      <button type="button" class="link-btn" id="app-modal-close">cerrar ✕</button>
    </div>
    <div id="app-modal-body"></div>
  `;
  document.body.appendChild(dialogEl);
  dialogEl.querySelector("#app-modal-close").addEventListener("click", () => dialogEl.close());
  dialogEl.addEventListener("click", (ev) => {
    if (ev.target === dialogEl) dialogEl.close();
  });
  return dialogEl;
}

// renderFn(bodyEl) debe rellenar el contenido (formulario, etc.) y enganchar sus propios listeners.
// Se le pasa además closeModal para poder cerrar la ventana al terminar (p.ej. tras guardar).
export function openModal(title, renderFn) {
  const dialog = ensureDialog();
  dialog.querySelector("#app-modal-title").textContent = title;
  const body = dialog.querySelector("#app-modal-body");
  body.innerHTML = "";
  const closeModal = () => dialog.close();
  renderFn(body, closeModal);
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}
