"""
Pruebas de humo contra la API ya desplegada en AWS.

Las pruebas de tests/ corren contra un AWS emulado: validan la logica.
Estas corren contra la API de verdad: validan lo que el emulador no puede
ver -- que API Gateway este conectado, que el rol IAM tenga los permisos,
que el archivo llegue al bucket.

    python pruebas_e2e.py https://TU-ID.execute-api.us-east-1.amazonaws.com/dev

Solo usa la libreria estandar: no necesita instalar nada.
Crea y elimina sus propios registros; no toca los de tu demo.
"""

import json
import sys
import urllib.error
import urllib.request

VERDE, ROJO, GRIS, FIN = "\033[92m", "\033[91m", "\033[90m", "\033[0m"

resultados = []


def pedir(metodo, url, cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    peticion = urllib.request.Request(url, data=datos, method=metodo,
                                      headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(peticion, timeout=30) as r:
            return r.status, json.loads(r.read() or "{}")
    except urllib.error.HTTPError as e:
        crudo = e.read()
        try:
            return e.code, json.loads(crudo or "{}")
        except json.JSONDecodeError:
            return e.code, {"crudo": crudo.decode(errors="replace")[:200]}
    except urllib.error.URLError as e:
        return 0, {"error": f"no se pudo conectar: {e.reason}"}


def probar(nombre, condicion, detalle=""):
    resultados.append((nombre, bool(condicion)))
    marca = f"{VERDE}PASA{FIN}" if condicion else f"{ROJO}FALLA{FIN}"
    print(f"  [{marca}] {nombre}" + (f"{GRIS}  {detalle}{FIN}" if detalle else ""))


def main(base):
    base = base.rstrip("/")
    print(f"\nProbando {base}\n")

    # 1. La API responde
    status, cuerpo = pedir("GET", f"{base}/catalogo")
    probar("GET /catalogo responde 200", status == 200, f"status={status}")
    if status != 200:
        print(f"\n{ROJO}La API no responde. Revisa la Invoke URL y que el stage este desplegado.{FIN}")
        if status == 502:
            print("502 = el return de la Lambda no trae statusCode, headers o body.")
        if status == 403:
            print("403 = API Gateway no puede invocar la Lambda (resource-based policy).")
        return 1

    total_inicial = cuerpo.get("total", 0)
    probar("El listado trae 5-10 registros de prueba", 5 <= total_inicial <= 10,
           f"hay {total_inicial} (el proyecto pide entre 5 y 10)")

    # 2. Crear
    status, creado = pedir("POST", f"{base}/catalogo", {
        "tipo": "libro", "titulo": "QA - borrar", "autor": "Prueba automatica",
    })
    probar("POST /catalogo crea y devuelve 201", status == 201, f"status={status}")
    if status != 201:
        print(f"\n{ROJO}No se pudo crear. Sin dynamodb:PutItem en el rol, esto falla.{FIN}")
        return 1

    item_id = creado["item_id"]
    probar("El item trae item_id", bool(item_id), item_id)

    # 3. Persistencia
    status, leido = pedir("GET", f"{base}/catalogo/{item_id}")
    probar("GET /catalogo/{id} devuelve lo creado",
           status == 200 and leido.get("titulo") == "QA - borrar", f"status={status}")

    status, listado = pedir("GET", f"{base}/catalogo")
    probar("Los datos persisten entre llamadas",
           listado.get("total") == total_inicial + 1,
           f"{total_inicial} -> {listado.get('total')}")

    # 4. Filtro (el scan con FilterExpression)
    status, filtrado = pedir("GET", f"{base}/catalogo?tipo=libro")
    probar("Filtro por tipo funciona",
           status == 200 and all(i["tipo"] == "libro" for i in filtrado.get("items", [])),
           f"{filtrado.get('total')} libros")

    # 5. Actualizar
    status, actualizado = pedir("PUT", f"{base}/catalogo/{item_id}",
                                {"estado": "terminado", "rating": 5})
    probar("PUT /catalogo/{id} actualiza",
           status == 200 and actualizado.get("estado") == "terminado", f"status={status}")
    probar("Al terminar se fija fecha_consumido sola",
           bool(actualizado.get("fecha_consumido")), actualizado.get("fecha_consumido", ""))

    # 6. Export a S3
    status, export = pedir("POST", f"{base}/export")
    probar("POST /export responde 200", status == 200, f"status={status}")
    if status == 200:
        probar("El export devuelve la key del archivo",
               str(export.get("archivo", "")).startswith("exports/export-"),
               export.get("archivo", ""))
        probar("El export cuenta registros", isinstance(export.get("total_registros"), int),
               f"total_registros={export.get('total_registros')}")
    else:
        print(f"    {GRIS}sin s3:PutObject en el rol, o el nombre del bucket no coincide{FIN}")

    # 7. Errores esperados
    status, _ = pedir("GET", f"{base}/catalogo/id-que-no-existe")
    probar("Un id inexistente devuelve 404", status == 404, f"status={status}")

    status, _ = pedir("POST", f"{base}/catalogo", {"tipo": "libro"})
    probar("Crear sin titulo devuelve 400", status == 400, f"status={status}")

    # 8. Limpieza
    status, _ = pedir("DELETE", f"{base}/catalogo/{item_id}")
    probar("DELETE /catalogo/{id} elimina", status == 200, f"status={status}")

    status, _ = pedir("GET", f"{base}/catalogo/{item_id}")
    probar("Lo eliminado ya no esta", status == 404, f"status={status}")

    fallaron = [n for n, ok in resultados if not ok]
    print(f"\n{len(resultados) - len(fallaron)}/{len(resultados)} pruebas pasaron")
    if fallaron:
        print(f"{ROJO}Fallaron:{FIN}")
        for n in fallaron:
            print(f"  - {n}")
        return 1

    print(f"{VERDE}Todo en verde. La API esta lista para la demo.{FIN}")
    print(f"{GRIS}Falta revisar a mano: el archivo en S3, el dashboard y la alarma en CloudWatch.{FIN}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
