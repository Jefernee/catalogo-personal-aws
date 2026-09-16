#!/usr/bin/env bash
# Demo en vivo - orden del proyecto: crear, listar, actualizar, exportar.
#
#   export API=https://TU-ID.execute-api.us-east-1.amazonaws.com/dev
#   bash demo.sh
#
# Despues de correrlo, mostrar en la consola de AWS, en este orden:
#   1. el archivo exportado en S3
#   2. el Log Group con los logs de estas invocaciones
#   3. el dashboard con las metricas
#   4. la alarma configurada

set -e

if [ -z "$API" ]; then
  echo "Falta la variable API. Ejemplo:"
  echo "  export API=https://abc123.execute-api.us-east-1.amazonaws.com/dev"
  exit 1
fi

echo "== 1. Crear un item =========================================="
RESPUESTA=$(curl -s -X POST "$API/catalogo" \
  -H "Content-Type: application/json" \
  -d '{"tipo":"libro","titulo":"Piranesi","autor":"Susanna Clarke","estado":"pendiente"}')
echo "$RESPUESTA"

ID=$(echo "$RESPUESTA" | python -c "import sys,json; print(json.load(sys.stdin)['item_id'])")
echo "id creado: $ID"

echo
echo "== 2. Listar todo ============================================"
curl -s "$API/catalogo"

echo
echo
echo "== 3. Listar con filtro (scan con FilterExpression) =========="
curl -s "$API/catalogo?tipo=libro&estado=pendiente"

echo
echo
echo "== 4. Obtener uno por ID ====================================="
curl -s "$API/catalogo/$ID"

echo
echo
echo "== 5. Actualizar: lo termine y le pongo rating ==============="
curl -s -X PUT "$API/catalogo/$ID" \
  -H "Content-Type: application/json" \
  -d '{"estado":"terminado","rating":5,"notas":"Rarisimo y precioso"}'

echo
echo
echo "== 6. Exportar a S3 =========================================="
curl -s -X POST "$API/export"

echo
echo
echo "== 7. Eliminar ==============================================="
curl -s -X DELETE "$API/catalogo/$ID"

echo
echo
echo "Listo. Ahora la consola de AWS: S3 -> Logs -> Dashboard -> Alarma."
