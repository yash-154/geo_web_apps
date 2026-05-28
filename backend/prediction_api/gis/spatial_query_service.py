from django.db import connection
from .layer_service import LAYER_TABLE_MAP
import logging
import re


SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
logger = logging.getLogger(__name__)


def run_spatial_query(reference_layer, target_layer, normalize_func, operator="inside", distance=100, limit=2500):
    """
    Execute a spatial query between two layers.
    Supports various operators: inside, within, overlap, etc.
    Returns dict with count and GeoJSON features.
    """
    raw_reference_layer = reference_layer
    raw_target_layer = target_layer
    reference_layer = normalize_func(reference_layer)
    target_layer = normalize_func(target_layer)
    logger.info(
        "[SpatialQuery] request raw_reference=%r raw_target=%r resolved_reference=%r "
        "resolved_target=%r operator=%r distance=%r limit=%r",
        raw_reference_layer,
        raw_target_layer,
        reference_layer,
        target_layer,
        operator,
        distance,
        limit,
    )
    if reference_layer not in LAYER_TABLE_MAP or target_layer not in LAYER_TABLE_MAP:
        available = ", ".join(sorted(LAYER_TABLE_MAP.keys()))
        return {
            "error": (
                "Invalid reference or target layer. "
                f"Resolved reference='{reference_layer or ''}', target='{target_layer or ''}'. "
                f"Available layers: {available}."
            )
        }

    try:
        distance = float(distance)
    except (TypeError, ValueError):
        distance = 100.0
    distance = max(0.0, distance)

    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 500
    limit = max(1, min(500, limit))

    ref = LAYER_TABLE_MAP[reference_layer]
    tgt = LAYER_TABLE_MAP[target_layer]
    rs, rt = ref["schema"], ref["table"]
    ts, tt = tgt["schema"], tgt["table"]

    if operator == "inside":
        matched_sql = f"""
            SELECT t.*
            FROM "{ts}"."{tt}" t
            WHERE EXISTS (
              SELECT 1 FROM "{rs}"."{rt}" r
              WHERE t.geom && r.geom
                AND ST_Within(ST_PointOnSurface(t.geom), r.geom)
            )
        """
        params = []
    elif operator == "not_inside":
        matched_sql = f"""
            SELECT t.*
            FROM "{ts}"."{tt}" t
            WHERE NOT EXISTS (
              SELECT 1 FROM "{rs}"."{rt}" r
              WHERE t.geom && r.geom
                AND ST_Within(ST_PointOnSurface(t.geom), r.geom)
            )
        """
        params = []
    elif operator in {"within", "closest_within"}:
        if operator == "closest_within":
            matched_sql = f"""
                SELECT DISTINCT ON (candidate.id) candidate.*
                FROM "{rs}"."{rt}" r
                JOIN LATERAL (
                  SELECT t.*
                  FROM "{ts}"."{tt}" t
                  WHERE ST_DWithin(
                    ST_Transform(t.geom, 4326)::geography,
                    ST_Transform(r.geom, 4326)::geography,
                    %s
                  )
                  ORDER BY ST_Distance(
                    ST_Transform(t.geom, 4326)::geography,
                    ST_Transform(r.geom, 4326)::geography
                  )
                  LIMIT 1
                ) candidate ON TRUE
                ORDER BY candidate.id
            """
            params = [distance]
        else:
            matched_sql = f"""
                SELECT t.*
                FROM "{ts}"."{tt}" t
                WHERE EXISTS (
                  SELECT 1 FROM "{rs}"."{rt}" r
                  WHERE ST_DWithin(
                    ST_Transform(t.geom, 4326)::geography,
                    ST_Transform(r.geom, 4326)::geography,
                    %s
                  )
                )
            """
            params = [distance]
    elif operator == "not_within":
        matched_sql = f"""
            SELECT t.*
            FROM "{ts}"."{tt}" t
            WHERE NOT EXISTS (
              SELECT 1 FROM "{rs}"."{rt}" r
              WHERE ST_DWithin(
                ST_Transform(t.geom, 4326)::geography,
                ST_Transform(r.geom, 4326)::geography,
                %s
              )
            )
        """
        params = [distance]
    elif operator in {"touching_or_contained", "connected", "overlap_any"}:
        predicate = "ST_Intersects(t.geom, r.geom)"
        if operator == "touching_or_contained":
            predicate = "(ST_Touches(t.geom, r.geom) OR ST_Within(t.geom, r.geom) OR ST_Intersects(t.geom, r.geom))"
        matched_sql = f"""
            SELECT t.*
            FROM "{ts}"."{tt}" t
            WHERE EXISTS (
              SELECT 1 FROM "{rs}"."{rt}" r
              WHERE t.geom && r.geom
                AND {predicate}
            )
        """
        params = []
    elif operator in {"overlap_single", "overlap_multiple"}:
        comparator = "= 1" if operator == "overlap_single" else ">= 2"
        matched_sql = f"""
            SELECT t.*
            FROM "{ts}"."{tt}" t
            WHERE (
              SELECT COUNT(*)
              FROM "{rs}"."{rt}" r
              WHERE t.geom && r.geom
                AND ST_Intersects(t.geom, r.geom)
            ) {comparator}
        """
        params = []
    else:
        return {"error": "Unsupported spatial operator."}

    sql = f"""
        WITH matched AS (
          {matched_sql}
          LIMIT %s
        )
        SELECT
          (SELECT COUNT(*) FROM matched) AS total_count,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'type', 'Feature',
                  'geometry', ST_AsGeoJSON(ST_Transform(m.geom, 3857))::json,
                  'properties', (to_jsonb(m) - 'geom')
                )
              )
              FROM matched m
            ),
            '[]'::json
          ) AS features
    """
    try:
        with connection.cursor() as cursor:
            logger.info(
                "[SpatialQuery] executing reference=%s.%s target=%s.%s operator=%s params=%r limit=%s",
                rs,
                rt,
                ts,
                tt,
                operator,
                params,
                limit,
            )
            cursor.execute(sql, [*params, limit])
            row = cursor.fetchone()
    except Exception as err:
        logger.exception(
            "[SpatialQuery] failed reference=%s.%s target=%s.%s operator=%s params=%r limit=%s",
            rs,
            rt,
            ts,
            tt,
            operator,
            params,
            limit,
        )
        connection.close()
        err_text = str(err).strip()
        if not err_text and getattr(err, "__cause__", None):
            err_text = str(err.__cause__).strip()
        if not err_text:
            err_text = err.__class__.__name__
        return {"error": f"Spatial query failed: {err_text}"}

    total = int(row[0]) if row and row[0] is not None else 0
    features = row[1] if row and row[1] is not None else []
    logger.info("[SpatialQuery] success count=%s returned_features=%s", total, len(features))
    return {
        "count": total,
        "type": "FeatureCollection",
        "features": features,
    }
