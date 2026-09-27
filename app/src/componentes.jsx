import { useEffect, useState } from "react";
import {
  CAMPO_EXTRA,
  ESTADOS,
  ETIQUETAS,
  ICONOS,
  TIPOS,
  detalleDe,
  etiquetaEstado,
  seCalifica,
  siguientePaso,
} from "./api";
import { Hoja, esTactil } from "./hoja";
import { Basura, Check, Flecha, Lapiz, Lupa } from "./iconos";

export function Estrellas({ valor = 0, alElegir, apagadas = false }) {
  return (
    <div
      className={`estrellas ${apagadas ? "apagadas" : ""}`}
      role="group"
      aria-label={`Calificación: ${Number(valor) || "sin calificar"}`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= Number(valor) ? "activa" : ""}
          title={`${n} de 5`}
          aria-label={`Calificar con ${n}`}
          onClick={() => alElegir(n === Number(valor) ? 0 : n)}
        >
          {n <= Number(valor) ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}

export function Tarjeta({ item, alActualizar, alBorrar, alEditar }) {
  const paso = siguientePaso(item);
  const hecho = item.estado === "terminado";
  const diaria = !seCalifica(item);
  const subtitulo = [ETIQUETAS[item.tipo], detalleDe(item), !diaria && item.fecha_consumido]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className={`tarjeta ${diaria && hecho ? "tarjeta--hecha" : ""}`}>
      <div className="tarjeta-arriba">
        <span className="avatar" aria-hidden="true">{ICONOS[item.tipo] || "•"}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>{item.titulo}</h3>
          {subtitulo && <div className="sub">{subtitulo}</div>}
        </div>
        <span className={`insignia ${item.estado}`}>{etiquetaEstado(item)}</span>
      </div>

      {item.notas && <p className="notas">{item.notas}</p>}

      {/* Las estrellas se ven siempre en lo que se califica; atenuadas si no está terminado. */}
      {seCalifica(item) && (
        <Estrellas
          valor={item.rating}
          apagadas={!hecho && !Number(item.rating)}
          alElegir={(n) => alActualizar(item, { rating: n })}
        />
      )}

      <div className="acciones">
        <button
          type="button"
          className={`btn btn--sm ${diaria && !hecho ? "btn--ok" : "btn--acento"}`}
          onClick={() => alActualizar(item, { estado: paso.estado })}
        >
          {diaria && !hecho ? <Check width={14} height={14} /> : <Flecha width={14} height={14} />}
          {paso.etiqueta}
        </button>
        <span className="separador" />
        <button
          type="button"
          className="btn btn--sutil btn--sm btn--icono"
          onClick={() => alEditar(item)}
          title="Editar"
          aria-label={`Editar ${item.titulo}`}
        >
          <Lapiz width={15} height={15} />
        </button>
        <button
          type="button"
          className="btn btn--peligro btn--sm btn--icono"
          onClick={() => alBorrar(item)}
          title="Borrar"
          aria-label={`Borrar ${item.titulo}`}
        >
          <Basura width={15} height={15} />
        </button>
      </div>
    </article>
  );
}

export function Filtros({ tipo, estado, busqueda, alCambiar }) {
  return (
    <div className="filtros">
      <div className="campo-busqueda">
        <Lupa width={15} height={15} />
        <input
          type="search"
          placeholder="Buscar por título…"
          aria-label="Buscar por título"
          value={busqueda}
          onChange={(e) => alCambiar({ busqueda: e.target.value })}
        />
      </div>
      <div className="grupo-chips">
        <span className="rotulo">Tipo</span>
        <Chips valores={TIPOS} activo={tipo} alElegir={(v) => alCambiar({ tipo: v })} />
      </div>
      <div className="grupo-chips">
        <span className="rotulo">Estado</span>
        <Chips valores={ESTADOS} activo={estado} alElegir={(v) => alCambiar({ estado: v })} />
      </div>
    </div>
  );
}

function Chips({ valores, activo, alElegir }) {
  return (
    <>
      {["", ...valores].map((v) => (
        <button
          key={v || "todos"}
          type="button"
          className="chip"
          aria-pressed={activo === v}
          onClick={() => alElegir(v)}
        >
          {v ? ETIQUETAS[v] : "Todos"}
        </button>
      ))}
    </>
  );
}

export function Metricas({ items }) {
  const pendientesDe = (tipo) => items.filter((i) => i.tipo === tipo && i.estado !== "terminado").length;
  const calificados = items.filter((i) => Number(i.rating) > 0);
  const promedio = calificados.length
    ? (calificados.reduce((s, i) => s + Number(i.rating), 0) / calificados.length).toFixed(1)
    : "—";

  const datos = [
    { rotulo: "Por hacer", numero: pendientesDe("tarea") },
    { rotulo: "Por comprar", numero: pendientesDe("compra") },
    { rotulo: "En curso", numero: items.filter((i) => i.estado === "en_curso").length },
    { rotulo: "Terminados", numero: items.filter((i) => i.estado === "terminado").length },
    { rotulo: "Rating medio", numero: promedio },
  ];

  return (
    <div className="metricas">
      {datos.map((d) => (
        <div className="metrica" key={d.rotulo}>
          <div className="numero">{d.numero}</div>
          <div className="rotulo">{d.rotulo}</div>
        </div>
      ))}
    </div>
  );
}

export function ModalItem({ alCerrar, alGuardar, item, tipoInicial = "tarea", datosIniciales, alCambiar }) {
  const editando = Boolean(item);
  const [enviando, setEnviando] = useState(false);
  const [datos, setDatos] = useState(() =>
    datosIniciales
      ? datosIniciales
      : item
      ? {
          titulo: item.titulo || "",
          tipo: item.tipo,
          estado: item.estado,
          extra: item[CAMPO_EXTRA[item.tipo]?.clave] || "",
          notas: item.notas || "",
        }
      : { titulo: "", tipo: tipoInicial, estado: "pendiente", extra: "", notas: "" }
  );

  const campoExtra = CAMPO_EXTRA[datos.tipo];

  // Cada cambio se le avisa a la app: si se bloquea a media edición, no se pierde.
  useEffect(() => {
    alCambiar?.(datos);
  }, [datos, alCambiar]);

  async function enviar(e) {
    e.preventDefault();
    if (!datos.titulo.trim()) return;
    setEnviando(true);

    const cuerpo = { titulo: datos.titulo.trim(), tipo: datos.tipo, estado: datos.estado };
    // Al editar se mandan también vacíos, para poder limpiar un dato.
    cuerpo[campoExtra.clave] = datos.extra.trim();
    cuerpo.notas = datos.notas.trim();
    if (!editando) {
      if (!cuerpo[campoExtra.clave]) delete cuerpo[campoExtra.clave];
      if (!cuerpo.notas) delete cuerpo.notas;
    }

    const ok = await alGuardar(cuerpo);
    setEnviando(false);
    if (ok) alCerrar();
  }

  return (
    <Hoja
      titulo={editando ? "Editar" : "Agregar"}
      alCerrar={alCerrar}
      acciones={
        <button type="submit" form="form-item" className="btn btn--primario" disabled={enviando}>
          {enviando ? "Guardando…" : editando ? "Guardar" : "Agregar"}
        </button>
      }
    >
      <form id="form-item" onSubmit={enviar}>
        <div className="campo">
          <label htmlFor="titulo">¿Qué es?</label>
          <input
            id="titulo"
            autoFocus={!esTactil()}
            value={datos.titulo}
            onChange={(e) => setDatos({ ...datos, titulo: e.target.value })}
            placeholder={datos.tipo === "compra" ? "Leche, pan…" : datos.tipo === "tarea" ? "Pagar la luz" : "El nombre del viento"}
            required
            enterKeyHint="done"
          />
        </div>

        <div className="dos-columnas">
          <div className="campo">
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" value={datos.tipo} onChange={(e) => setDatos({ ...datos, tipo: e.target.value, extra: "" })}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{ICONOS[t]} {ETIQUETAS[t]}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="estado">Estado</label>
            <select id="estado" value={datos.estado} onChange={(e) => setDatos({ ...datos, estado: e.target.value })}>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>{ETIQUETAS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="campo">
          <label htmlFor="extra">{campoExtra.etiqueta}</label>
          <input
            id="extra"
            type={campoExtra.tipo || "text"}
            value={datos.extra}
            onChange={(e) => setDatos({ ...datos, extra: e.target.value })}
            placeholder="Opcional"
          />
        </div>

        <div className="campo">
          <label htmlFor="notas">Notas</label>
          <textarea
            id="notas"
            rows={3}
            value={datos.notas}
            onChange={(e) => setDatos({ ...datos, notas: e.target.value })}
            placeholder="Opcional"
          />
        </div>
      </form>
    </Hoja>
  );
}
