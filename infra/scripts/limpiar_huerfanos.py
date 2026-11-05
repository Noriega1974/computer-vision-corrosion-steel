#!/usr/bin/env python3
"""
pf-corrosion — Limpieza puntual de huérfanos que detecta detectar_huerfanos.py.

SIMULACIÓN POR DEFECTO: sin --aplicar solo imprime lo que haría y no escribe nada.
Con --aplicar borra EXCLUSIVAMENTE:
  1. Filas de idempotencia `IDEM#<imagen_key>` (estado 'listo') cuya id_medicion ya
     no existe como medición, en la tabla puntos-mediciones.
  2. Objetos S3 de 0 bytes cuya clave termina en "/" y es el marcador de una zona
     (`empresas/{e}/`) o de un punto (`empresas/{e}/{b}/`) que ya no existe.
Además rellena `idem_key` en las mediciones vivas que no lo tienen (se deduce de su
fila IDEM), para que al borrarlas también se borre su fila. Es solo un atributo
nuevo: no modifica ningún otro campo.
Nunca toca mediciones, objetos reales de S3, empresas, bloques ni usuarios.

Uso (el objetivo es siempre explícito; se verifica la cuenta AWS antes de leer):
  python scripts/limpiar_huerfanos.py --profile <perfil> --expected-account <id12> \
      --bucket <bucket> [--region us-east-1]            # simulación
  python scripts/limpiar_huerfanos.py ... --aplicar     # ejecuta
Códigos de salida: 0 = ok (también en simulación), 1 = error.
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Any

import boto3
from botocore.exceptions import ClientError

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import detectar_huerfanos as det  # noqa: E402

CAMPOS_MEDICIONES_LIMPIEZA = ("id_punto", "sk", "id_medicion", "estado", "idem_key")


def planificar(dynamodb_resource, s3_client, cfg: dict[str, str]) -> dict[str, list[dict[str, Any]]]:
    """Solo lectura: calcula qué se borraría y qué atributos se rellenarían."""
    empresas = det._scan_all(dynamodb_resource.Table(cfg["tabla_empresas"]), ("id_empresa",))
    bloques = det._scan_all(dynamodb_resource.Table(cfg["tabla_bloques"]), ("id_bloque",))
    items_pm = det._scan_all(dynamodb_resource.Table(cfg["tabla_mediciones"]), CAMPOS_MEDICIONES_LIMPIEZA)
    objetos = det._listar_objetos_s3(s3_client, cfg["bucket_name"])

    ids_empresas = {e["id_empresa"] for e in empresas if "id_empresa" in e}
    ids_bloques = {b["id_bloque"] for b in bloques if "id_bloque" in b}

    idem = det.idem_huerfanas(items_pm)

    marcadores = []
    for o in objetos:
        key, size = o.get("Key", ""), int(o.get("Size", 0))
        if size == 0 and det.marcador_huerfano(key, ids_empresas, ids_bloques):
            marcadores.append({"key": key})

    # Mediciones vivas sin idem_key cuya fila IDEM 'listo' las referencia.
    por_medicion = {
        str(it.get("id_medicion")): it for it in items_pm
        if str(it.get("id_punto", "")).startswith(det.PREFIJO_IDEM) and it.get("sk") == "IDEM"
        and it.get("estado") == "listo" and it.get("id_medicion")
    }
    backfill = []
    for it in items_pm:
        if not str(it.get("sk", "")).startswith("MED#") or it.get("idem_key"):
            continue
        fila = por_medicion.get(str(it.get("id_medicion")))
        if fila:
            backfill.append({"id_punto": it["id_punto"], "sk": it["sk"], "id_medicion": it.get("id_medicion"),
                             "idem_key": str(fila["id_punto"])[len(det.PREFIJO_IDEM):]})

    # Salvaguarda: sin ninguna zona ni punto, todo marcador parecería huérfano.
    if marcadores and not ids_empresas and not ids_bloques:
        raise RuntimeError("Las tablas empresas y bloques están vacías pero hay marcadores en S3: "
                           "se aborta por seguridad (¿tablas o bucket equivocados?)")

    return {"idem": idem, "marcadores": marcadores, "backfill": backfill}


def formatear_plan(plan: dict[str, list], aplicar: bool) -> str:
    cab = "APLICANDO" if aplicar else "SIMULACIÓN (no se escribe nada; usa --aplicar para ejecutar)"
    lineas = [f"=== Limpieza de huérfanos: {cab} ==="]
    lineas.append(f"Filas IDEM a borrar ({len(plan['idem'])}):")
    lineas += [f"  - {i['id_punto']}  (id_medicion={i['id_medicion'] or '-'})" for i in plan["idem"]]
    lineas.append(f"Marcadores S3 de 0 bytes a borrar ({len(plan['marcadores'])}):")
    lineas += [f"  - {m['key']}" for m in plan["marcadores"]]
    lineas.append(f"Mediciones vivas a las que se agregaría idem_key ({len(plan['backfill'])}):")
    lineas += [f"  - {b['id_punto']} / {b['id_medicion']}  <- {b['idem_key']}" for b in plan["backfill"]]
    return "\n".join(lineas)


def aplicar_plan(dynamodb_resource, s3_client, cfg: dict[str, str], plan: dict[str, list]) -> dict[str, int]:
    """Ejecuta el plan. Las filas IDEM se borran solo si siguen 'listo' con la misma
    id_medicion (no pisa un reclamo nuevo); el backfill solo si aún no hay idem_key."""
    tabla = dynamodb_resource.Table(cfg["tabla_mediciones"])
    hecho = {"idem": 0, "marcadores": 0, "backfill": 0, "omitidos": 0}

    for it in plan["backfill"]:
        try:
            tabla.update_item(
                Key={"id_punto": it["id_punto"], "sk": it["sk"]},
                UpdateExpression="SET idem_key = :k",
                ConditionExpression="attribute_exists(id_punto) AND attribute_not_exists(idem_key)",
                ExpressionAttributeValues={":k": it["idem_key"]},
            )
            hecho["backfill"] += 1
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise
            hecho["omitidos"] += 1

    for it in plan["idem"]:
        valores = {":l": "listo"}
        condicion = "estado = :l"
        if it["id_medicion"]:
            condicion += " AND id_medicion = :m"
            valores[":m"] = it["id_medicion"]
        try:
            tabla.delete_item(
                Key={"id_punto": it["id_punto"], "sk": "IDEM"},
                ConditionExpression=condicion,
                ExpressionAttributeValues=valores,
            )
            hecho["idem"] += 1
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise
            hecho["omitidos"] += 1

    for m in plan["marcadores"]:
        s3_client.delete_object(Bucket=cfg["bucket_name"], Key=m["key"])
        hecho["marcadores"] += 1
    return hecho


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Limpieza puntual de huérfanos de pf-corrosion (simulación por defecto)."
    )
    parser.add_argument("--region", default=det.DEFAULT_CONFIG["region"], help="Región AWS (por defecto REGION o us-east-1).")
    parser.add_argument("--profile", default=None, help="Perfil de AWS CLI a usar.")
    parser.add_argument("--expected-account", required=True, help="ID de cuenta AWS (12 dígitos) que se espera; si difiere, aborta.")
    parser.add_argument("--bucket", required=True, help="Bucket S3 de imágenes.")
    parser.add_argument("--aplicar", action="store_true", help="Ejecuta los borrados (sin esto solo simula).")
    try:
        args = parser.parse_args(argv)
    except SystemExit as e:
        return 0 if e.code in (0, None) else 1

    cfg = {**det.DEFAULT_CONFIG, "region": args.region, "bucket_name": args.bucket}
    try:
        session = boto3.Session(profile_name=args.profile, region_name=cfg["region"])
        det._verificar_cuenta(session, args.expected_account)
        ddb = session.resource("dynamodb", region_name=cfg["region"])
        s3 = session.client("s3", region_name=cfg["region"])
        plan = planificar(ddb, s3, cfg)
        print(formatear_plan(plan, args.aplicar))
        if args.aplicar:
            hecho = aplicar_plan(ddb, s3, cfg, plan)
            print(f"Hecho: {hecho['idem']} filas IDEM, {hecho['marcadores']} marcadores, "
                  f"{hecho['backfill']} idem_key rellenadas, {hecho['omitidos']} omitidas por cambio concurrente.")
    except Exception as e:  # noqa: BLE001 - cualquier fallo es exit 1
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
