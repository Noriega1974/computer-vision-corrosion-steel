#!/usr/bin/env python3
"""
pf-corrosion — Auditoría de integridad y detección de objetos/registros huérfanos.

100 % SOLO LECTURA: nunca ejecuta escrituras ni borrados en DynamoDB, S3 ni Cognito.
Cruza el estado entre:
  - Tablas DynamoDB: empresas, bloques, puntos-mediciones, usuarios
  - Bucket S3 de imágenes/resultados/logos/portadas
  - Cognito User Pool

Códigos de salida: 0 = sin hallazgos accionables, 2 = hay hallazgos, 1 = error.
Los estados intencionales (empresas desactivadas, filas METADATA de legado) se
reportan como informativos y no cuentan como hallazgo.

Uso (el objetivo es siempre explícito; se verifica la cuenta AWS antes de leer):
  python scripts/detectar_huerfanos.py --profile <perfil> --expected-account <id12> \
      --bucket <bucket> --user-pool-id <pool> [--region us-east-1] [--json]
  (--skip-s3 / --skip-cognito reemplazan a --bucket / --user-pool-id y lo avisan.)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

import boto3

DEFAULT_CONFIG = {
    "region": os.environ.get("REGION", "us-east-1"),
    "tabla_empresas": os.environ.get("TABLA_EMPRESAS", "pf-corrosion-empresas"),
    "tabla_bloques": os.environ.get("TABLA_BLOQUES", "pf-corrosion-bloques"),
    "tabla_mediciones": os.environ.get("TABLA_MEDICIONES", "pf-corrosion-puntos-mediciones"),
    "tabla_usuarios": os.environ.get("TABLA_USUARIOS", "pf-corrosion-usuarios"),
    # Bucket y user pool NO salen del entorno: deben pasarse explícitos (o
    # saltarse con --skip-s3 / --skip-cognito) para no auditar a medias en silencio.
    "bucket_name": "",
    "user_pool_id": "",
}

# Solo los campos que la auditoría usa (alias por si alguno es palabra reservada).
# `activa` es la ortografía vigente; `activo` es la de registros legados, por eso
# se aceptan ambas al decidir si una empresa está desactivada.
CAMPOS_EMPRESAS = ("id_empresa", "activa", "activo", "logo_key")
CAMPOS_BLOQUES = ("id_bloque", "empresa_id", "nombre", "portada_key")
CAMPOS_MEDICIONES = (
    "id_punto", "sk", "nombre", "id_medicion", "empresa_id",
    "s3_key_imagen", "s3_key_thumbnail", "s3_key_resultado",
)
CAMPOS_USUARIOS = (
    "id_usuario", "email", "rol", "es_colaborador", "empresa_id", "activo",
    "vence_en", "cognito_sub", "cognito_username",
)


def _scan_all(tabla, campos: tuple[str, ...] = ()) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    kwargs: dict[str, Any] = {}
    if campos:
        kwargs["ProjectionExpression"] = ", ".join(f"#p{i}" for i in range(len(campos)))
        kwargs["ExpressionAttributeNames"] = {f"#p{i}": c for i, c in enumerate(campos)}
    while True:
        resp = tabla.scan(**kwargs)
        items.extend(resp.get("Items", []))
        lek = resp.get("LastEvaluatedKey")
        if not lek:
            break
        kwargs["ExclusiveStartKey"] = lek
    return items


def _listar_objetos_s3(s3_client, bucket: str) -> list[dict[str, Any]]:
    if not bucket:
        return []
    objetos: list[dict[str, Any]] = []
    kwargs: dict[str, Any] = {"Bucket": bucket}
    while True:
        resp = s3_client.list_objects_v2(**kwargs)
        objetos.extend(resp.get("Contents", []))
        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")
        if not token:
            # A truncated page without a token would silently yield a partial
            # listing and false "orphan" / "broken reference" findings.
            raise RuntimeError("list_objects_v2 devolvió IsTruncated sin NextContinuationToken: listado de S3 incompleto")
        kwargs["ContinuationToken"] = token
    return objetos


def _listar_usuarios_cognito(cognito_client, user_pool_id: str) -> list[dict[str, Any]]:
    if not user_pool_id or cognito_client is None:
        return []
    usuarios: list[dict[str, Any]] = []
    kwargs: dict[str, Any] = {"UserPoolId": user_pool_id}
    while True:
        resp = cognito_client.list_users(**kwargs)
        usuarios.extend(resp.get("Users", []))
        token = resp.get("PaginationToken")
        if not token:
            break
        kwargs["PaginationToken"] = token
    return usuarios


def _extraer_attr_cognito(user: dict[str, Any], nombre: str) -> str:
    for attr in user.get("Attributes", []):
        if attr.get("Name") == nombre:
            return str(attr.get("Value", ""))
    return ""


def auditar_huerfanos(
    dynamodb_resource,
    s3_client,
    cognito_client=None,
    config: dict[str, str] | None = None,
    ahora: datetime | None = None,
) -> dict[str, Any]:
    """Ejecuta la auditoría de solo lectura y devuelve un diccionario estructurado."""
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    ahora_utc = ahora or datetime.now(timezone.utc)

    t_empresas = dynamodb_resource.Table(cfg["tabla_empresas"])
    t_bloques = dynamodb_resource.Table(cfg["tabla_bloques"])
    t_mediciones = dynamodb_resource.Table(cfg["tabla_mediciones"])
    t_usuarios = dynamodb_resource.Table(cfg["tabla_usuarios"])

    empresas = _scan_all(t_empresas, CAMPOS_EMPRESAS)
    bloques = _scan_all(t_bloques, CAMPOS_BLOQUES)
    items_pm = _scan_all(t_mediciones, CAMPOS_MEDICIONES)
    usuarios_ddb = _scan_all(t_usuarios, CAMPOS_USUARIOS)

    empresas_por_id = {e["id_empresa"]: e for e in empresas if "id_empresa" in e}
    bloques_por_id = {b["id_bloque"]: b for b in bloques if "id_bloque" in b}

    # 1. Bloques sin empresa o en empresa inactiva
    bloques_sin_empresa = []
    bloques_empresa_inactiva = []
    for b in bloques:
        bid = b.get("id_bloque", "")
        emp_id = b.get("empresa_id", "")
        if not emp_id or emp_id not in empresas_por_id:
            bloques_sin_empresa.append({
                "id_bloque": bid,
                "nombre": b.get("nombre", ""),
                "empresa_id": emp_id,
            })
        else:
            emp = empresas_por_id[emp_id]
            if emp.get("activa") is False or emp.get("activo") is False:
                bloques_empresa_inactiva.append({
                    "id_bloque": bid,
                    "nombre": b.get("nombre", ""),
                    "empresa_id": emp_id,
                })

    # 2. Mediciones huérfanas, discordantes o filas METADATA de legado
    mediciones_sin_bloque = []
    mediciones_empresa_discordante = []
    items_metadata_legado = []

    for it in items_pm:
        id_punto = it.get("id_punto", "")
        sk = str(it.get("sk", ""))
        if sk == "METADATA":
            items_metadata_legado.append({
                "id_punto": id_punto,
                "sk": sk,
                "nombre": it.get("nombre", ""),
            })
            continue
        if not sk.startswith("MED#"):
            continue
        id_med = it.get("id_medicion", sk)
        bloque = bloques_por_id.get(id_punto)
        if not bloque:
            mediciones_sin_bloque.append({
                "id_punto": id_punto,
                "id_medicion": id_med,
                "sk": sk,
                "empresa_id": it.get("empresa_id", ""),
            })
        else:
            emp_med = it.get("empresa_id", "")
            emp_blq = bloque.get("empresa_id", "")
            if emp_med and emp_blq and emp_med != emp_blq:
                mediciones_empresa_discordante.append({
                    "id_punto": id_punto,
                    "id_medicion": id_med,
                    "empresa_medicion": emp_med,
                    "empresa_bloque": emp_blq,
                })

    # 3. Usuarios sin empresa válida o estado discordante con Cognito / expiración
    usuarios_sin_empresa = []
    usuarios_ddb_sin_cognito = []
    usuarios_estado_discordante = []

    usuarios_cognito = _listar_usuarios_cognito(cognito_client, cfg.get("user_pool_id", ""))
    cognito_por_username: dict[str, dict[str, Any]] = {}
    cognito_por_sub: dict[str, dict[str, Any]] = {}
    cognito_por_email: dict[str, dict[str, Any]] = {}

    for cu in usuarios_cognito:
        uname = cu.get("Username", "")
        sub = _extraer_attr_cognito(cu, "sub")
        email = _extraer_attr_cognito(cu, "email").lower()
        if uname:
            cognito_por_username[uname.lower()] = cu
        if sub:
            cognito_por_sub[sub] = cu
        if email:
            cognito_por_email[email] = cu

    cognito_emparejados: set[str] = set()

    for u in usuarios_ddb:
        uid = u.get("id_usuario", "")
        rol = u.get("rol", "")
        emp_id = u.get("empresa_id", "")
        es_colab = bool(u.get("es_colaborador"))

        if rol != "super_admin":
            if not emp_id or emp_id not in empresas_por_id:
                usuarios_sin_empresa.append({
                    "id_usuario": uid,
                    "email": u.get("email", ""),
                    "rol": rol,
                    "es_colaborador": es_colab,
                    "empresa_id": emp_id,
                })

        # Verificar vencimiento (`vence_en`) de colaborador activo
        activo_ddb = u.get("activo", True) is not False
        vence_en = u.get("vence_en")
        if es_colab and activo_ddb and vence_en not in (None, ""):
            dt_exp = None
            if isinstance(vence_en, str):
                try:
                    dt_exp = datetime.fromisoformat(vence_en.replace("Z", "+00:00"))
                    if dt_exp.tzinfo is None:
                        dt_exp = dt_exp.replace(tzinfo=timezone.utc)
                except ValueError:
                    dt_exp = None
            if dt_exp is None:
                # Non-string (Decimal/number) or unparseable: the expiry cannot be
                # evaluated, so surface it instead of crashing or skipping it.
                usuarios_estado_discordante.append({
                    "id_usuario": uid,
                    "motivo": "vence_en_invalido",
                    "vence_en": str(vence_en),
                })
            elif dt_exp <= ahora_utc:
                usuarios_estado_discordante.append({
                    "id_usuario": uid,
                    "motivo": "colaborador_expirado_sigue_activo",
                    "vence_en": vence_en,
                })

        if cognito_client is not None and cfg.get("user_pool_id"):
            sub_ddb = u.get("cognito_sub", "")
            uname_ddb = str(u.get("cognito_username") or u.get("email") or "").lower()
            email_ddb = str(u.get("email", "")).lower()

            cu = (
                (cognito_por_sub.get(sub_ddb) if sub_ddb else None)
                or (cognito_por_username.get(uname_ddb) if uname_ddb else None)
                or (cognito_por_email.get(email_ddb) if email_ddb else None)
            )
            if not cu:
                usuarios_ddb_sin_cognito.append({
                    "id_usuario": uid,
                    "email": u.get("email", ""),
                    "cognito_sub": sub_ddb,
                })
            else:
                cognito_emparejados.add(cu.get("Username", ""))
                enabled_cog = bool(cu.get("Enabled", True))
                if activo_ddb != enabled_cog:
                    usuarios_estado_discordante.append({
                        "id_usuario": uid,
                        "email": u.get("email", ""),
                        "motivo": "activo_ddb_difiere_de_cognito_enabled",
                        "activo_ddb": activo_ddb,
                        "cognito_enabled": enabled_cog,
                    })

    cognito_sin_usuario_ddb = []
    for cu in usuarios_cognito:
        uname = cu.get("Username", "")
        if uname not in cognito_emparejados:
            cognito_sin_usuario_ddb.append({
                "username": uname,
                "sub": _extraer_attr_cognito(cu, "sub"),
                "email": _extraer_attr_cognito(cu, "email"),
                "enabled": bool(cu.get("Enabled", True)),
            })

    # 4. S3: referencias desde DynamoDB vs objetos reales en el bucket
    claves_referenciadas: dict[str, str] = {}
    for e in empresas:
        lk = e.get("logo_key")
        if lk:
            claves_referenciadas[lk] = f"empresa:{e.get('id_empresa', '')}"
    for b in bloques:
        pk = b.get("portada_key")
        if pk:
            claves_referenciadas[pk] = f"bloque:{b.get('id_bloque', '')}"
    for it in items_pm:
        if not str(it.get("sk", "")).startswith("MED#"):
            continue
        origen = f"medicion:{it.get('id_punto', '')}/{it.get('id_medicion', '')}"
        for campo in ("s3_key_imagen", "s3_key_thumbnail", "s3_key_resultado"):
            k = it.get(campo)
            if k:
                claves_referenciadas[k] = origen

    objetos_s3 = _listar_objetos_s3(s3_client, cfg.get("bucket_name", ""))
    claves_en_s3: set[str] = set()

    archivos_huerfanos = []
    marcadores_carpeta = []
    subidas_temporales = []

    for obj in objetos_s3:
        key = obj.get("Key", "")
        size = int(obj.get("Size", 0))
        claves_en_s3.add(key)

        if key in claves_referenciadas:
            continue

        if key.endswith("/") and size == 0:
            marcadores_carpeta.append({"key": key, "size": size})
        elif key.startswith("uploads/"):
            subidas_temporales.append({"key": key, "size": size})
        else:
            archivos_huerfanos.append({"key": key, "size": size})

    referencias_s3_rotas = []
    if cfg.get("bucket_name"):
        for key, origen in sorted(claves_referenciadas.items()):
            if key not in claves_en_s3:
                referencias_s3_rotas.append({"key": key, "origen": origen})

    # Informativos: estados intencionales (empresa desactivada = borrado lógico,
    # filas METADATA de legado). No son hallazgos accionables.
    total_informativos = len(bloques_empresa_inactiva) + len(items_metadata_legado)
    total_hallazgos = (
        len(bloques_sin_empresa)
        + len(mediciones_sin_bloque)
        + len(mediciones_empresa_discordante)
        + len(usuarios_sin_empresa)
        + len(usuarios_ddb_sin_cognito)
        + len(cognito_sin_usuario_ddb)
        + len(usuarios_estado_discordante)
        + len(archivos_huerfanos)
        + len(referencias_s3_rotas)
    )

    return {
        "resumen": {
            "total_empresas": len(empresas),
            "total_bloques": len(bloques),
            "total_items_puntos_mediciones": len(items_pm),
            "total_usuarios_ddb": len(usuarios_ddb),
            "total_usuarios_cognito": len(usuarios_cognito),
            "total_objetos_s3": len(objetos_s3),
            "total_hallazgos": total_hallazgos,
            "total_informativos": total_informativos,
        },
        "bloques_sin_empresa": bloques_sin_empresa,
        "bloques_empresa_inactiva": bloques_empresa_inactiva,
        "mediciones_sin_bloque": mediciones_sin_bloque,
        "mediciones_empresa_discordante": mediciones_empresa_discordante,
        "items_metadata_legado": items_metadata_legado,
        "usuarios_sin_empresa": usuarios_sin_empresa,
        "usuarios_ddb_sin_cognito": usuarios_ddb_sin_cognito,
        "cognito_sin_usuario_ddb": cognito_sin_usuario_ddb,
        "usuarios_estado_discordante": usuarios_estado_discordante,
        "s3_huerfanos": {
            "archivos_huerfanos": archivos_huerfanos,
            "marcadores_carpeta": marcadores_carpeta,
            "subidas_temporales": subidas_temporales,
        },
        "referencias_s3_rotas": referencias_s3_rotas,
    }


def formatear_reporte_humano(reporte: dict[str, Any]) -> str:
    r = reporte["resumen"]
    lineas = [
        "=== Auditoría de integridad y huérfanos (SOLO LECTURA) ===",
        f"Empresas: {r['total_empresas']} | Bloques: {r['total_bloques']} | "
        f"Ítems PM: {r['total_items_puntos_mediciones']} | Usuarios DDB: {r['total_usuarios_ddb']} | "
        f"Usuarios Cognito: {r['total_usuarios_cognito']} | Objetos S3: {r['total_objetos_s3']}",
        f"Total hallazgos accionables: {r['total_hallazgos']} "
        f"(informativos, no cuentan: {r.get('total_informativos', 0)})",
        "Nota: los marcadores de carpeta S3 y las subidas temporales (uploads/) son informativos "
        "y NO entran en el total accionable.",
        "",
        f"- Bloques sin empresa válida: {len(reporte['bloques_sin_empresa'])}",
        f"- Mediciones sin bloque padre: {len(reporte['mediciones_sin_bloque'])}",
        f"- Mediciones con empresa discordante: {len(reporte['mediciones_empresa_discordante'])}",
        f"- Usuarios sin empresa válida: {len(reporte['usuarios_sin_empresa'])}",
        f"- Usuarios en DDB sin Cognito: {len(reporte['usuarios_ddb_sin_cognito'])}",
        f"- Usuarios en Cognito sin DDB: {len(reporte['cognito_sin_usuario_ddb'])}",
        f"- Usuarios con estado discordante: {len(reporte['usuarios_estado_discordante'])}",
        f"- Archivos S3 huérfanos: {len(reporte['s3_huerfanos']['archivos_huerfanos'])}",
        f"- [informativo] Marcadores de carpeta S3 (0 B): {len(reporte['s3_huerfanos']['marcadores_carpeta'])}",
        f"- [informativo] Subidas temporales en S3 (uploads/): {len(reporte['s3_huerfanos']['subidas_temporales'])}",
        f"- Referencias S3 rotas en DynamoDB: {len(reporte['referencias_s3_rotas'])}",
        "",
        "Informativos (estado intencional, no son hallazgos):",
        f"- Bloques en empresa inactiva (borrado lógico): {len(reporte['bloques_empresa_inactiva'])}",
        f"- Filas METADATA de legado en puntos-mediciones: {len(reporte['items_metadata_legado'])}",
    ]
    return "\n".join(lineas)


def _verificar_cuenta(session, esperada: str) -> str:
    """Consulta sts:GetCallerIdentity (solo lectura) y aborta si la cuenta no es la esperada."""
    cuenta = str(session.client("sts").get_caller_identity()["Account"])
    print(f"Cuenta AWS: {cuenta}", file=sys.stderr)
    if cuenta != esperada:
        raise RuntimeError(f"La cuenta AWS activa ({cuenta}) no coincide con --expected-account ({esperada}). Abortando sin leer nada.")
    return cuenta


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Auditoría de solo lectura para detectar registros y objetos huérfanos en pf-corrosion."
    )
    parser.add_argument("--json", action="store_true", help="Imprime el reporte completo en formato JSON.")
    parser.add_argument("--region", default=DEFAULT_CONFIG["region"], help="Región AWS (por defecto la variable de entorno REGION, o us-east-1 si no está definida).")
    parser.add_argument("--profile", default=None, help="Perfil de AWS CLI a usar.")
    parser.add_argument("--expected-account", required=True, help="ID de cuenta AWS (12 dígitos) que se espera; si difiere, aborta.")
    parser.add_argument("--bucket", default="", help="Nombre del bucket S3 a auditar (o use --skip-s3).")
    parser.add_argument("--user-pool-id", default="", help="ID del User Pool de Cognito (o use --skip-cognito).")
    parser.add_argument("--skip-s3", action="store_true", help="No auditar S3 (se avisa en la salida).")
    parser.add_argument("--skip-cognito", action="store_true", help="No auditar Cognito (se avisa en la salida).")
    try:
        args = parser.parse_args(argv)
    except SystemExit as e:
        return 0 if e.code in (0, None) else 1  # uso incorrecto = error (1), no hallazgos (2)

    if not args.bucket and not args.skip_s3:
        print("ERROR: indica --bucket <nombre> o --skip-s3 explícitamente.", file=sys.stderr)
        return 1
    if not args.user_pool_id and not args.skip_cognito:
        print("ERROR: indica --user-pool-id <id> o --skip-cognito explícitamente.", file=sys.stderr)
        return 1

    cfg = {
        **DEFAULT_CONFIG,
        "region": args.region,
        "bucket_name": "" if args.skip_s3 else args.bucket,
        "user_pool_id": "" if args.skip_cognito else args.user_pool_id,
    }

    try:
        session = boto3.Session(profile_name=args.profile, region_name=cfg["region"])
        _verificar_cuenta(session, args.expected_account)
        if args.skip_s3:
            print("*** SKIPPED: auditoría de S3 omitida (--skip-s3): huérfanos y referencias rotas NO verificados ***", file=sys.stderr)
        if args.skip_cognito:
            print("*** SKIPPED: auditoría de Cognito omitida (--skip-cognito): usuarios DDB/Cognito NO cruzados ***", file=sys.stderr)

        ddb = session.resource("dynamodb", region_name=cfg["region"])
        s3 = None if args.skip_s3 else session.client("s3", region_name=cfg["region"])
        cog = None if args.skip_cognito else session.client("cognito-idp", region_name=cfg["region"])

        reporte = auditar_huerfanos(ddb, s3, cog, cfg)
    except Exception as e:  # noqa: BLE001 - cualquier fallo es exit 1
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(reporte, ensure_ascii=False, indent=2))
    else:
        print(formatear_reporte_humano(reporte))
    return 2 if reporte["resumen"]["total_hallazgos"] else 0


if __name__ == "__main__":
    sys.exit(main())
