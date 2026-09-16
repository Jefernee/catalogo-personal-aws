# Proyecto Final — Módulo 3 · Backend Serverless en AWS
## Dominio: Catálogo personal (+ diario como tipo adicional)

Individual · Semanas 23 y 24 · Entrega: demo en vivo + repo en GitHub
Todo en **us-east-1**, en tu propia cuenta AWS. Costo esperado: **$0** (todo entra en free tier).

---

## 1. Qué se evalúa (rúbrica, pág. 15)

| Criterio | Indicadores | Peso |
|---|---|---|
| La API funciona | Todos los endpoints responden en la demo en vivo. Los datos persisten entre llamadas. El export crea un archivo real en S3. | **50%** |
| Cubre el stack del módulo | IAM con permisos específicos. API Gateway sobre Lambda. DynamoDB. S3. CloudWatch con logs, alarma y dashboard. | **30%** |
| Puede explicar sus decisiones | Por qué DynamoDB y no RDS. Qué permisos tiene su rol. Qué hace su alarma. Qué cambiaría para escalar. | **20%** |

**No se evalúa:** elegancia del código, manejo exhaustivo de errores, tests, documentación más allá del README, frontend, estilo del código.

Niveles: *Completo* (funciona, cubre todo, explica con seguridad) · *Funcional* (funciona en su mayoría, explica lo básico) · *En progreso* (menos de 4 endpoints, o falta un servicio clave) · *Incompleto* (la API no responde en la demo).

---

## 2. Modelo de datos (ajustado a lo que pide el PDF)

El PDF (pág. 10) pide **una tabla con partition key apropiada y al menos un query o scan con filtro que no sea solo por ID**. Un `scan` con `FilterExpression` es aceptable; el GSI es **bonus**, no requisito.

**Tabla:** `catalogo-personal`
**Partition key:** `item_id` (string, UUID — nunca secuencial: `str(uuid.uuid4())`)

### Ítem de catálogo

```json
{
  "item_id": "550e8400-e29b-41d4-a716-446655440000",
  "tipo": "libro",
  "titulo": "El nombre del viento",
  "estado": "terminado",
  "rating": 5,
  "fecha_consumido": "2026-09-10",
  "notas": "Mejor de lo que esperaba",
  "tags": ["fantasia", "releer"],
  "autor": "Patrick Rothfuss",
  "creado_en": "2026-09-01T10:30:00Z"
}
```

### Entrada de diario (mismo tipo de ítem, otro `tipo`)

```json
{
  "item_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "tipo": "diario",
  "titulo": "Primer día del proyecto",
  "contenido": "Elegí catálogo personal porque...",
  "fecha": "2026-09-15",
  "creado_en": "2026-09-15T21:00:00Z"
}
```

Los ítems **no comparten los mismos campos** — un libro tiene `autor`, un restaurante tendría `ciudad`, el diario tiene `contenido`. Ese es exactamente el argumento de "por qué DynamoDB y no RDS".

**El filtro obligatorio:** `GET /catalogo?tipo=libro&estado=pendiente` → `scan` con `FilterExpression`. Cumple el requisito sin necesidad de GSI.

Valores de `tipo`: libro, pelicula, serie, musica, juego, restaurante, diario.
Valores de `estado`: pendiente, en_curso, terminado, abandonado.

---

## 3. Endpoints (mínimo 6, pág. 9)

| Método | Ruta | Función |
|---|---|---|
| GET | `/catalogo` | Listar todo · con `?tipo=` y `?estado=` → scan con FilterExpression |
| GET | `/catalogo/{id}` | Obtener un ítem por ID |
| POST | `/catalogo` | Crear un ítem (genera el UUID) |
| PUT | `/catalogo/{id}` | Actualizar (cambiar estado, poner rating) |
| DELETE | `/catalogo/{id}` | Eliminar |
| POST | `/export` | Exportar a S3 |

**`/export`** (pág. 11): consulta DynamoDB → serializa a JSON → `PutObject` en `exports/export-2026-09-30.json` → responde 200 con:

```json
{"mensaje": "Exportación exitosa", "archivo": "exports/export-2026-09-30.json", "total_registros": 42}
```

Por defecto exporta **solo el catálogo**; el diario queda fuera salvo que se pida explícitamente con `?tipo=diario`.

---

## 4. IAM — rol de ejecución de la Lambda (pág. 8)

`AdministratorAccess` y `AmazonDynamoDBFullAccess` **no están permitidos**. El rol lleva exactamente:

```json
{
  "Action": [
    "dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem",
    "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
    "s3:PutObject",
    "logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"
  ]
}
```

---

## 5. CloudWatch — las tres piezas, ninguna opcional (pág. 12)

1. **Log Group con retención de 7 días** — nunca *Never expire*.
2. **Una alarma** sobre una métrica significativa: `Lambda Errors > 0`, o una custom metric de negocio (`ItemsCreados`).
3. **Un dashboard con 2 widgets mínimo**: invocaciones y errores de la Lambda, más la métrica de la alarma.

Cualquier estado de la alarma es válido el día de la demo (OK, ALARM o INSUFFICIENT_DATA). Lo que se evalúa es que exista y que puedas explicar qué vigila.

---

## 6. Orden de construcción (pág. 23 — no empieces por API Gateway)

1. Crear la tabla DynamoDB
2. Handler Lambda probado local
3. Desplegar y probar con eventos de consola
4. Verificar lectura y escritura en DynamoDB
5. Conectar API Gateway
6. Bucket S3 + endpoint `/export`
7. CloudWatch: retención, alarma, dashboard
8. *(si sobra tiempo)* agregar el tipo `diario`

