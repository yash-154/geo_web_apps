from django.db import connection


# Layer to table mapping
LAYER_TABLE_MAP = {
    "roads": {
        "schema": "public",
        "table": "tbl_roads_pcmc"
    },
    "waterbody": {
        "schema": "public",
        "table": "tbl_rivers_pcmc"
    },
    "landuse": {
        "schema": "public",
        "table": "tbl_landuse"
    },
    "landmarks": {
        "schema": "public",
        "table": "tbl_landmarks"
    }
}


def layer_label(layer_key):
    """
    Get display label for a layer.
    Returns custom label from config or formatted layer key.
    """
    cfg = LAYER_TABLE_MAP.get(layer_key) or {}
    custom = str(cfg.get("label") or cfg.get("title") or "").strip()
    if custom:
        return custom
    return str(layer_key).replace("_", " ").title()


def list_available_layers():
    """
    Get list of all available layer keys.
    """
    return [key for key in LAYER_TABLE_MAP.keys() if isinstance(key, str) and key.strip()]


def available_layers_text():
    """
    Build a human-readable text of available layers.
    """
    keys = list_available_layers()
    if not keys:
        return "No layers are configured right now."
    labels = [layer_label(key) for key in keys]
    return "Available layers: " + ", ".join(labels) + "."


def list_distinct_type_values(layer_key, limit=250):
    """
    Get list of distinct type values for a layer.
    """
    layer_cfg = LAYER_TABLE_MAP.get(layer_key)
    if not layer_cfg:
        return []
    schema = layer_cfg["schema"]
    table = layer_cfg["table"]
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT DISTINCT TRIM(type::text) AS type_value
                FROM "{schema}"."{table}"
                WHERE NULLIF(TRIM(type::text), '') IS NOT NULL
                ORDER BY 1 ASC
                LIMIT %s
                """,
                [max(10, min(int(limit), 1000))],
            )
            rows = cursor.fetchall()
    except Exception:
        return []
    return [str(row[0]).strip() for row in rows if row and str(row[0]).strip()]


def resolve_layer_type_value(layer_key, raw_value, normalize_func):
    """
    Resolve a user-provided type value to an actual value in the database.
    Handles normalization and partial matches.
    """
    candidate = normalize_func(raw_value)
    if not candidate:
        return None

    values = list_distinct_type_values(layer_key)
    if not values:
        return None

    exact_by_lower = {v.lower(): v for v in values}
    if candidate in exact_by_lower:
        return exact_by_lower[candidate]

    normalized_pairs = [(normalize_func(v), v) for v in values]
    normalized_map = {norm: original for norm, original in normalized_pairs if norm}
    if candidate in normalized_map:
        return normalized_map[candidate]

    # Handle simple singular/plural mismatches.
    if candidate.endswith("s") and candidate[:-1] in normalized_map:
        return normalized_map[candidate[:-1]]
    if f"{candidate}s" in normalized_map:
        return normalized_map[f"{candidate}s"]

    # Fallback: token-level contains match (e.g., "major" for "major_road").
    for normalized, original in normalized_pairs:
        if not normalized:
            continue
        if candidate in normalized.split(" "):
            return original

    return None


def count_records_for_type(layer_key, type_value):
    """
    Count records in a layer with a specific type value.
    """
    layer_cfg = LAYER_TABLE_MAP.get(layer_key)
    if not layer_cfg or not type_value:
        return None
    schema = layer_cfg["schema"]
    table = layer_cfg["table"]
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT COUNT(*)
                FROM "{schema}"."{table}"
                WHERE LOWER(COALESCE(NULLIF(TRIM(type), ''), 'unknown')) = LOWER(%s)
                """,
                [type_value],
            )
            row = cursor.fetchone()
            return int(row[0]) if row else 0
    except Exception:
        return None
