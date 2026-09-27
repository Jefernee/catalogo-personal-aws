# Contexto del proyecto

Proyecto Final del **Módulo 3 (Cloud AWS)** del curso de Creai. Es individual y se
entrega con **demo en vivo + repositorio**, en las semanas 23 y 24.

Dominio elegido: **catálogo personal**, que con el uso se volvió **"Mi diario"**: un diario
que se ve como libro (una hoja por día con fondo elegible, ordenadas por su fecha, la más
reciente primero) y una sección
**Listas** con tareas, compras, libros, películas, series, música, juegos y restaurantes.
Todo vive en la misma tabla, distinguido por el campo `tipo`.

El proyecto **ya se presentó**. Desde entonces la API exige clave: quienes vieron la URL
en la demo no pueden entrar.

Repositorio: <https://github.com/Jefernee/catalogo-personal-aws> (público)

---

## Lo que siempre se busca

```
Web        https://jefernee.github.io/catalogo-personal-aws/
Región     us-east-1 (Norte de Virginia)
```

**Las claves y el enlace ya configurado están en `DATOS-PRIVADOS.md`**, que no se sube a
git. La URL de la API ya no es secreta: desde que la API exige clave, sin ella no sirve.

Ese archivo también está en `app/.env.local`, y en el gestor de contraseñas.

Probar la API sin entrar a AWS (con la URL del archivo local):

```bash
curl <URL_DE_LA_API>/catalogo
```

Si responde con un JSON, todo está en pie. La consola solo hace falta para cambiar
configuración, no para comprobar que funciona.

---

## Lo desplegado en AWS

Todo en **us-east-1**, cuenta `610156626281`, creada con usuario root.

| Recurso | Nombre / valor |
|---|---|
| API Gateway (HTTP API) | `catalogo-personal-api` · URL en `DATOS-PRIVADOS.md` |
| Etapa | `$default`, con implementación automática |
| Lambda | `catalogo-personal-api` · Python 3.13 · timeout 30 s |
| Rol de ejecución | `catalogo-personal-lambda-role` + política insertada `catalogo-personal-permisos` |
| Tabla DynamoDB | `catalogo-personal` · PK `item_id` (String, UUID) · bajo demanda |
| Bucket S3 | `catalogo-personal-jefernee-2026` · exports en `exports/` |
| Log group | `/aws/lambda/catalogo-personal-api` · retención 7 días |
| Alarma | `catalogo-personal-errores` · `Errors > 0` (Suma, 5 min) → SNS `catalogo-personal-alertas` |
| Dashboard | `catalogo-personal` · widgets de Invocations y Errors |
| CORS | Origin `*`, headers `content-type`, métodos GET/POST/PUT/DELETE/OPTIONS |

La suscripción de correo al tema de SNS quedó **pendiente de confirmar** (el correo de
confirmación nunca llegó). No afecta la calificación: la alarma existe y está configurada.

**Variables de entorno de la Lambda:** `TABLE_NAME`, `BUCKET_NAME`, `TOKEN_PRINCIPAL` y
`TOKEN_INVITADO`. Nada de eso va escrito en el código; las claves están en
`DATOS-PRIVADOS.md`.

## Acceso

- Toda petición lleva `Authorization: Bearer <clave>`. Sin clave o con una inventada: **401**,
  también en rutas que no existen (a quien no tiene clave no se le dice qué rutas hay).
- `TOKEN_PRINCIPAL` es la del dueño; `TOKEN_INVITADO` la que se comparte. El invitado puede
  **ver y editar todo** (decisión del dueño). Cambiar `TOKEN_INVITADO` revoca a los invitados.
- Sin `TOKEN_PRINCIPAL` la API responde **503** a todo: falla cerrada.
- En CloudWatch queda solo `MÉTODO /ruta -> estado` por petición: ni el cuerpo (ahí va el
  texto del diario) ni los headers (ahí va la clave).
- **La clave queda atada a su servidor:** si un enlace cambia la dirección de la API, la app
  pregunta mostrando a dónde lleva, y aunque se acepte olvida las claves anteriores. Así un
  enlace malicioso no puede llevarse tu clave a otro servidor.
- En el navegador, las claves viven en `sessionStorage` (se borran al cerrar la app) y la
  app se bloquea tras **3 minutos** fuera de ella (`BLOQUEO_MS` en `app/src/api.js`). El
  candado del encabezado bloquea al instante. Si se bloquea con un formulario abierto, lo
  escrito se conserva en memoria y el formulario se reabre al volver a entrar.
- En la app, **Compartir** arma un mensaje de WhatsApp (`wa.me/?text=`) con el enlace de
  invitado, la URL y la clave de invitado. Nunca la principal: hay pruebas que lo verifican.
- CORS en API Gateway permite los headers `content-type` y `authorization`.

---

## Costos

- Plan gratuito nuevo de AWS, con **$120 USD de crédito** que vencen el **16/09/2027**.
- Presupuesto *zero spend* configurado: avisa a `jefernee50@gmail.com` si el gasto pasa de $0.01.
- El proyecto entero cabe en la capa gratuita. Lo único que cobra por hora sería
  ECS/Fargate, que **no** se usó.