`/export` es independiente del CRUD: es lo más fácil de dejar para el final y el peor candidato para empezar.

**Dos cosas que ahorran horas (pág. 24):**

- Variables de entorno (`TABLE_NAME`, `BUCKET_NAME`) en vez de nombres hardcodeados.
- El return **debe** llevar los tres campos o API Gateway devuelve 502:

```python
return {
    "statusCode": 200,
    "headers": {"Content-Type": "application/json"},
    "body": json.dumps({...})
}
```

Cuando algo falle, el traceback está en **CloudWatch Logs**, no en la consola de Lambda:
`aws logs tail /aws/lambda/tu-funcion --follow`

---

## 7. Cronograma (pág. 17)

| Semana | Clase | Objetivo al terminar |
|---|---|---|
| 23 | 1 | Dominio elegido. Saber qué tabla y qué endpoints. |
| 23 | 2 | Tabla creada con datos. Lambda desplegada. `GET /catalogo` responde. |
| 24 | 1 | 4 de 6 endpoints funcionando. Bucket S3 creado. |
| 24 | 2 | Demo completa + diagrama + defensa de decisiones. |

---

## 8. Checklist de entrega

**README (pág. 13) — nada más que esto, lo demás no se evalúa:**

- [ ] Descripción del dominio (2-3 líneas)
- [ ] Diagrama de arquitectura (foto, draw.io o ASCII)
- [ ] Lista de endpoints (método, ruta, descripción)
- [ ] Un ejemplo de llamada (curl o colección Postman)

**Vivo el día de la demo:**

- [ ] Repo en GitHub con el código de las Lambdas
- [ ] URL de API Gateway activa y respondiendo **en ese momento**
- [ ] Tabla DynamoDB con 5-10 registros de prueba
- [ ] Bucket S3 con al menos un archivo exportado
- [ ] Dashboard de CloudWatch con datos reales de tus invocaciones
- [ ] Alarma configurada (cualquier estado)

**Nunca:** `AWS_ACCESS_KEY_ID` en el repo. Variables de entorno en Lambda.

---

## 9. Presentación — 10 a 15 min (pág. 18)

| Tiempo | Contenido |
|---|---|
| 1-2 min | Introducción del dominio — qué resuelve y por qué lo elegiste |
| 2 min | Diagrama de arquitectura — el flujo completo de una petición |
| 6-8 min | Demo en vivo — CRUD, export y la consola de AWS |
| 2 min | Una decisión que tomaste y por qué |
| 2-3 min | Preguntas |

**Orden de la demo (pág. 19):** crear → listar → actualizar → exportar. Después la consola, en este orden: el archivo en S3, el Log Group con los logs recién generados, el dashboard, la alarma.

---

## 10. La defensa — 20% de la nota (pág. 20)

Respuestas preparadas para las seis preguntas:

1. **¿Por qué DynamoDB y no RDS?** — Mis ítems no comparten las mismas columnas: un libro tiene autor, un restaurante tiene ciudad, una entrada de diario tiene contenido. En relacional serían tablas separadas o columnas nulas. Además no hay relaciones complejas y quería evitar configurar una VPC.
2. **¿Qué permisos tiene el rol y por qué esos?** — Los diez de la sección 4. Nada de `*`: la Lambda solo lee y escribe su tabla, sube a un bucket y escribe logs.
3. **¿Qué hace exactamente la alarma?** — Vigila la métrica `Errors` de la Lambda; si hay más de 0 en un periodo, se dispara. Cubre una sola falla posible, y ese es su límite.
4. **¿Acceso a un desarrollador frontend?** — API Key en API Gateway, nunca credenciales de AWS.
5. **¿Qué pasa si la Lambda falla? ¿Cómo te enterás?** — Por la alarma, y el traceback está en CloudWatch Logs.
6. **¿Y si mañana hay 10,000 usuarios?** — El `scan` sobre toda la tabla deja de escalar: agregaría un GSI por `tipo` y `estado`, y separaría los endpoints en Lambdas distintas.

Ejemplo de respuesta válida según el PDF: *"puse la retención de logs en 7 días para no generar costos innecesarios"*.

---

## 11. Bonus (pág. 14 — no restan puntos si no están)

| Bonus | Qué demuestra | Costo |
|---|---|---|
| Pulumi | Tabla y bucket como código Python en vez de consola | $0 |
| GSI en DynamoDB | Queries eficientes por un atributo que no es la partition key | $0 |
| Autenticación | Endpoints protegidos con API Key en API Gateway | $0 |
| Segunda tabla | Dos entidades con relación entre ellas | $0 |
| ECS en vez de Lambda | Contenerizar, subir a ECR, desplegar en Fargate | ~$0.05 USD/hora — **teardown inmediato** |

El más rentable para este dominio: **GSI** (`tipo` + `estado`), porque ya es la respuesta que vas a dar en la pregunta 6 de la defensa.

---

## 12. Limpieza al finalizar (pág. 22)

En este orden: 1) ECS service si usaste el bonus · 2) Lambda y API Gateway · 3) tabla DynamoDB · 4) vaciar el bucket S3 y después eliminarlo · 5) Log Group y rol IAM.

---

## Pendiente antes de arrancar

Confirmar con Ericka que no hay problema con el dominio. El PDF no prohíbe repetir dominios, y catálogo personal no lo tomó nadie del grupo, así que debería estar libre — pero vale la pregunta en la clase.
