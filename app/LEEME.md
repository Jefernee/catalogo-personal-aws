# App — Mi catálogo (React + Vite)

Aplicación instalable (PWA) que consume la API del proyecto. **No forma parte de lo evaluado**: el PDF dice que el proyecto es una API y no necesita interfaz. Está aquí para usar el catálogo a diario y para cerrar la demo.

En `../frontend/index.html` queda además una versión de un solo archivo, sin dependencias, por si el día de la presentación no quieres depender de npm.

---

## Requisito previo: CORS

El navegador bloquea las llamadas a otro dominio salvo que la API lo autorice. En la consola de AWS:

**API Gateway** → `catalogo-personal-api` → **CORS** → Configurar

| Campo | Valor |
|---|---|
| Access-Control-Allow-Origin | `*` |
| Access-Control-Allow-Headers | `content-type` |
| Access-Control-Allow-Methods | `GET, POST, PUT, DELETE, OPTIONS` |
| Access-Control-Max-Age | `300` |

En *Origin* y *Headers* hay que escribir el valor **y presionar Agregar**, si no, no se guarda.

---

## Correr en desarrollo

```bash
cd app
npm install
npm run dev
```

Abre <http://localhost:5173>.

La URL de la API sale de `.env.local` (no se sube a git):

```
VITE_API_URL=https://xxxx.execute-api.us-east-1.amazonaws.com
```

Sin ese archivo, la app la pide una vez y la guarda en el navegador. Si el archivo existe, entra directa.

## Configurar la app en otro dispositivo

Abrirla con la URL de la API al final del enlace la deja configurada de una vez:

```
https://jefernee.github.io/catalogo-personal-aws/#api=<URL_DE_LA_API>
```

La app guarda la URL en ese dispositivo y la borra de la barra de direcciones. Ese
enlace es el que conviene guardar en el gestor de contraseñas: sirve para el celular,
para otra computadora o para el día de la demo.

Quien abra la página sin esa parte final solo ve la pantalla de conexión — por eso la
URL no viaja dentro del build publicado.

## Pruebas

```bash
npm test           # 84 pruebas con vitest: sesión, enlaces, invitación, libro, app completa
```

Para probarla contra la Lambda real sin tocar AWS, desde la raíz del proyecto:

```bash
python servidor_local.py
```

y abrir `http://localhost:5173/#api=http://localhost:8787&token=local&invitado=local-invitado`.

## Compilar

```bash
npm run build      # genera dist/
npm run preview    # sirve dist/ para revisarlo
```

`dist/` es estático: se puede subir a S3 con hosting web, a GitHub Pages o a cualquier hosting.

---

## Qué hace

- **Acceso con clave.** Sin clave no se ve nada. El campo de la clave es de contraseña, así
  que Bitwarden ofrece guardarla y rellenarla. Con el enlace `#api=…&token=…` se entra directo.
- **Diario como libro.** Una hoja por día, ordenadas por su fecha: la más reciente primero.
  En escritorio se ven dos hojas abiertas y en el celular una, que se pasa deslizando el dedo.
  Una nota larga no se parte: la hoja crece y se lee bajando. Cada página tiene su fondo:
  papel, crema, rayado, cuadrícula, lino, rosa, menta, cielo, lavanda o noche, cada uno con
  su versión de noche para el modo oscuro. El editor escribe directamente sobre la hoja elegida.
- **Listas.** Tareas y compras (se tachan al marcarlas hechas o compradas) y lo que se lee,
  ve o escucha, con estado y estrellas. Búsqueda y filtros por tipo y estado.
- **Compartir.** Arma una invitación para WhatsApp —qué es el diario, cómo entrar paso a paso
  y los datos de acceso— y deja elegir el contacto. Lleva la clave de invitado, nunca la tuya.
- **Ajustes.** Tema según el teléfono, claro u oscuro; descargar una copia de todo en JSON o
  guardarla en S3; cerrar sesión en el dispositivo.
- **Pensada para el celular.** Los formularios ocupan la pantalla con el botón de guardar
  arriba, y se ajustan al teclado para que nunca lo tape. Instalable como app.

---

## Estructura

```
app/
├── index.html
├── public/           manifest, service worker, iconos
└── src/
    ├── api.js           cliente de la API, sesión, enlaces y catálogos de valores
    ├── App.jsx          estado, carga de datos y acciones
    ├── acceso.jsx       login, compartir (invitación de WhatsApp) y ajustes
    ├── diario.jsx       el libro y el editor de página
    ├── componentes.jsx  tarjetas, filtros, métricas y el formulario de las listas
    ├── hoja.jsx         la hoja de los formularios y el ajuste al teclado del celular
    ├── iconos.jsx       iconos SVG
    ├── styles.css       tokens de color, claro y oscuro, fondos de página, responsivo
    ├── main.jsx
    └── pruebas/         pruebas con vitest y Testing Library
```

Sin librerías de UI ni de estado: React y CSS.

---

## Nota de seguridad

La clave vive en el `localStorage` del navegador. "Cerrar sesión" en Ajustes la borra del
dispositivo. Para quitarle el acceso a alguien a quien le compartiste el enlace, se cambia
`TOKEN_INVITADO` en la Lambda.
