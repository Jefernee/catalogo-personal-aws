import { useState } from "react";
import { DUENO, ErrorApi, api, enlaceInvitado, guardarSesion, hoyIso, leerInvitado, leerToken, leerUrl } from "./api";
import { Hoja } from "./hoja";
import { Candado, Compartir, Copiar, Descargar, Luna, Nube, Sol, WhatsApp } from "./iconos";

const servidor = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Pantalla de entrada. La clave es un campo de contraseña: Bitwarden la ofrece guardar y rellenar. */
export function PantallaAcceso({ aviso, alEntrar }) {
  const [url, setUrl] = useState(leerUrl());
  const [clave, setClave] = useState("");
  const [cambiarServidor, setCambiarServidor] = useState(!leerUrl());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function entrar(e) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await api.probar(url, clave.trim());
      guardarSesion({ url, token: clave.trim() });
      alEntrar();
    } catch (err) {
      setError(
        err instanceof ErrorApi && err.estado === 401 ? "Esa clave no es correcta." : err.message
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
          Entra con tu clave de acceso.
        </p>

        {aviso && <p className="aviso-acceso" role="status">{aviso}</p>}

        {/* El gestor de contraseñas necesita un usuario para guardar la clave junto a él. */}
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

        {cambiarServidor ? (
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
        ) : null}

        <div className="campo">
          <label htmlFor="clave">Clave</label>
          <input
            id="clave"
            name="password"
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
            autoFocus
          />
        </div>

        {error && <p className="error-acceso" role="alert">{error}</p>}

        <button className="btn btn--primario btn--bloque" type="submit" disabled={enviando}>
          <Candado width={16} height={16} />
          {enviando ? "Entrando…" : "Entrar"}
        </button>

        {!cambiarServidor && (
          <p className="ayuda">
            Servidor: <code>{servidor(url)}</code>{" "}
            <button type="button" className="enlace" onClick={() => setCambiarServidor(true)}>
              cambiar
            </button>
          </p>
        )}
        <p className="ayuda">
          Por seguridad la clave se pide cada vez que abres la app, y otra vez si pasas más de 3
          minutos fuera de ella.
          Tu gestor de contraseñas puede rellenarla, o abre tu enlace de acceso.
        </p>
      </form>
    </main>
  );
}

/**
 * El mensaje que recibe la persona invitada. Explica qué es el diario, cómo
 * entrar paso a paso y trae los datos de acceso por si el enlace le pide clave.
 * Usa el formato de WhatsApp: *negritas*.
 */