---

## Estructura

```
lambda_function.py      la función: acceso con clave + router + 6 endpoints + export
iam-policy.json         política de mínimo privilegio (ya con cuenta y bucket reales)
datos-prueba.json       10 registros de ejemplo
cargar_datos.py         los carga por la API o por boto3
demo.sh                 guion de la demo en vivo
pruebas_e2e.py          16 verificaciones contra la API desplegada
tests/                  75 pruebas con pytest + moto
servidor_local.py       la Lambda real contra AWS emulado, en localhost:8787
app/                    aplicación React + Vite (PWA instalable), 91 pruebas con vitest
frontend/index.html     la misma idea en un archivo, sin dependencias
DESPLIEGUE.md           paso a paso en la consola de AWS
PLAN-proyecto-final-modulo3.md   el plan contra la rúbrica
```

## Comandos

```bash
python -m pytest tests -q                 # 75 pruebas de la Lambda
cd app && npm test                        # 91 pruebas de la app
python servidor_local.py                  # API local sin AWS, clave "local"
python pruebas_e2e.py <URL_API> <CLAVE>   # 19 verificaciones contra la API real
python cargar_datos.py <URL_API> <CLAVE>  # carga los 10 registros de ejemplo
cd app && npm run dev                     # app en localhost:5173
```

Probar la app sin tocar AWS: `python servidor_local.py` y abrir
`http://localhost:5173/#api=http://localhost:8787&token=local&invitado=local-invitado`.

La app publicada **lleva la URL de la API dentro**: sale de la variable del repositorio
`VITE_API_URL`, que usa `.github/workflows/pages.yml` al compilar. Es seguro porque la API
exige clave: la dirección sola no da acceso. Así, en cualquier aparato la app solo pide la
clave. En desarrollo local la URL sale de `app/.env.local`.

---

## Reglas del proyecto que conviene no romper

De la rúbrica (el PDF está en `../proyecto-final-modulo-3.pdf`):

- **50 %** es que la API responda **en vivo** el día de la demo y que los datos persistan.
- **30 %** es cubrir el stack: IAM específico, API Gateway sobre Lambda, DynamoDB, S3 y
  CloudWatch con logs, alarma y dashboard.
- **20 %** es defender las decisiones de diseño.
- **No se evalúa**: calidad del código, manejo exhaustivo de errores, tests, frontend ni
  documentación más allá del README. La app de `app/` es un extra.
- `AdministratorAccess` y `AmazonDynamoDBFullAccess` están **prohibidos**.
- El día de la demo hacen falta **entre 5 y 10 registros** en la tabla.

Mínimos técnicos: 6 endpoints, partition key apropiada, al menos una consulta que no sea
por ID (aquí, `scan` con `FilterExpression`), export que cree un archivo real en S3, y
retención de logs distinta de "nunca vence".

---

## Decisiones ya tomadas (y por qué)

- **Una sola Lambda con router interno** para CRUD y export. Separarlas está listado como
  mejora, no como deuda oculta.
- **`scan` con `FilterExpression`, no GSI.** El proyecto acepta el scan; el GSI es bonus y
  además es la respuesta a "¿y si mañana hay 10 000 usuarios?".
- **El diario queda fuera del export** salvo que se pida con `?tipo=diario`. Cumple el
  requisito tal cual está escrito y no sube entradas personales a S3 sin pedirlo. Cada
  export se llama `exports/<catalogo|diario>-<fecha>_<hora>.json`, así dos seguidos no se pisan.
- **Floats convertidos a `Decimal`**: DynamoDB no acepta float, y un rating de 4.5 hacía
  fallar la API.
- **`scan` paginado** con `LastEvaluatedKey`: sin eso, con volumen alto el listado y el
  export salían incompletos en silencio.
- **Una hoja por día.** Una nota larga no se parte en varias hojas: la hoja crece y se lee
  bajando, y abajo hay botones para pasar de hoja. (Antes se partía en columnas; en el celular
  había que pasar muchas hojas para leer un solo día.)
- **Las hojas van por su fecha**, no por cuándo se escribieron: una página del día 20 escrita
  hoy queda entre las del 20. Al guardarla, el libro se abre en ella (`ordenarPaginas`, `Libro`).
- **Las hojas conservan siempre su color** en cualquier tema: el cuaderno es blanco y la rosa
  es rosa. Se probó darles versión de noche y al dueño no le gustó: no se distinguían.
  `color-scheme: only light` en la raíz y en `.pagina` evita que el navegador las oscurezca por
  su cuenta. Chrome y Samsung Internet lo hacen si nadie se lo impide y las dejan casi negras.
- **La app arranca en claro** aunque el teléfono esté en oscuro. Oscuro y "según el teléfono"
  se eligen en Ajustes, y solo entonces se guarda el tema (`catalogo.tema-elegido`). Las
  versiones anteriores lo guardaban solas en cada visita (`catalogo.tema`, `catalogo.apariencia`),
  y ese valor impedía cambiarlo; la app borra esas llaves al abrir.
