import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { migrarSesionAntigua, tomarDatosDelEnlace } from "./api";
import "./styles.css";

migrarSesionAntigua();   // las claves ya no se guardan para siempre
tomarDatosDelEnlace();   // antes de pintar, por si la sesión viene en el enlace

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service worker: permite instalar la app y que abra sin conexion.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
