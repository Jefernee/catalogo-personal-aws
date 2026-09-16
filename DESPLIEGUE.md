# Despliegue paso a paso (consola de AWS)

Todo en **us-east-1**. El orden importa: es el que menos bloqueos genera (no empieces por API Gateway).

---

## 1 · Tabla DynamoDB

DynamoDB → Create table

- **Table name:** `catalogo-personal`
- **Partition key:** `item_id` · tipo **String**
- Sort key: ninguna
- Settings: **Default** (On-demand)

> No definas `tipo`, `estado` ni los demás campos: DynamoDB no tiene esquema fijo, solo la clave se declara.

---

## 2 · Bucket S3

S3 → Create bucket

- **Name:** `catalogo-personal-<tus-iniciales>-<numero>` (tiene que ser único en todo AWS)
- Region: **us-east-1**
- Block all public access: **activado** (queda así por defecto)

Anota el nombre exacto: va en la variable de entorno y en la policy de IAM.

---

## 3 · Rol IAM de la Lambda

IAM → Roles → Create role

- Trusted entity: **AWS service** → **Lambda**
- Permissions: **no marques nada todavía** → Next
- **Role name:** `catalogo-personal-lambda-role`

Ya creado el rol: pestaña **Permissions** → Add permissions → **Create inline policy** → pestaña **JSON** → pegar el contenido de [`iam-policy.json`](iam-policy.json), reemplazando `TU_ACCOUNT_ID` y `TU-BUCKET-catalogo-personal` por los tuyos.

- **Policy name:** `catalogo-personal-permisos`

> `AdministratorAccess` y `AmazonDynamoDBFullAccess` no están permitidos en este proyecto. Estos diez permisos son exactamente los que la función necesita, y son la respuesta a una de las preguntas de la defensa.

Tu account ID está arriba a la derecha en la consola, o con `aws sts get-caller-identity`.

---

## 4 · Función Lambda

Lambda → Create function → **Author from scratch**

- **Function name:** `catalogo-personal-api`
- **Runtime:** Python 3.13
- **Architecture:** x86_64
- Permissions → **Use an existing role** → `catalogo-personal-lambda-role`

Ya creada:

**a) Código.** Pestaña **Code** → pegar el contenido de [`lambda_function.py`](lambda_function.py) en el editor → **Deploy**.
(`boto3` ya viene incluido en el runtime de Lambda; no hay que empaquetar nada.)

**b) Variables de entorno.** Configuration → Environment variables → Edit:

| Key | Value |
|---|---|
| `TABLE_NAME` | `catalogo-personal` |
| `BUCKET_NAME` | el nombre exacto de tu bucket |

**c) Timeout.** Configuration → General configuration → Edit → **Timeout: 30 seg** (los 3 seg por defecto se quedan cortos en el export).

**d) Probar antes de seguir.** Pestaña **Test** → Create new event → pegar:

```json
{
  "requestContext": { "http": { "method": "GET", "path": "/catalogo" } },
  "queryStringParameters": {}
}
```

Debe responder `statusCode 200`. Si falla acá, el problema es la Lambda o el rol — no sigas a API Gateway todavía.

---

## 5 · Cargar los datos de prueba

Deja 10 registros en la tabla (8 de catálogo + 2 de diario). El proyecto pide entre 5 y 10 el día de la demo.

**Si no tienes el AWS CLI configurado**, este paso se hace **después** del paso 6, cargando los datos a través de tu propia API:

```bash
python cargar_datos.py https://TU-ID.execute-api.us-east-1.amazonaws.com/dev
```

**Si sí lo tienes** (`aws configure` ya hecho), va directo a DynamoDB y puedes hacerlo aquí mismo:

```bash
python cargar_datos.py
```

---

## 6 · API Gateway

API Gateway → **HTTP API** → Build

- **API name:** `catalogo-personal-api`
- Integrations: **Lambda** → `catalogo-personal-api`

Luego, en **Routes**, crear estas seis (todas apuntando a la misma Lambda):

| Método | Ruta |
|---|---|
| GET | `/catalogo` |
| GET | `/catalogo/{id}` |
| POST | `/catalogo` |
| PUT | `/catalogo/{id}` |
| DELETE | `/catalogo/{id}` |
| POST | `/export` |

Stage: `dev` (con **Auto-deploy** activado).

Copia la **Invoke URL** — se ve así: `https://abc123.execute-api.us-east-1.amazonaws.com/dev`

> Si te da **403**, API Gateway no tiene permiso para invocar la Lambda: revisa el resource-based policy de la función.
> Si te da **502**, el return de la Lambda no trae `statusCode`, `headers` o `body`.

---

## 7 · CloudWatch — las tres piezas

**a) Retención de logs.** CloudWatch → Log groups → `/aws/lambda/catalogo-personal-api` → Actions → **Edit retention setting** → **1 week**.
Nunca *Never expire*: esa es una respuesta directa de la defensa (evitar costos innecesarios).

**b) Alarma.** CloudWatch → Alarms → Create alarm → Select metric → Lambda → By Function Name → `catalogo-personal-api` → **Errors**

- Statistic: Sum · Period: 5 minutes
- Condition: **Greater than 0**
- Notification: puedes quitarla o mandarla a un SNS con tu correo
- **Alarm name:** `catalogo-personal-errores`

Cualquier estado sirve el día de la demo (OK, ALARM o INSUFFICIENT_DATA). Lo que se evalúa es que exista y que sepas explicar qué vigila.

**c) Dashboard.** CloudWatch → Dashboards → Create dashboard → `catalogo-personal`

Dos widgets mínimo:
1. **Invocations** de la Lambda (Line)
2. **Errors** de la Lambda (Line)

Tiene que mostrar datos reales de tus invocaciones, así que créalo **después** de haber probado la API.

---

## 8 · Probar de punta a punta

```bash
# QA automatico: 15 verificaciones contra la API real
python pruebas_e2e.py https://TU-ID.execute-api.us-east-1.amazonaws.com/dev

# y el guion de la demo
export API=https://TU-ID.execute-api.us-east-1.amazonaws.com/dev
bash demo.sh
```

Si `pruebas_e2e.py` sale todo en verde, lo unico que queda por revisar a mano es el archivo en S3, el dashboard y la alarma.

---

## 9 · Bonus (opcionales, no restan puntos si no están)

- **GSI** en DynamoDB por `tipo` + `estado` → hace eficiente lo que hoy es un `scan`
- **API Key** en API Gateway → endpoints protegidos
- **Pulumi** → tabla y bucket como código Python

---

## 10 · Limpieza al terminar

En este orden:

1. Lambda y API Gateway
2. Tabla DynamoDB
3. **Vaciar** el bucket S3 y después eliminarlo
4. Log Group y rol IAM

(Si usaste el bonus de ECS/Fargate, ese va **primero**: es lo único que cobra por hora.)
