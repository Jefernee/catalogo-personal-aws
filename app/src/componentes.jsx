import { useEffect, useState } from "react";
import {
  ACCION_ESTADO,
  CAMPO_EXTRA,
  ESTADOS,
  ETIQUETAS,
  ICONOS,
  SIGUIENTE_ESTADO,
  TIPOS,
  detalleDe,
} from "./api";
import { Basura, Flecha, Lapiz, Lupa } from "./iconos";

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
  const siguiente = SIGUIENTE_ESTADO[item.estado] || "pendiente";
  const subtitulo = [ETIQUETAS[item.tipo], detalleDe(item), item.fecha_consumido]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="tarjeta">
      <div className="tarjeta-arriba">
        <span className="avatar" aria-hidden="true">{ICONOS[item.tipo] || "•"}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>{item.titulo}</h3>
          <div className="sub">{subtitulo}</div>
        </div>
        <span className={`insignia ${item.estado}`}>{ETIQUETAS[item.estado]}</span>
      </div>

      {item.notas && <p className="notas">{item.notas}</p>}

      {/* Las estrellas se ven siempre; atenuadas mientras no esté terminado. */}
      <Estrellas
        valor={item.rating}
        apagadas={item.estado !== "terminado" && !Number(item.rating)}
        alElegir={(n) => alActualizar(item, { rating: n })}
      />

      <div className="acciones">
        <button
          className="btn btn--acento btn--sm"
          onClick={() => alActualizar(item, { estado: siguiente })}
          title={`Pasar a ${ETIQUETAS[siguiente].toLowerCase()}`}
        >
          <Flecha width={14} height={14} />
          {ACCION_ESTADO[item.estado] || "Avanzar"}
        </button>
        <span className="separador" />
        <button
          className="btn btn--sutil btn--sm btn--icono"
          onClick={() => alEditar(item)}
          title="Editar"
          aria-label={`Editar ${item.titulo}`}
        >
          <Lapiz width={15} height={15} />
        </button>
        <button
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

export function EntradaDiario({ item, alBorrar, alEditar }) {
  return (
    <article className="entrada">
      <header>
        <h3>{item.titulo}</h3>
        <span className="fecha">{item.fecha || (item.creado_en || "").slice(0, 10)}</span>
        <span style={{ flex: 1 }} />
        <button
          className="btn btn--sutil btn--sm btn--icono"
          onClick={() => alEditar(item)}
          title="Editar"
          aria-label={`Editar ${item.titulo}`}
        >
          <Lapiz width={15} height={15} />
        </button>
        <button
          className="btn btn--peligro btn--sm btn--icono"
          onClick={() => alBorrar(item)}
          title="Borrar"
          aria-label={`Borrar ${item.titulo}`}
        >
          <Basura width={15} height={15} />
        </button>
      </header>
      {item.contenido && <p>{item.contenido}</p>}
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
  const cuenta = (e) => items.filter((i) => i.estado === e).length;
  const calificados = items.filter((i) => Number(i.rating) > 0);
  const promedio = calificados.length
    ? (calificados.reduce((s, i) => s + Number(i.rating), 0) / calificados.length).toFixed(1)
    : "—";

  const datos = [
    { rotulo: "En el catálogo", numero: items.length },
    { rotulo: "Pendientes", numero: cuenta("pendiente") },
    { rotulo: "En curso", numero: cuenta("en_curso") },
    { rotulo: "Terminados", numero: cuenta("terminado") },
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

/** Cierra el modal con Escape. */
function useEscape(alCerrar) {
  useEffect(() => {
    const alPresionar = (e) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [alCerrar]);
}

export function ModalItem({ alCerrar, alGuardar, item }) {
  const editando = Boolean(item);
  const [enviando, setEnviando] = useState(false);
  const [datos, setDatos] = useState(() =>
    item
      ? {
          titulo: item.titulo || "",
          tipo: item.tipo,
          estado: item.estado,
          extra: detalleDe(item),
          notas: item.notas || "",
        }
      : { titulo: "", tipo: "libro", estado: "pendiente", extra: "", notas: "" }
  );

  useEscape(alCerrar);

  const campoExtra = CAMPO_EXTRA[datos.tipo];

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
    <div className="fondo-modal" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <form className="modal" onSubmit={enviar}>
        <h2>{editando ? "Editar" : "Agregar al catálogo"}</h2>

        <div className="campo">
          <label htmlFor="titulo">Título</label>
          <input
            id="titulo"
            autoFocus
            value={datos.titulo}
            onChange={(e) => setDatos({ ...datos, titulo: e.target.value })}
            placeholder="El nombre del viento"
            required
          />
        </div>

        <div className="dos-columnas">
          <div className="campo">
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" value={datos.tipo} onChange={(e) => setDatos({ ...datos, tipo: e.target.value })}>
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
            value={datos.extra}
            onChange={(e) => setDatos({ ...datos, extra: e.target.value })}
            placeholder="Opcional"
          />
        </div>

        <div className="campo">
          <label htmlFor="notas">Notas</label>
          <textarea
            id="notas"
            style={{ minHeight: 76 }}
            value={datos.notas}
            onChange={(e) => setDatos({ ...datos, notas: e.target.value })}
            placeholder="Opcional"
          />
        </div>

        <div className="pie-modal">
          <button type="button" className="btn btn--secundario" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primario" disabled={enviando}>
            {enviando ? "Guardando…" : editando ? "Guardar cambios" : "Agregar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ModalDiario({ alCerrar, alGuardar, item }) {
  const editando = Boolean(item);
  const hoy = new Date().toISOString().slice(0, 10);
  const [enviando, setEnviando] = useState(false);
  const [datos, setDatos] = useState({
    titulo: item?.titulo || "",
    fecha: item?.fecha || hoy,
    contenido: item?.contenido || "",
  });

  useEscape(alCerrar);

  async function enviar(e) {
    e.preventDefault();
    if (!datos.titulo.trim()) return;
    setEnviando(true);
    const ok = await alGuardar({
      tipo: "diario",
      titulo: datos.titulo.trim(),
      fecha: datos.fecha || hoy,
      contenido: datos.contenido.trim(),
    });
    setEnviando(false);
    if (ok) alCerrar();
  }

  return (
    <div className="fondo-modal" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <form className="modal" onSubmit={enviar}>
        <h2>{editando ? "Editar entrada" : "Nueva entrada del diario"}</h2>

        <div className="dos-columnas">
          <div className="campo">
            <label htmlFor="d-titulo">Título</label>
            <input
              id="d-titulo"
              autoFocus
              value={datos.titulo}
              onChange={(e) => setDatos({ ...datos, titulo: e.target.value })}
              placeholder="Cómo estuvo el día"
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="d-fecha">Fecha</label>
            <input
              id="d-fecha"
              type="date"
              value={datos.fecha}
              onChange={(e) => setDatos({ ...datos, fecha: e.target.value })}
            />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="d-contenido">Contenido</label>
          <textarea
            id="d-contenido"
            value={datos.contenido}
            onChange={(e) => setDatos({ ...datos, contenido: e.target.value })}
            placeholder="Lo que quieras recordar de hoy…"
          />
        </div>

        <div className="pie-modal">
          <button type="button" className="btn btn--secundario" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primario" disabled={enviando}>
            {enviando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