export function mensajeInvitacion({ enlace, servidor: api, clave }) {
  return [
    `📔 *El diario de ${DUENO}*`,
    "",
    `¡Hola! 👋 Soy ${DUENO} y te comparto el acceso a mi diario: una app donde escribo ` +
      "mis páginas del día y llevo mis listas de tareas, compras y lo que voy leyendo y viendo.",
    "",
    "*Cómo entrar*",
    "1️⃣ Toca este enlace y entrarás directo:",
    enlace,
    "",
    "2️⃣ Listo. No hace falta registrarse ni instalar nada.",
    "",
    "*Para volver a entrar* 🔑",
    "Por seguridad la app se bloquea si pasas más de 3 minutos fuera, y cada vez que la abras te pedirá la clave:",
    `• Clave: ${clave}`,
    `• Servidor (solo si te lo pide): ${api}`,
    "",
    "💡 *Para tenerla como app:* en el navegador abre el menú y toca *Agregar a pantalla de inicio*.",
    "",
    "Puedes ver y también editar, así que úsalo con cariño 🙂",
    "🔒 Este acceso es solo para ti: por favor no lo reenvíes.",
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

/** Para mostrar el mensaje en pantalla sin exponer la clave (por ejemplo, al proyectar). */
export const ocultarClave = (texto, clave) =>
  clave ? texto.split(clave).join("••••••••") : texto;

/** Compartir acceso: el mensaje de invitación, listo para WhatsApp. */
export function ModalCompartir({ alCerrar, avisar }) {
  const [enlace, setEnlace] = useState(enlaceInvitado());
  const [claveInvitado, setClaveInvitado] = useState("");
  const [verClave, setVerClave] = useState(false);
  const puedeCompartir = typeof navigator !== "undefined" && Boolean(navigator.share);

  const clave = leerInvitado();
  const mensaje = enlace ? mensajeInvitacion({ enlace, servidor: leerUrl(), clave }) : "";

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

  function guardarInvitado(e) {
    e.preventDefault();
    // El gestor de contraseñas puede rellenar aquí la clave principal por
    // error. Si se aceptara, la invitación llevaría tu clave y cambiar
    // TOKEN_INVITADO ya no le quitaría el acceso a nadie.
    if (claveInvitado.trim() === leerToken()) {
      avisar("Esa es tu clave principal. Aquí va la de invitado.", "error");
      return;
    }
    guardarSesion({ invitado: claveInvitado });
    setEnlace(enlaceInvitado());
    setClaveInvitado("");
  }

  return (
    <Hoja titulo="Compartir acceso" alCerrar={alCerrar} clase="hoja--ajustes">
      <p className="ayuda-ajuste">
        Manda una invitación para que otra persona entre sin registrarse. Podrá{" "}
        <strong>ver y editar todo</strong>, diario incluido.
      </p>

      {enlace ? (
        <>
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
              <button type="button" className="enlace" onClick={() => setVerClave(!verClave)}>
                {verClave ? "ocultar clave" : "mostrar clave"}
              </button>
            </figcaption>
            <div className="burbuja" aria-label="Vista previa del mensaje">
              <ComoWhatsApp texto={verClave ? mensaje : ocultarClave(mensaje, clave)} />
            </div>
          </figure>

          <p className="nota-ajuste">
            Para quitarle el acceso a quien lo tenga, cambia <code>TOKEN_INVITADO</code> en la Lambda.
            Tu acceso no se ve afectado.{" "}
            <button type="button" className="enlace" onClick={() => copiar(enlace, "Enlace copiado.")}>
              Copiar solo el enlace
            </button>
          </p>
        </>
      ) : (
        <form onSubmit={guardarInvitado}>
          <p className="nota-ajuste">
            Este dispositivo no tiene la clave de invitado. Abre la app con tu enlace completo de
            Bitwarden, o pégala aquí:
          </p>
          <div className="fila-botones">
            <input
              type="password"
              className="campo-en-linea"
              aria-label="Clave de invitado"
              autoComplete="new-password"
              value={claveInvitado}
              onChange={(e) => setClaveInvitado(e.target.value)}
              placeholder="Clave de invitado"
              required
            />
            <button type="submit" className="btn btn--secundario">Guardar</button>
          </div>
        </form>
      )}
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

/** Ajustes: tema, copia de seguridad y sesión. */
const TEMAS = [
  { id: "sistema", nombre: "Según el teléfono" },
  { id: "claro", nombre: "Claro" },
  { id: "oscuro", nombre: "Oscuro" },
];

export function ModalAjustes({ alCerrar, alSalir, tema, alElegirTema, items, alRespaldarEnNube, avisar }) {
  return (
    <Hoja titulo="Ajustes" alCerrar={alCerrar} clase="hoja--ajustes">
      <section className="ajuste">
        <h3>Apariencia</h3>
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
          La app se bloquea sola si pasas más de 3 minutos fuera de ella, y la clave se borra al
          cerrarla. Si vas a prestar este dispositivo, bloquéala antes con el candado. Conectado a{" "}
          <code>{servidor(leerUrl())}</code>.
        </p>
        <button type="button" className="btn btn--peligro-solido" onClick={alSalir}>
          <Candado width={16} height={16} /> Bloquear ahora
        </button>
      </section>
    </Hoja>
  );
}