- **La app se actualiza sola.** Al volver a ella o al tocar Actualizar, si Pages ya tiene otra
  compilación, recarga, salvo con algo a medio escribir (`version.js`). Ajustes muestra de
  cuándo es la versión abierta.
- **Estilo del código y de la interfaz en español**, igual que el resto del proyecto.

---

## Cómo cambiar cosas

**Lo más importante: la Lambda no se despliega sola.** El repositorio no está conectado
con AWS. Cambiar `lambda_function.py` aquí no cambia nada en la nube: hay que abrir la
consola → Lambda → `catalogo-personal-api` → pestaña **Code**, pegar el archivo completo
y darle a **Deploy**. Después conviene correr `pruebas_e2e.py` para confirmar.

La app de `app/` **sí** se publica sola: cada push a `main` que toque `app/` dispara el
workflow de `.github/workflows/pages.yml` y actualiza GitHub Pages.

| Quiero… | Dónde se toca |
|---|---|
| Agregar un tipo (por ejemplo `podcast`) | `TIPOS_VALIDOS` en `lambda_function.py`, y `TIPOS` + `ETIQUETAS` + `ICONOS` + `CAMPO_EXTRA` en `app/src/api.js`. Luego pegar la Lambda en la consola. |
| Agregar un fondo de página | `FONDOS_VALIDOS` en la Lambda, `FONDOS` en `app/src/api.js` y una clase `.fondo-<id>` en `styles.css` (`--pagina-fondo` y, si hace falta, `--tinta`). |
| Cambiar el nombre de la sección Listas | la constante `NOMBRE_LISTAS` en `app/src/App.jsx`. |
| Cambiar el nombre del dueño | la constante `DUENO` en `app/src/api.js` (sale en la invitación y en el acceso). |
| Cambiar el texto de la invitación | `mensajeInvitacion()` en `app/src/acceso.jsx`. |
| Agregar un campo nuevo a los ítems | la lista de campos en `crear()` y la de `editables` en `actualizar()`, en `lambda_function.py`. DynamoDB no necesita cambios: no tiene esquema fijo. |
| Cambiar un estado o su orden | `ESTADOS_VALIDOS` en la Lambda; `ESTADOS`, `SIGUIENTE_ESTADO` y `ACCION_ESTADO` en `app/src/api.js`. |
| Agregar un endpoint | la función y el router en `lambda_function.py`, **y** la ruta en API Gateway → Rutas (si no existe la ruta, da 404 aunque el código esté bien). |
| Cambiar colores o tipografía | los tokens al inicio de `app/src/styles.css`. Todo el resto los hereda, incluido el tema oscuro. |
| Cambiar los permisos de la Lambda | `iam-policy.json` aquí, y pegarlo en IAM → Roles → `catalogo-personal-lambda-role` → política `catalogo-personal-permisos`. |
| Permitir otro origen en el navegador | API Gateway → CORS. Recordar: el valor hay que escribirlo **y darle a Agregar**, si no, no se guarda. |
| Cambiar la URL de la API en la app | `app/.env.local` (local), o abrir la app con `#api=<url>&token=<clave>` al final del enlace. |
| Quitarle el acceso a un invitado | cambiar `TOKEN_INVITADO` en la Lambda (ver el final de `DESPLIEGUE.md`). |

**Antes de dar por bueno un cambio:**

```bash
python -m pytest tests -q          # la lógica, contra AWS emulado
python pruebas_e2e.py <url>        # la API real, ya desplegada
```

**Errores típicos y qué significan** (están también en `DESPLIEGUE.md`):

- **502** — el `return` de la Lambda no trae `statusCode`, `headers` o `body`.
- **403** — API Gateway no tiene permiso para invocar la Lambda.
- **404 desde la app** — la ruta no existe en API Gateway, o la pantalla quedó
  desactualizada (la app recarga sola en ese caso).
- **401** — falta la clave o es incorrecta. **503** — la Lambda no tiene `TOKEN_PRINCIPAL`.
- **"No se pudo conectar" en el navegador** — o no hay internet (la app lo dice), o CORS no
  permite el header `authorization`.
- El traceback completo de cualquier error está en **CloudWatch Logs**, nunca en la
  pantalla de Lambda.

---

## Pendientes

- [x] Dominio anunciado en el grupo del curso (15/09/2026), igual que los compañeros:
      Mel gestor de tareas, Dani tracker de hábitos, Andrés reservaciones, Joan inventario.
- [ ] Llenar el catálogo con datos reales antes de la demo (mínimo 5).
- [ ] Ensayar los 10-15 minutos: intro, diagrama, demo en vivo, una decisión, preguntas.
- [ ] Opcional (bonus, $0): GSI por `tipo`+`estado`, Pulumi, tope de peticiones en la etapa.

**No borrar nada de AWS hasta después de presentar.** El orden de limpieza, si algún día
se decide, está al final de `DESPLIEGUE.md`.
