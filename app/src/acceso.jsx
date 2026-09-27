import { useState } from "react";
import { DUENO, ErrorApi, api, guardarSesion, hoyIso, leerToken, leerUrl } from "./api";
import { useMedia } from "./diario";
import { Hoja } from "./hoja";
import { fechaDeVersion } from "./version";
import { Candado, Compartir, Copiar, Descargar, Luna, Nube, Sol, WhatsApp } from "./iconos";

/** La dirección de la página, sin nada después del "#": es la que se comparte. */
const paginaDeLaApp = () => `${location.origin}${location.pathname}`;

/** Pantalla de entrada: solo la contraseña. Bitwarden la ofrece guardar y rellenar. */
export function PantallaAcceso({ aviso, alEntrar }) {
  const [url, setUrl] = useState(leerUrl());
  const [contrasena, setContrasena] = useState("");
  // Solo si esta copia de la app no sabe a qué servidor ir (en desarrollo, sin .env.local).
  const pedirServidor = !leerUrl();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function entrar(e) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.probar(url, contrasena.trim());
      guardarSesion({ url, token: contrasena.trim() });
      alEntrar();
    } catch (err) {
      setError(
        err instanceof ErrorApi && err.estado === 401 ? "Esa contraseña no es correcta." : err.message
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="envoltura">
      <form className="conectar" onSubmit={entrar}>
        <img src="./icono.svg" alt="" />
        <h2>Mi diario</h2>
        <p>
          El diario de {DUENO}.
          <br />
          Escribe la contraseña para entrar.
        </p>

        {aviso && <p className="aviso-acceso" role="status">{aviso}</p>}

        {/* El gestor de contraseñas necesita un usuario para guardar la contraseña junto a él. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value="mi-diario"
          readOnly
          className="visualmente-oculto"
          tabIndex={-1}
          aria-hidden="true"
        />

        {pedirServidor && (
          <div className="campo">
            <label htmlFor="api">Dirección de la API</label>
            <input
              id="api"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxxx.execute-api.us-east-1.amazonaws.com"
              required
            />
          </div>
        )}

        <div className="campo">
          <label htmlFor="contrasena">Contraseña</label>
          <input
            id="contrasena"
            name="password"
            type="password"
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
            autoFocus
          />
        </div>

        {error && <p className="error-acceso" role="alert">{error}</p>}

        <button className="btn btn--primario btn--bloque" type="submit" disabled={enviando}>
          <Candado width={16} height={16} />
          {enviando ? "Entrando…" : "Entrar"}
        </button>

        <p className="ayuda">
          La contraseña se pide cada vez que abres la app, y otra vez si pasas más de 3 minutos fuera.
        </p>
      </form>
    </main>
  );
}

/**
 * El mensaje que recibe la persona con quien compartes: qué es el diario, la
 * página y la contraseña, paso a paso. Usa el formato de WhatsApp: *negritas*.
 */
export function mensajeInvitacion({ enlace, contrasena }) {
  return [
    `📔 *El diario de ${DUENO}*`,
    "",
    `¡Hola! 👋 Soy ${DUENO} y te comparto mi diario: una app donde escribo mis páginas del día ` +
      "y llevo mis listas de tareas, compras y lo que voy leyendo y viendo.",
    "",
    "*Cómo entrar*",
    "1️⃣ Abre esta página:",
    enlace,
    "",
    `2️⃣ Escribe la contraseña: *${contrasena}*`,
    "",
    "3️⃣ Toca *Entrar*. ¡Listo!",
    "",
    "La contraseña te la va a pedir cada vez que abras la app.",
    "",
    "💡 *Para tenerla como app:* en el navegador abre el menú y toca *Agregar a pantalla de inicio*.",
    "",
    "Puedes ver y también editar, así que úsalo con cariño 🙂",
    "🔒 Por favor no reenvíes este mensaje.",
  ].join("\n");
}

/** wa.me sin número abre WhatsApp con el mensaje escrito y deja elegir el contacto. */
export const enlaceWhatsApp = (mensaje) => `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

/** Pinta el texto como WhatsApp: lo que va entre *asteriscos* sale en negritas. */
function ComoWhatsApp({ texto }) {
  return texto.split(/(\*[^*\n]+\*)/g).map((trozo, i) =>
    /^\*[^*\n]+\*$/.test(trozo) ? <strong key={i}>{trozo.slice(1, -1)}</strong> : trozo
  );
}

/** Para mostrar el mensaje en pantalla sin exponer la contraseña (por ejemplo, al proyectar). */
export const ocultarClave = (texto, clave) =>
  clave ? texto.split(clave).join("••••••••") : texto;

/** Compartir: manda la página y la contraseña, listo para WhatsApp. */
export function ModalCompartir({ alCerrar, avisar }) {
  const [verContrasena, setVerContrasena] = useState(false);
  const puedeCompartir = typeof navigator !== "undefined" && Boolean(navigator.share);

  const contrasena = leerToken();
  const enlace = paginaDeLaApp();
  const mensaje = mensajeInvitacion({ enlace, contrasena });

  async function copiar(texto, aviso) {
    try {
      await navigator.clipboard.writeText(texto);
      avisar(aviso);
    } catch {
      avisar("No se pudo copiar: selecciona el texto y cópialo a mano.", "error");
    }
  }

  async function compartir() {
    try {
      await navigator.share({ title: `El diario de ${DUENO}`, text: mensaje });
    } catch (e) {
      // Cerrar el menú de compartir no es un error; cualquier otra falla, se copia.
      if (e?.name !== "AbortError") await copiar(mensaje, "Mensaje copiado.");
    }
  }

  return (
    <Hoja titulo="Compartir" alCerrar={alCerrar} clase="hoja--ajustes">
      <p className="ayuda-ajuste">
        Manda la página y la contraseña. Quien lo reciba podrá <strong>ver y editar todo</strong>,
        diario incluido.
      </p>

      <div className="fila-botones">
        <a className="btn btn--whatsapp" href={enlaceWhatsApp(mensaje)} target="_blank" rel="noopener noreferrer">
          <WhatsApp width={17} height={17} /> Enviar por WhatsApp
        </a>
        {puedeCompartir && (
          <button type="button" className="btn btn--secundario" onClick={compartir}>
            <Compartir width={16} height={16} /> Otra app
          </button>
        )}
        <button
          type="button"
          className="btn btn--secundario"
          onClick={() => copiar(mensaje, "Mensaje copiado. Pégalo en el chat de quien quieras.")}
        >
          <Copiar width={16} height={16} /> Copiar
        </button>
      </div>

      <figure className="vista-mensaje">
        <figcaption>
          Así le llega el mensaje
          <button type="button" className="enlace" onClick={() => setVerContrasena(!verContrasena)}>
            {verContrasena ? "ocultar contraseña" : "mostrar contraseña"}
          </button>
        </figcaption>
        <div className="burbuja" aria-label="Vista previa del mensaje">
          <ComoWhatsApp texto={verContrasena ? mensaje : ocultarClave(mensaje, contrasena)} />
        </div>
      </figure>

      <p className="nota-ajuste">
        Para quitarle el acceso a alguien, cambia la contraseña (<code>TOKEN_PRINCIPAL</code> en la
        Lambda) y compártela de nuevo solo con quien quieras.
      </p>
    </Hoja>
  );
}

/** Baja una copia de todo a este dispositivo, como archivo JSON. */
export function descargarCopia(items) {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mi-diario-${hoyIso()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Ajustes: tema, copia de seguridad y seguridad. */
const TEMAS = [
  { id: "claro", nombre: "Claro" },
  { id: "sistema", nombre: "Según el teléfono" },
  { id: "oscuro", nombre: "Oscuro" },
];

export function ModalAjustes({ alCerrar, alSalir, tema, alElegirTema, items, alRespaldarEnNube, avisar }) {
  const telefonoOscuro = useMedia("(prefers-color-scheme: dark)");
  return (
    <Hoja titulo="Ajustes" alCerrar={alCerrar} clase="hoja--ajustes">
      <section className="ajuste">
        <h3>Apariencia</h3>
        <p className="ayuda-ajuste">
          Cambia el fondo de la app. Las hojas del diario conservan siempre su color.
        </p>
        <div className="segmentado" role="radiogroup" aria-label="Tema">
          {TEMAS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tema === t.id}
              onClick={() => alElegirTema(t.id)}
            >
              {t.id === "claro" ? <Sol width={15} height={15} /> : t.id === "oscuro" ? <Luna width={15} height={15} /> : null}
              {t.nombre}
            </button>
          ))}
        </div>
        <p className="nota-ajuste" aria-live="polite">
          {tema === "sistema"
            ? `Tu teléfono está en modo ${telefonoOscuro ? "oscuro" : "claro"}, y la app también.`
            : tema === "claro"
              ? "Siempre en claro, aunque el teléfono esté en oscuro."
              : "Siempre en oscuro, aunque el teléfono esté en claro."}
        </p>
      </section>

      <section className="ajuste">
        <h3>Copia de seguridad</h3>
        <p className="ayuda-ajuste">
          Guarda todo lo que tienes —diario y listas— en un archivo que puedes conservar o abrir después.
        </p>
        <div className="fila-botones">
          <button
            type="button"
            className="btn btn--primario"
            onClick={() => {
              descargarCopia(items);
              avisar(`Copia descargada: ${items.length} registros`);
            }}
          >
            <Descargar width={16} height={16} /> Descargar mis datos
          </button>
          <button type="button" className="btn btn--secundario" onClick={alRespaldarEnNube}>
            <Nube width={16} height={16} /> Guardar copia en S3
          </button>
        </div>
        <p className="nota-ajuste">
          La copia en S3 queda en tu bucket de AWS; se ve desde la consola, no desde la app.
        </p>
      </section>

      <section className="ajuste">
        <h3>Seguridad</h3>
        <p className="ayuda-ajuste">
          La app se bloquea sola si pasas más de 3 minutos fuera de ella. Si vas a prestar este
          dispositivo, bloquéala antes con el candado.
        </p>
        <button type="button" className="btn btn--peligro-solido" onClick={alSalir}>
          <Candado width={16} height={16} /> Bloquear ahora
        </button>
      </section>

      <p className="nota-ajuste version-app">Mi diario · versión {fechaDeVersion()}</p>
    </Hoja>
  );
}
