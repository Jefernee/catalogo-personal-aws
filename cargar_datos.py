"""
Carga los datos de prueba en la tabla.

Dos formas, segun lo que tengas a mano:

  1. A traves de tu propia API (no necesita AWS CLI ni credenciales):

        python cargar_datos.py https://TU-ID.execute-api.us-east-1.amazonaws.com/dev

  2. Directo a DynamoDB (necesita el AWS CLI configurado con `aws configure`):

        python cargar_datos.py

La opcion 1 ademas prueba de paso que tu endpoint POST funciona.
"""

import json
import sys
import urllib.error
import urllib.request

TABLE_NAME = "catalogo-personal"
REGION = "us-east-1"


def cargar_por_api(base):
    base = base.rstrip("/")
    cargados = 0

    for item in items:
        peticion = urllib.request.Request(
            f"{base}/catalogo",
            data=json.dumps(item).encode(),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(peticion, timeout=30) as r:
                if r.status == 201:
                    cargados += 1
                    print(f"  + {item['tipo']:12} {item['titulo']}")
                else:
                    print(f"  ! {item['titulo']}: status {r.status}")
        except urllib.error.HTTPError as e:
            print(f"  ! {item['titulo']}: {e.code} {e.read().decode(errors='replace')[:120]}")
        except urllib.error.URLError as e:
            print(f"\nNo se pudo conectar: {e.reason}")
            return 1

    print(f"\n{cargados} de {len(items)} items cargados via API")
    return 0 if cargados == len(items) else 1


def cargar_por_boto3():
    import uuid
    from datetime import datetime, timezone

    import boto3

    table = boto3.resource("dynamodb", region_name=REGION).Table(TABLE_NAME)
    creado_en = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    for item in items:
        item["item_id"] = str(uuid.uuid4())
        item["creado_en"] = creado_en
        table.put_item(Item=item)
        print(f"  + {item['tipo']:12} {item['titulo']}")

    print(f"\n{len(items)} items cargados en {TABLE_NAME}")
    return 0


if __name__ == "__main__":
    with open("datos-prueba.json", encoding="utf-8") as f:
        items = json.load(f)

    if len(sys.argv) > 1:
        sys.exit(cargar_por_api(sys.argv[1]))

    try:
        sys.exit(cargar_por_boto3())
    except ImportError:
        print("boto3 no esta instalado. Pasa la URL de tu API:")
        print("  python cargar_datos.py https://TU-ID.execute-api.us-east-1.amazonaws.com/dev")
        sys.exit(2)
    except Exception as error:
        print(f"Fallo la carga directa: {error}")
        print("\nSi no tienes el AWS CLI configurado, pasa la URL de tu API:")
        print("  python cargar_datos.py https://TU-ID.execute-api.us-east-1.amazonaws.com/dev")
        sys.exit(1)
