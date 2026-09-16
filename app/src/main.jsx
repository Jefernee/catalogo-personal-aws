import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { tomarUrlDelEnlace } from "./api";
import "./styles.css";

tomarUrlDelEnlace();   // antes de pintar, por si viene en el enlace

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
