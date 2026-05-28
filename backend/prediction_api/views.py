import os
from datetime import datetime
import json
import mimetypes
import re
import shutil
import zipfile
import subprocess
import struct
import uuid
import zlib
import requests
import shapefile
import urllib3
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.db import connection
from django.db.utils import ProgrammingError, OperationalError
from django.http import FileResponse, Http404, HttpResponse
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt

from .models import SharedStyleConfig

# Import from services
from .services.chat_service import build_chat_messages
from .services.ollama_service import (
    call_ollama_chat,
    get_ollama_model_candidates,
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
)
from .utils.text_utils import (
    normalize_layer_name,
    normalize_type_phrase,
    local_greeting_answer,
    local_tool_help_answer,
)
from .utils.regex_utils import (
    extract_show_layer_request,
    extract_roads_type_filter_request,
)
from .services.intent_service import wants_available_layers
from .gis.layer_service import (
    LAYER_TABLE_MAP,
    layer_label,
    list_available_layers,
    available_layers_text,
    resolve_layer_type_value,
    count_records_for_type,
)
from .gis.spatial_query_service import (
    run_spatial_query,
    SAFE_IDENTIFIER,
)

# Suppress SSL warnings for Bhuvan (self-signed cert)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Create a persistent session for better performance
_bhuvan_session = requests.Session()
_bhuvan_session.verify = False
_bhuvan_session.timeout = 30

# Separate session for Bhuvan LULC stats API (keeps headers and timeout consistent)
_bhuvan_stats_session = requests.Session()
_bhuvan_stats_session.timeout = 30

# Separate session for Bhuvan routing API
_bhuvan_route_session = requests.Session()
_bhuvan_route_session.timeout = 30

# Cache transparent PNG tiles by (width, height)
_TRANSPARENT_TILE_CACHE = {}
_STYLE_FALLBACK_FILE = os.path.join(getattr(settings, "BASE_DIR", os.getcwd()), "style_config_fallback.json")
_OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
_OVERPASS_ENDPOINTS.extend(
    [
        endpoint.strip()
        for endpoint in (os.getenv("OVERPASS_ENDPOINTS", "")).split(",")
        if endpoint.strip()
    ]
)
_OSM_DATASETS = {
    "roads": 'way["highway"]',
    "buildings": 'way["building"]',
    "amenities": 'node["amenity"];way["amenity"]',
    "water": 'way["waterway"];way["natural"="water"];way["landuse"="reservoir"]',
    "green": 'way["leisure"="park"];way["landuse"="grass"];way["landuse"="forest"]',
}
_SHAPEFILE_EXTENSIONS = {".shp", ".shx", ".dbf", ".prj", ".cpg", ".qpj", ".zip"}
_THREE_D_REGISTRY_FILE = "layers.json"
_HEIGHT_FIELD_HINTS = ("height", "hgt", "b_height", "b_height_m", "elevation")
_DEPTH_FIELD_HINTS = ("depth", "dep", "invert", "bottom", "altitude", "z")
_DIAMETER_FIELD_HINTS = ("diameter", "dia", "diam", "width", "radius")


def _three_d_root():
    root = Path(getattr(settings, "THREE_D_TILES_ROOT", Path(settings.BASE_DIR) / "media_3d_tiles"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def _three_d_registry_path():
    return _three_d_root() / _THREE_D_REGISTRY_FILE


def _load_three_d_registry():
    registry_path = _three_d_registry_path()
    if not registry_path.exists():
        return []
    try:
        data = json.loads(registry_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return data if isinstance(data, list) else []


def _save_three_d_registry(items):
    registry_path = _three_d_registry_path()
    registry_path.write_text(json.dumps(items, indent=2), encoding="utf-8")


def _safe_display_name(value, fallback):
    cleaned = re.sub(r"\s+", " ", str(value or "").strip())
    return cleaned[:80] or fallback


def _safe_file_name(value):
    name = os.path.basename(str(value or ""))
    stem, ext = os.path.splitext(name)
    safe_stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", stem).strip("._") or "layer"
    return f"{safe_stem[:80]}{ext.lower()}"


def _build_three_d_tile_url(request, layer_id, relative_path="tileset.json"):
    relative_path = str(relative_path).replace("\\", "/").lstrip("/")
    return request.build_absolute_uri(
        f"{getattr(settings, 'THREE_D_TILES_URL', '/api/3d-tiles/files/')}{layer_id}/{relative_path}"
    )


def _three_d_response_item(request, item):
    payload = dict(item)
    payload["url"] = _build_three_d_tile_url(request, payload["id"])
    return payload


def _pick_field(fields, hints):
    lower_fields = [(field.lower(), field) for field in fields]
    for hint in hints:
        for lower_field, field in lower_fields:
            if lower_field == hint or hint in lower_field:
                return field
    return ""


def _read_shapefile_fields(dbf_path):
    try:
        reader = shapefile.Reader(dbf=str(dbf_path))
        return [
            field[0]
            for field in reader.fields[1:]
            if field and field[0] and field[0] != "DeletionFlag"
        ]
    except Exception:
        return []


@csrf_exempt
@api_view(["GET", "POST"])
def chat_assistant(request):
    if request.method == "GET":
        return Response({
            "message": "Use POST /api/chat/ with JSON: {question, messages, max_tokens}.",
            "ok": True,
        })

    payload = request.data if isinstance(request.data, dict) else {}
    question = str(payload.get("question") or "").strip()
    messages = payload.get("messages") if isinstance(payload.get("messages"), list) else []
    max_tokens = payload.get("max_tokens", 280)

    if not question:
        return Response({"error": "question is required."}, status=400)

    try:
        max_tokens = int(max_tokens)
    except (TypeError, ValueError):
        max_tokens = 280
    max_tokens = max(40, min(700, max_tokens))

    greeting_answer = local_greeting_answer(question, layer_label, list_available_layers)
    if greeting_answer:
        return Response({
            "answer": greeting_answer,
            "model": "local",
        })

    tool_help = local_tool_help_answer(question)
    if tool_help:
        return Response({
            "answer": tool_help,
            "model": "local",
        })

    # Resolve deployment-specific layer queries locally so responses always reflect
    # currently configured layers instead of model guesses.
    if wants_available_layers(question):
        return Response({
            "answer": available_layers_text(),
            "model": "local",
        })

    # Helper function to resolve roads type filter
    def resolve_roads_type(raw_value):
        return resolve_layer_type_value("roads", raw_value, normalize_type_phrase)

    # Provide extra context to the LLM when the user is asking about roads type filters.
    # This allows the model to summarize results while still returning a map action.
    chat_action = None
    extra_system_message = None

    road_type_filter = extract_roads_type_filter_request(question, resolve_roads_type)
    if road_type_filter:
        count = count_records_for_type("roads", road_type_filter)
        count_text = "an unknown number of" if count is None else str(count)
        extra_system_message = (
            f"The dataset contains {count_text} roads of type '{road_type_filter}'. "
            "When answering, provide a brief summary and suggest what the user can do next."
        )
        chat_action = {
            "type": "show_layer_with_filter",
            "layer": "roads",
            "filter": {
                "field": "type",
                "value": road_type_filter,
            },
        }

    requested_raw, requested_layer = extract_show_layer_request(question, normalize_layer_name)
    if requested_raw:
        if requested_layer:
            # Detect 'with name ...' patterns so we can apply a map filter on the layer.
            name_match = re.search(r"\b(?:with\s+name|named)\s+['\"]?([\w\s\-]+?)['\"]?(?:\s|$)", question, flags=re.IGNORECASE)
            if name_match:
                name_value = name_match.group(1).strip()
                return Response({
                    "answer": f"Showing {layer_label(requested_layer)} with name '{name_value}' on map.",
                    "model": "local",
                    "action": {
                        "type": "show_layer_with_filter",
                        "layer": requested_layer,
                        "filter": {
                            "field": "name",
                            "value": name_value,
                        },
                    },
                })

            return Response({
                "answer": f"Showing {layer_label(requested_layer)} on map.",
                "model": "local",
                "action": {
                    "type": "show_layer",
                    "layer": requested_layer,
                },
            })
        return Response({
            "answer": f"Layer '{requested_raw}' is not available. {available_layers_text()}",
            "model": "local",
        })

    chat_messages = build_chat_messages(messages, question, extra_system_message)

    def _chat_response_payload(answer, model, extra=None):
        payload = {"answer": answer, "model": model}
        if chat_action:
            payload["action"] = chat_action
        if extra:
            payload.update(extra)
        return payload

    # Chat is configured to run on local Ollama for this deployment.
    provider = "ollama"

    ollama_error = None
    if provider in {"ollama", "auto"}:
        o_resp = None
        o_req_err = None
        o_used_model = OLLAMA_MODEL
        for model_name in get_ollama_model_candidates(OLLAMA_MODEL):
            o_used_model = model_name
            o_resp, o_req_err = call_ollama_chat(
                base_url=OLLAMA_BASE_URL,
                model=model_name,
                messages=chat_messages,
                max_tokens=max_tokens,
            )
            if o_resp is None:
                continue
            if o_resp.ok:
                break
            # Retry model-not-found style failures against variant names.
            if o_resp.status_code == 404:
                continue
            break
        if o_resp is None:
            ollama_error = f"Ollama request failed: {str(o_req_err) if o_req_err else 'Unknown network error'}"
        elif not o_resp.ok:
            ollama_error = f"Ollama request failed ({o_resp.status_code})."
            if provider == "ollama":
                return Response(
                    _chat_response_payload(
                        "The language model service is temporarily unavailable. Please try again shortly.",
                        "fallback",
                        {
                            "upstream_error": ollama_error,
                            "details": (o_resp.text or "").strip()[:300],
                        },
                    ),
                    status=200,
                )
        else:
            try:
                o_data = o_resp.json()
            except ValueError:
                o_data = None
            if isinstance(o_data, dict):
                message = o_data.get("message") if isinstance(o_data.get("message"), dict) else {}
                answer = str(message.get("content") or "").strip()
                if answer:
                    return Response(
                        _chat_response_payload(answer, f"ollama:{o_used_model}"),
                        status=200,
                    )
            if provider == "ollama":
                return Response(
                    _chat_response_payload(
                        "I received an unexpected model response. Please try again.",
                        "fallback",
                        {
                            "upstream_error": "Ollama returned an unexpected payload shape.",
                            "details": str(type(o_data).__name__),
                        },
                    ),
                    status=200,
                )

    if provider == "ollama":
        return Response(
            _chat_response_payload(
                "I could not reach the language model right now. Please try again.",
                "fallback",
                {"upstream_error": ollama_error or "Ollama request failed."},
            ),
            status=200,
        )

def _style_default_payload():
    return {
        'named_styles': [],
        'layer_styles': {},
        'layer_style_selections': {},
    }


def _style_payload_from_request(request):
    payload = request.data if isinstance(request.data, dict) else {}
    named_styles = payload.get('named_styles')
    layer_styles = payload.get('layer_styles')
    layer_style_selections = payload.get('layer_style_selections')

    updates = {}
    if named_styles is not None:
        if not isinstance(named_styles, list):
            return None, Response({'error': 'named_styles must be a list.'}, status=400)
        updates['named_styles'] = named_styles
    if layer_styles is not None:
        if not isinstance(layer_styles, dict):
            return None, Response({'error': 'layer_styles must be an object.'}, status=400)
        updates['layer_styles'] = layer_styles
    if layer_style_selections is not None:
        if not isinstance(layer_style_selections, dict):
            return None, Response({'error': 'layer_style_selections must be an object.'}, status=400)
        updates['layer_style_selections'] = layer_style_selections
    return updates, None


def _load_style_fallback():
    data = _style_default_payload()
    if not os.path.exists(_STYLE_FALLBACK_FILE):
        return data
    try:
        with open(_STYLE_FALLBACK_FILE, 'r', encoding='utf-8') as fh:
            raw = json.load(fh)
        if isinstance(raw, dict):
            if isinstance(raw.get('named_styles'), list):
                data['named_styles'] = raw['named_styles']
            if isinstance(raw.get('layer_styles'), dict):
                data['layer_styles'] = raw['layer_styles']
            if isinstance(raw.get('layer_style_selections'), dict):
                data['layer_style_selections'] = raw['layer_style_selections']
    except Exception:
        pass
    return data


def _save_style_fallback(data):
    with open(_STYLE_FALLBACK_FILE, 'w', encoding='utf-8') as fh:
        json.dump(data, fh)


@csrf_exempt
@api_view(['POST'])
def analysis_buffer(request):
    """
    Build a true geometric buffer using PostGIS and return geometry in GeoJSON.
    Input geometry is expected as WKT in input_srid (default EPSG:3857).
    Distance is in meters.
    """
    payload = request.data if isinstance(request.data, dict) else {}
    wkt = (payload.get('wkt') or '').strip()
    if not wkt:
        return Response({'error': 'wkt is required.'}, status=400)

    try:
        distance = float(payload.get('distance', 0))
    except (TypeError, ValueError):
        return Response({'error': 'distance must be a number.'}, status=400)
    if distance <= 0:
        return Response({'error': 'distance must be > 0.'}, status=400)

    try:
        input_srid = int(payload.get('input_srid', 3857))
    except (TypeError, ValueError):
        return Response({'error': 'input_srid must be an integer.'}, status=400)

    try:
        output_srid = int(payload.get('output_srid', 3857))
    except (TypeError, ValueError):
        return Response({'error': 'output_srid must be an integer.'}, status=400)

    sql = """
        WITH src AS (
            SELECT ST_Transform(ST_GeomFromText(%s, %s), 4326) AS g4326
        ),
        buf AS (
            SELECT ST_Transform(ST_Buffer(g4326::geography, %s)::geometry, %s) AS g
            FROM src
        )
        SELECT ST_AsText(g), ST_AsGeoJSON(g)
        FROM buf
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, [wkt, input_srid, distance, output_srid])
            row = cursor.fetchone()
    except Exception as err:
        return Response({'error': f'Buffer computation failed: {str(err)}'}, status=500)

    if not row or not row[1]:
        return Response({'error': 'Failed to generate buffer geometry.'}, status=500)

    try:
        geometry = json.loads(row[1])
    except Exception:
        return Response({'error': 'Invalid buffer geometry response.'}, status=500)

    return Response({
        'wkt': row[0],
        'geometry': geometry,
        'distance': distance,
        'input_srid': input_srid,
        'output_srid': output_srid,
    })

def _make_transparent_png(width, height):
    """
    Create a transparent RGBA PNG of the given size using only stdlib.
    """
    if width <= 0 or height <= 0:
        width, height = 1, 1

    cache_key = (width, height)
    cached = _TRANSPARENT_TILE_CACHE.get(cache_key)
    if cached:
        return cached

    # PNG signature
    png = bytearray(b"\x89PNG\r\n\x1a\n")

    def _chunk(chunk_type, data):
        png.extend(struct.pack("!I", len(data)))
        png.extend(chunk_type)
        png.extend(data)
        crc = zlib.crc32(chunk_type)
        crc = zlib.crc32(data, crc)
        png.extend(struct.pack("!I", crc & 0xffffffff))

    # IHDR
    ihdr = struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)
    _chunk(b"IHDR", ihdr)

    # IDAT (no filter, fully transparent)
    row = b"\x00" + (b"\x00" * (width * 4))
    raw = row * height
    compressed = zlib.compress(raw, level=6)
    _chunk(b"IDAT", compressed)

    # IEND
    _chunk(b"IEND", b"")

    data = bytes(png)
    _TRANSPARENT_TILE_CACHE[cache_key] = data
    return data

def _get_request_type(request):
    return (request.GET.get("REQUEST") or request.GET.get("request") or "").upper()

def _get_tile_size(request, default=256):
    try:
        width = int(request.GET.get("WIDTH", default))
    except (TypeError, ValueError):
        width = default
    try:
        height = int(request.GET.get("HEIGHT", default))
    except (TypeError, ValueError):
        height = default

    # Clamp to a reasonable range to avoid huge allocations
    width = max(1, min(4096, width))
    height = max(1, min(4096, height))
    return width, height

def _transparent_tile_response(request, upstream_status=None):
    width, height = _get_tile_size(request)
    transparent_tile = _make_transparent_png(width, height)
    http_response = HttpResponse(transparent_tile, content_type="image/png", status=200)
    if upstream_status is not None:
        http_response["X-Proxy-WMS-Error"] = f"Bhuvan {upstream_status}"
    return http_response


@csrf_exempt
@api_view(['POST'])
def analysis_spatial_query(request):
    payload = request.data if isinstance(request.data, dict) else {}
    reference_layer = payload.get('reference_layer')
    target_layer = payload.get('target_layer')
    operator = payload.get('operator', 'inside')
    distance = payload.get('distance', 100)
    limit = payload.get('limit', 2500)

    if not reference_layer or not target_layer:
        return Response({'error': 'reference_layer and target_layer are required.'}, status=400)

    result = run_spatial_query(
        reference_layer=reference_layer,
        target_layer=target_layer,
        normalize_func=normalize_layer_name,
        operator=operator,
        distance=distance,
        limit=limit,
    )
    if result.get("error"):
        status_code = 500 if str(result["error"]).startswith("Spatial query failed:") else 400
        return Response({'error': result["error"]}, status=status_code)
    return Response(result)


@api_view(['GET'])
def layer_attributes(request):
    layer = request.GET.get('layer')
    limit = int(request.GET.get('limit', 50))
    cql = request.GET.get('cql')

    # ✅ Graceful handling for unsupported layers
    if layer not in LAYER_TABLE_MAP:
        return Response({
            "columns": [],
            "rows": [],
            "message": "Data not available for this layer"
        }, status=200)

    schema = LAYER_TABLE_MAP[layer]["schema"]
    table = LAYER_TABLE_MAP[layer]["table"]

    where_clause = ""
    params = [schema, table]

    if cql:
        where_clause = f"WHERE {cql}"

    params.append(limit)

    sql = f"""
        SELECT json_build_object(
            'columns', (
                SELECT array_agg(column_name)
                FROM information_schema.columns
                WHERE table_schema = %s
                  AND table_name = %s
            ),
            'rows', COALESCE((
                SELECT json_agg(t)
                FROM (
                    SELECT *
                    FROM "{schema}"."{table}"
                    {where_clause}
                    LIMIT %s
                ) t
            ), '[]'::json)
        )
    """

    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        result = cursor.fetchone()[0]

    return Response(result)


@api_view(['GET'])
def layer_distinct_values(request):
    layer = request.GET.get('layer')
    field = request.GET.get('field')
    query_text = (request.GET.get('q') or '').strip()
    try:
        limit = int(request.GET.get('limit', 100))
    except (TypeError, ValueError):
        limit = 100
    limit = max(1, min(500, limit))

    if layer not in LAYER_TABLE_MAP:
        return Response({'values': []}, status=200)

    if not field or not SAFE_IDENTIFIER.match(field):
        return Response({'error': 'Invalid field.'}, status=400)

    schema = LAYER_TABLE_MAP[layer]["schema"]
    table = LAYER_TABLE_MAP[layer]["table"]
    safe_field = field.replace('"', '""')

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = %s
              AND table_name = %s
              AND column_name = %s
            LIMIT 1
            """,
            [schema, table, field],
        )
        if cursor.fetchone() is None:
            return Response({'values': []}, status=200)

        params = []
        where_parts = [
            f"\"{safe_field}\" IS NOT NULL",
            f"btrim(CAST(\"{safe_field}\" AS text)) <> ''",
        ]
        if query_text:
            where_parts.append(f"CAST(\"{safe_field}\" AS text) ILIKE %s")
            params.append(f"%{query_text}%")

        sql = f"""
            SELECT DISTINCT CAST("{safe_field}" AS text) AS value
            FROM "{schema}"."{table}"
            WHERE {" AND ".join(where_parts)}
            ORDER BY value
            LIMIT %s
        """
        params.append(limit)
        cursor.execute(sql, params)
        values = [row[0] for row in cursor.fetchall() if row and row[0] is not None]

    return Response({'values': values}, status=200)


@csrf_exempt
@api_view(['GET', 'PUT'])
def style_config(request):
    try:
        config, _ = SharedStyleConfig.objects.get_or_create(key='default')
    except (ProgrammingError, OperationalError):
        fallback = _load_style_fallback()
        if request.method == 'GET':
            return Response(fallback)

        updates, error_response = _style_payload_from_request(request)
        if error_response:
            return error_response
        fallback.update(updates)
        _save_style_fallback(fallback)
        return Response(fallback)

    if request.method == 'GET':
        return Response({
            'named_styles': config.named_styles or [],
            'layer_styles': config.layer_styles or {},
            'layer_style_selections': config.layer_style_selections or {},
        })

    updates, error_response = _style_payload_from_request(request)
    if error_response:
        return error_response
    if 'named_styles' in updates:
        config.named_styles = updates['named_styles']
    if 'layer_styles' in updates:
        config.layer_styles = updates['layer_styles']
    if 'layer_style_selections' in updates:
        config.layer_style_selections = updates['layer_style_selections']

    config.save(update_fields=['named_styles', 'layer_styles', 'layer_style_selections', 'updated_at'])
    return Response({
        'named_styles': config.named_styles or [],
        'layer_styles': config.layer_styles or {},
        'layer_style_selections': config.layer_style_selections or {},
    })


@api_view(['GET'])
def bhuvan_lulc_stats(request):
    """
    Proxy for Bhuvan LULC 50k statistics API.
    Required: year (0506 or 1112) and either statcode or distcode.
    Token can be provided via query param or BHUVAN_LULC_TOKEN env var.
    """
    year = request.GET.get("year")
    statcode = request.GET.get("statcode")
    distcode = request.GET.get("distcode")
    mode = (request.GET.get("mode") or "json").lower()

    if not year or year not in {"0506", "1112"}:
        return Response({"error": "Invalid year. Use 0506 or 1112."}, status=400)

    if not distcode and not statcode:
        return Response({"error": "Provide statcode or distcode."}, status=400)

    token = request.GET.get("token") or os.getenv("BHUVAN_LULC_TOKEN")
    if not token:
        return Response({"error": "Missing token. Provide token or set BHUVAN_LULC_TOKEN."}, status=400)

    if mode not in {"json", "pie"}:
        return Response({"error": "Invalid mode. Use json or pie."}, status=400)

    base_url = "https://bhuvan-app1.nrsc.gov.in/api/lulc/curljson.php"
    if mode == "pie":
        base_url = "https://bhuvan-app1.nrsc.gov.in/api/lulc/curlpie.php"

    params = {
        "year": year,
        "token": token,
    }
    if distcode:
        params["distcode"] = distcode
    else:
        params["statcode"] = statcode

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "smart-city-webgis",
    }

    try:
        response = _bhuvan_stats_session.get(base_url, params=params, headers=headers, timeout=30)
        content_type = response.headers.get("Content-Type", "application/json")
        if response.status_code == 200:
            return HttpResponse(response.content, content_type=content_type, status=200)

        # Do not echo token in error responses
        return HttpResponse(
            f"Bhuvan LULC stats error {response.status_code}",
            status=response.status_code,
            content_type="text/plain",
        )
    except requests.exceptions.Timeout:
        return HttpResponse(
            "Bhuvan LULC stats request timed out.",
            status=504,
            content_type="text/plain",
        )


@csrf_exempt
@api_view(['POST'])
def upload_raster(request):
    dataset = (request.POST.get('dataset') or 'DEM').strip()
    datetime_value = (request.POST.get('datetime') or request.POST.get('date') or '').strip()
    raster_file = request.FILES.get('file')

    if not raster_file:
        return Response({'error': 'Missing file.'}, status=400)
    if not datetime_value:
        return Response({'error': 'Missing date/time.'}, status=400)

    # Basic sanitization for filename
    safe_dataset = re.sub(r'[^A-Za-z0-9_-]+', '_', dataset).strip('_') or 'DEM'
    safe_datetime = re.sub(r'[^0-9T:-]+', '', datetime_value)
    if not safe_datetime:
        return Response({'error': 'Invalid date/time.'}, status=400)

    # Replace ":" with "-" for filesystem safety
    safe_datetime_for_name = safe_datetime.replace(':', '-')

    ext = os.path.splitext(raster_file.name)[1].lower()
    if ext not in {'.tif', '.tiff', '.geotiff'}:
        return Response({'error': 'Unsupported file type.'}, status=400)

    filename = f"{safe_dataset}_{safe_datetime_for_name}.tif"
    os.makedirs(settings.MEDIA_ROOT, exist_ok=True)
    storage = FileSystemStorage(location=settings.MEDIA_ROOT)

    if storage.exists(filename):
        storage.delete(filename)

    storage.save(filename, raster_file)

    url = request.build_absolute_uri(f"{settings.MEDIA_URL}{filename}")
    return Response({
        'name': filename,
        'dataset': safe_dataset,
        'datetime': safe_datetime,
        'url': url,
    })


@api_view(['GET'])
def list_rasters(request):
    dataset = (request.GET.get('dataset') or '').strip()
    safe_dataset = re.sub(r'[^A-Za-z0-9_-]+', '_', dataset).strip('_')

    items = []
    if os.path.isdir(settings.MEDIA_ROOT):
        for name in os.listdir(settings.MEDIA_ROOT):
            if not name.lower().endswith(('.tif', '.tiff', '.geotiff')):
                continue
            if safe_dataset and not name.startswith(f"{safe_dataset}_"):
                continue
            base = os.path.splitext(name)[0]
            dataset_name = ''
            timestamp = ''
            if '_' in base:
                dataset_name, timestamp = base.split('_', 1)
            display = timestamp
            datetime_value = ''
            if 'T' in timestamp:
                date_part, time_part = timestamp.split('T', 1)
                time_part = time_part.replace('-', ':')
                display = f"{date_part} {time_part}"
                datetime_value = f"{date_part}T{time_part}"
            else:
                datetime_value = timestamp
            url = request.build_absolute_uri(f"{settings.MEDIA_URL}{name}")
            items.append({
                'name': name,
                'dataset': dataset_name,
                'datetime': datetime_value,
                'display': display,
                'url': url,
            })

    items.sort(key=lambda x: x.get('datetime') or '')
    return Response({'items': items})


@api_view(['GET'])
def list_3d_tiles(request):
    root = _three_d_root()
    items = []
    for item in _load_three_d_registry():
        layer_id = item.get("id")
        if not layer_id:
            continue
        if not (root / layer_id / "tileset.json").exists():
            continue
        items.append(_three_d_response_item(request, item))
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return Response({"items": items})


@csrf_exempt
@api_view(['POST'])
def inspect_3d_shapefile_attributes(request):
    uploaded_files = request.FILES.getlist("files") or request.FILES.getlist("file")
    if not uploaded_files and request.FILES.get("file"):
        uploaded_files = [request.FILES["file"]]

    if not uploaded_files:
        return Response({"error": "Upload a shapefile set to inspect attributes."}, status=400)

    rejected = [
        upload.name
        for upload in uploaded_files
        if os.path.splitext(upload.name)[1].lower() not in _SHAPEFILE_EXTENSIONS
    ]
    if rejected:
        return Response({"error": "Only shapefile files are allowed.", "files": rejected}, status=400)

    inspect_dir = _three_d_root() / "_uploads" / f"inspect_{uuid.uuid4().hex[:12]}"
    inspect_dir.mkdir(parents=True, exist_ok=True)

    dbf_path = None
    try:
        for upload in uploaded_files:
            filename = _safe_file_name(upload.name)
            target_path = inspect_dir / filename
            with target_path.open("wb+") as destination:
                for chunk in upload.chunks():
                    destination.write(chunk)
            # Extract ZIP archives
            if upload.name.lower().endswith(".zip"):
                try:
                    with zipfile.ZipFile(target_path, "r") as zf:
                        zf.extractall(inspect_dir)
                except zipfile.BadZipFile:
                    return Response({"error": f"{filename} is not a valid ZIP archive."}, status=400)

        # Scan for shapefile components (from direct upload or ZIP extraction)
        for ext in (".dbf", ".shp", ".shx", ".prj", ".cpg", ".qpj"):
            matches = list(inspect_dir.glob(f"*{ext}"))
            if matches:
                # Take the first file with this extension; prefer lower-case basename
                candidates = sorted(matches, key=lambda p: p.name.lower())
                if ext == ".dbf":
                    dbf_path = candidates[0]

        fields = _read_shapefile_fields(dbf_path) if dbf_path else []
        return Response({
            "fields": fields,
            "suggestions": {
                "heightColumn": _pick_field(fields, _HEIGHT_FIELD_HINTS),
                "depthColumn": _pick_field(fields, _DEPTH_FIELD_HINTS),
                "diameterColumn": _pick_field(fields, _DIAMETER_FIELD_HINTS),
            },
        })
    finally:
        shutil.rmtree(inspect_dir, ignore_errors=True)


def _run_subprocess(command, cwd, timeout=3600):
    result = subprocess.run(
        command,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    return result


def _require_ogr2ogr():
    """Return True only if ogr2ogr appears runnable.

    Note: ogr2ogr may segfault on some systems/builds; in that case we treat it as unavailable
    so the API can fall back instead of failing with a misleading "missing ogr2ogr" error.
    """
    try:
        r = subprocess.run(
            ["ogr2ogr", "--version"],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        # If a segfault happened, returncode is typically 139.
        # We treat anything non-zero as unavailable.
        return r.returncode == 0
    except Exception:
        return False



def _preprocess_water_linestring_and_project(input_shp_path, work_dir, diameter_column, height_column=None):
    """Preprocess SHP for Mago stability:
    - MultiLineString -> LineString
    - Remove invalid/empty/too-short/zero-length lines (PostGIS)
    - Force safe diameter values (PostGIS)
    - Reproject to EPSG:32643

    Returns path to projected, cleaned SHP.
    """
    # Step 1: MultiLineString -> LineString
    if not _require_ogr2ogr():
        raise RuntimeError("Missing ogr2ogr in PATH. Install GDAL (ogr2ogr) to run preprocessing.")

    input_shp_path = Path(input_shp_path)
    work_dir = Path(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    base = input_shp_path.stem
    step1_shp = work_dir / f"{base}_linestring.shp"
    step2_shp = work_dir / f"{base}_clean.shp"
    step3_shp = work_dir / f"{base}_32643.shp"

    convert_cmd = [
        "ogr2ogr",
        "-overwrite",
        "-nlt",
        "LINESTRING",
        "-skipfailures",
        str(step1_shp),
        str(input_shp_path),
    ]

    print("[PREP] MultiLineString -> LineString", flush=True)
    print("[PREP CMD]", " ".join(convert_cmd), flush=True)
    result = _run_subprocess(convert_cmd, cwd=work_dir, timeout=3600)
    if result.returncode != 0:
        raise RuntimeError(
            "ogr2ogr LINESTRING conversion failed: "
            + (result.stderr or result.stdout or "no output")[:2000]
        )

    # Step 2 & 3: PostGIS cleanup + diameter force
    # We'll import step1_shp into a temporary table, run SQL, then export back to SHP.
    # Uses GDAL's PostgreSQL driver via ogr2ogr for import/export.
    diameter_field = diameter_column or "diameter"
    safe_diameter_field = diameter_field

    tmp_schema = "public"
    tmp_table = f"mago_prep_{uuid.uuid4().hex[:10]}"

    # Import into PostGIS temp table
    # Connection details from Django settings
    from django.conf import settings as dj_settings
    db = dj_settings.DATABASES.get("default") or {}
    conn_str = (
        f"PG:host={db.get('HOST')} port={db.get('PORT')} user={db.get('USER')} password={db.get('PASSWORD')} dbname={db.get('NAME')}"
    )

    # (a) create temp table by overwriting
    import_cmd = [
        "ogr2ogr",
        "-overwrite",
        "-f",
        "PostgreSQL",
        conn_str,
        str(step1_shp),
        "-nln",
        f"{tmp_schema}.{tmp_table}",
        "-lco",
        "GEOMETRY_NAME=geom",
    ]

    print("[PREP] Import into PostGIS temp table", flush=True)
    print("[PREP CMD]", " ".join(import_cmd), flush=True)
    result = _run_subprocess(import_cmd, cwd=work_dir, timeout=3600)
    if result.returncode != 0:
        raise RuntimeError(
            "ogr2ogr PostGIS import failed: "
            + (result.stderr or result.stdout or "no output")[:2000]
        )

    # (b) run SQL cleanup
    cleanup_sql = f"""
        DELETE FROM {tmp_schema}.{tmp_table}
        WHERE
            geom IS NULL
            OR ST_IsEmpty(geom)
            OR ST_NPoints(geom) < 2
            OR ST_Length(geom::geography) = 0;

        UPDATE {tmp_schema}.{tmp_table}
        SET {safe_diameter_field} =
            CASE
                WHEN {safe_diameter_field} IS NULL OR {safe_diameter_field} <= 0 THEN 100
                ELSE {safe_diameter_field}
            END;
    """

    try:
        with connection.cursor() as cursor:
            cursor.execute(cleanup_sql)
    except Exception as e:
        raise RuntimeError(f"PostGIS cleanup failed: {e}")

    # (c) export back to SHP (still in source CRS)
    export_cmd = [
        "ogr2ogr",
        "-overwrite",
        "-f",
        "ESRI Shapefile",
        str(step2_shp),
        conn_str,
        "-sql",
        f"SELECT * FROM {tmp_schema}.{tmp_table}",
    ]

    print("[PREP] Export cleaned features back to SHP", flush=True)
    print("[PREP CMD]", " ".join(export_cmd), flush=True)
    result = _run_subprocess(export_cmd, cwd=work_dir, timeout=3600)
    if result.returncode != 0:
        raise RuntimeError(
            "ogr2ogr PostGIS export failed: "
            + (result.stderr or result.stdout or "no output")[:2000]
        )

    # Cleanup temp table
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"DROP TABLE IF EXISTS {tmp_schema}.{tmp_table};")
    except Exception:
        pass

    # Step 4: Reproject to EPSG:32643
    reproject_cmd = [
        "ogr2ogr",
        "-overwrite",
        "-t_srs",
        "EPSG:4326",
        str(step3_shp),
        str(step2_shp),
    ]

    print("[PREP] Reproject to EPSG:32643", flush=True)
    print("[PREP CMD]", " ".join(reproject_cmd), flush=True)
    result = _run_subprocess(reproject_cmd, cwd=work_dir, timeout=3600)
    if result.returncode != 0:
        raise RuntimeError(
            "ogr2ogr reprojection failed: "
            + (result.stderr or result.stdout or "no output")[:2000]
        )

    if not step3_shp.exists():
        raise RuntimeError("Preprocessing failed: projected SHP not found.")

    return step3_shp


@csrf_exempt
@api_view(['POST'])
def import_3d_tiles(request):
    uploaded_files = request.FILES.getlist("files") or request.FILES.getlist("file")
    if not uploaded_files and request.FILES.get("file"):
        uploaded_files = [request.FILES["file"]]

    if not uploaded_files:
        return Response({"error": "Upload a shapefile."}, status=400)

    rejected = [
        upload.name
        for upload in uploaded_files
        if os.path.splitext(upload.name)[1].lower() not in _SHAPEFILE_EXTENSIONS
    ]
    if rejected:
        return Response({"error": "Only shapefile files or a ZIP archive are allowed.", "files": rejected}, status=400)

    shp_count = sum(1 for u in uploaded_files if u.name.lower().endswith(".shp"))
    zip_count = sum(1 for u in uploaded_files if u.name.lower().endswith(".zip"))
    if zip_count > 1:
        return Response({"error": "Upload only one ZIP archive at a time."}, status=400)
    if zip_count == 0 and shp_count != 1:
        return Response({"error": "Upload exactly one .shp file."}, status=400)

    height_column = (request.POST.get("heightColumn") or "").strip()
    depth_column = (request.POST.get("depthColumn") or "").strip()
    diameter_column = (request.POST.get("diameterColumn") or "").strip()
    crs = (request.POST.get("crs") or "4326").strip() or "4326"
    if not re.fullmatch(r"\d{3,6}", crs):
        return Response({"error": "CRS must be an EPSG code like 4326."}, status=400)
    for label, column in (
        ("height", height_column),
        ("depth", depth_column),
        ("diameter", diameter_column),
    ):
        if column and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,63}", column):
            return Response({"error": f"Invalid {label} column name."}, status=400)

    jar_path = Path(getattr(settings, "MAGO_3D_TILER_JAR", ""))
    if not jar_path.exists():
        return Response({"error": f"Mago 3D tiler jar was not found at {jar_path}."}, status=500)

    layer_id = f"mago_{uuid.uuid4().hex[:12]}"
    root = _three_d_root()
    upload_dir = root / "_uploads" / layer_id
    output_dir = root / layer_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    saved_shp_path = None
    for upload in uploaded_files:
        filename = _safe_file_name(upload.name)
        target_path = upload_dir / filename
        with target_path.open("wb+") as destination:
            for chunk in upload.chunks():
                destination.write(chunk)
        if upload.name.lower().endswith(".zip"):
            try:
                with zipfile.ZipFile(target_path, "r") as zf:
                    zf.extractall(upload_dir)
            except zipfile.BadZipFile:
                shutil.rmtree(upload_dir, ignore_errors=True)
                shutil.rmtree(output_dir, ignore_errors=True)
                return Response({"error": f"{filename} is not a valid ZIP archive."}, status=400)
        elif upload.name.lower().endswith(".shp"):
            saved_shp_path = target_path

    # If a ZIP was extracted, find the .shp inside the upload directory
    if not saved_shp_path:
        matches = list(upload_dir.glob("*.shp"))
        if matches:
            saved_shp_path = sorted(matches, key=lambda p: p.name.lower())[0]

    if not saved_shp_path:
        shutil.rmtree(upload_dir, ignore_errors=True)
        shutil.rmtree(output_dir, ignore_errors=True)
        return Response({"error": "Missing .shp file."}, status=400)

    # --- Preprocess to stabilize Mago for utility/pipe datasets ---
    # If ogr2ogr/GDAL preprocessing fails (including segfault), fall back to running Mago
    # on the original uploaded SHP so the import endpoint remains usable.
    projected_shp_path = None
    prep_warning = None
    try:
        diameter_col_for_prep = diameter_column or "diameter"
        print(f"[PREP START] layer_id={layer_id} input={saved_shp_path}", flush=True)
        projected_shp_path = _preprocess_water_linestring_and_project(
            input_shp_path=saved_shp_path,
            work_dir=upload_dir,
            diameter_column=diameter_col_for_prep,
            height_column=height_column,
        )
        print(f"[PREP DONE] projected_shp={projected_shp_path}", flush=True)
    except Exception as err:
        prep_warning = str(err)
        # Fall back to original SHP (still uses Mago -c 32643 as configured below)
        projected_shp_path = saved_shp_path
        print(f"[PREP SKIP] layer_id={layer_id} warning={prep_warning}", flush=True)


    # Mago 1.7.0 pipe conversion is unstable with MultiLineString; always run with EPSG:32643.
    command = [
        "java",
        "-jar",
        str(jar_path),
        "--input",
        str(projected_shp_path),
        "--inputType",
        "SHP",
        "-c",
        "4326",
    ]
    if height_column:
        command.extend(["-hc", height_column])
    if diameter_column:
        command.extend(["-dc", diameter_column])
    command.extend(["--output", str(output_dir)])

    try:
        print(f"[MAGO START] layer_id={layer_id} input={saved_shp_path} output={output_dir}", flush=True)
        print("[MAGO CMD]", " ".join(command), flush=True)
        result = subprocess.run(
            command,
            cwd=str(Path(settings.BASE_DIR)),
            capture_output=True,
            text=True,
            timeout=3600,
            check=False,
        )
        print(f"[MAGO DONE] returncode={result.returncode}", flush=True)
        if result.stdout:
            print(f"[MAGO STDOUT] {result.stdout[:2000]}", flush=True)
        if result.stderr:
            print(f"[MAGO STDERR] {result.stderr[:2000]}", flush=True)
    except subprocess.TimeoutExpired:
        shutil.rmtree(output_dir, ignore_errors=True)
        return Response({"error": "Mago 3D tiler timed out while creating tiles."}, status=504)
    except OSError as err:
        shutil.rmtree(output_dir, ignore_errors=True)
        return Response({"error": f"Unable to run Java/Mago tiler: {err}"}, status=500)

    tileset_path = output_dir / "tileset.json"
    if not tileset_path.exists():
        shutil.rmtree(output_dir, ignore_errors=True)
        print(f"[MAGO FAILED] tileset.json not found at {tileset_path}", flush=True)
        return Response({
            "error": "Mago 3D tiler failed.",
            "preprocessing": "MultiLineString->LineString + PostGIS cleanup + EPSG:32643 projection performed before running Mago.",
            "returncode": result.returncode,
            "command": " ".join(command),
            "stdout": (result.stdout or "")[-4000:],
            "stderr": (result.stderr or "")[-4000:],
        }, status=500)

    display_name = _safe_display_name(request.POST.get("name"), saved_shp_path.stem)
    item = {
        "id": layer_id,
        "name": display_name,
        "source": saved_shp_path.name,
        "heightColumn": height_column,
        "depthColumn": depth_column,
        "diameterColumn": diameter_column,
        "crs": crs,
        "created_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }
    items = [existing for existing in _load_three_d_registry() if existing.get("id") != layer_id]
    items.append(item)
    _save_three_d_registry(items)

    resp = Response(_three_d_response_item(request, item), status=201)
    if prep_warning:
        resp.data["warning"] = f"Preprocessing skipped due to ogr2ogr/GDAL error: {prep_warning}" 
    return resp



@csrf_exempt
@api_view(['DELETE'])
def delete_3d_tiles(request, layer_id):
    """Delete a 3D tileset layer and its files."""
    root = _three_d_root().resolve()
    safe_layer_id = re.sub(r"[^A-Za-z0-9_-]+", "", layer_id)
    if safe_layer_id != layer_id:
        return Response({"error": "Invalid layer ID."}, status=400)

    layer_root = (root / safe_layer_id).resolve()
    upload_root = (root / "_uploads" / safe_layer_id).resolve()

    for target in (layer_root, upload_root):
        if target.exists():
            shutil.rmtree(target, ignore_errors=True)

    return Response({"deleted": safe_layer_id})


def serve_3d_tile_file(request, layer_id, path="tileset.json"):
    root = _three_d_root().resolve()
    safe_layer_id = re.sub(r"[^A-Za-z0-9_-]+", "", layer_id)
    if safe_layer_id != layer_id:
        raise Http404

    layer_root = (root / safe_layer_id).resolve()
    relative_path = Path(path or "tileset.json")
    file_path = (layer_root / relative_path).resolve()
    if layer_root not in file_path.parents or not file_path.is_file():
        raise Http404

    content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    if file_path.suffix.lower() == ".json":
        content_type = "application/json"
    elif file_path.suffix.lower() == ".b3dm":
        content_type = "application/octet-stream"
    return FileResponse(file_path.open("rb"), content_type=content_type)


@api_view(['GET'])
def bhuvan_routing(request):
    """
    Proxy for Bhuvan routing API.
    Required: lat1, lon1, lat2, lon2.
    Token can be provided via query param or BHUVAN_ROUTING_TOKEN env var.
    """
    lat1 = request.GET.get("lat1")
    lon1 = request.GET.get("lon1")
    lat2 = request.GET.get("lat2")
    lon2 = request.GET.get("lon2")

    if not lat1 or not lon1 or not lat2 or not lon2:
        return Response({"error": "Provide lat1, lon1, lat2, lon2."}, status=400)

    token = request.GET.get("token") or os.getenv("BHUVAN_ROUTING_TOKEN")
    if not token:
        return Response({"error": "Missing token. Provide token or set BHUVAN_ROUTING_TOKEN."}, status=400)

    base_url = "https://bhuvan-app1.nrsc.gov.in/api/routing/curl_routing_state.php"
    params = {
        "lat1": lat1,
        "lon1": lon1,
        "lat2": lat2,
        "lon2": lon2,
        "token": token,
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "smart-city-webgis",
    }

    try:
        response = _bhuvan_route_session.get(base_url, params=params, headers=headers, timeout=30)
        content_type = response.headers.get("Content-Type", "application/json")
        if response.status_code == 200:
            return HttpResponse(response.content, content_type=content_type, status=200)

        return HttpResponse(
            f"Bhuvan routing error {response.status_code}",
            status=response.status_code,
            content_type="text/plain",
        )
    except requests.exceptions.Timeout:
        return HttpResponse(
            "Bhuvan routing request timed out.",
            status=504,
            content_type="text/plain",
        )
    except requests.exceptions.RequestException:
        return HttpResponse(
            "Bhuvan routing request failed.",
            status=502,
            content_type="text/plain",
        )


@api_view(['GET'])
def bhuvan_lulc_aoi(request):
    """
    Proxy for Bhuvan LULC AOI API.
    Required: geom (WKT, URL-encoded).
    Token can be provided via query param or BHUVAN_LULC_TOKEN env var.
    """
    geom = request.GET.get("geom")
    if not geom:
        return Response({"error": "Missing geom (WKT)."}, status=400)

    token = request.GET.get("token") or os.getenv("BHUVAN_LULC_TOKEN")
    if not token:
        return Response({"error": "Missing token. Provide token or set BHUVAN_LULC_TOKEN."}, status=400)

    base_url = "https://bhuvan-app1.nrsc.gov.in/api/lulc/curl_aoi.php"
    params = {
        "geom": geom,
        "token": token,
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "smart-city-webgis",
    }

    try:
        response = _bhuvan_stats_session.get(base_url, params=params, headers=headers, timeout=30)
        content_type = response.headers.get("Content-Type", "application/json")
        if response.status_code == 200:
            return HttpResponse(response.content, content_type=content_type, status=200)

        return HttpResponse(
            f"Bhuvan LULC AOI error {response.status_code}",
            status=response.status_code,
            content_type="text/plain",
        )
    except requests.exceptions.Timeout:
        return HttpResponse(
            "Bhuvan LULC AOI request timed out.",
            status=504,
            content_type="text/plain",
        )
    except requests.exceptions.RequestException:
        return HttpResponse(
            "Bhuvan LULC AOI request failed.",
            status=502,
            content_type="text/plain",
        )


@api_view(['GET'])
def bhuvan_wms_proxy(request):
    query = request.GET.urlencode()
    # Official Bhuvan LULC 250K WMS endpoint
    url = f"https://bhuvan-ras2.nrsc.gov.in/cgi-bin/LULC250K.exe?{query}"

    print(f"[Bhuvan WMS Proxy] Requesting: {url[:150]}...")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "image/png,image/*,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
        "Referer": "https://bhuvan.nrsc.gov.in/",
    }

    try:
        # Use persistent session with SSL verification disabled
        # Bhuvan may have certificate issues, so we disable verification
        response = _bhuvan_session.get(
            url,
            headers=headers,
            timeout=30,
            verify=False,
            allow_redirects=True
        )
        
        if response.status_code == 200:
            content_type = response.headers.get("Content-Type", "image/png")
            print(f"[Bhuvan WMS Proxy] Success - Content-Type: {content_type}, Size: {len(response.content)} bytes")
            return HttpResponse(response.content, content_type=content_type)
        else:
            error_msg = response.text[:300] if response.text else f"HTTP {response.status_code}"
            print(f"[Bhuvan WMS Proxy] HTTP Error {response.status_code}: {error_msg}")
            request_type = _get_request_type(request)
            if request_type == "GETMAP":
                return _transparent_tile_response(request, upstream_status=response.status_code)
            return HttpResponse(
                f"Bhuvan WMS Error {response.status_code}: {error_msg}",
                status=response.status_code,
                content_type="text/plain"
            )
    except requests.exceptions.SSLError as err:
        print(f"[Bhuvan WMS Proxy] SSL Error: {str(err)}")
        if _get_request_type(request) == "GETMAP":
            return _transparent_tile_response(request, upstream_status=502)
        return HttpResponse(
            f"SSL connection error with Bhuvan server. Please try again later.",
            status=502,
            content_type="text/plain",
        )
    except requests.exceptions.ConnectionError as err:
        print(f"[Bhuvan WMS Proxy] Connection Error: {str(err)}")
        if _get_request_type(request) == "GETMAP":
            return _transparent_tile_response(request, upstream_status=502)
        return HttpResponse(
            f"Could not connect to Bhuvan WMS server. Please ensure the Bhuvan service is accessible.",
            status=502,
            content_type="text/plain",
        )
    except requests.exceptions.Timeout as err:
        print(f"[Bhuvan WMS Proxy] Timeout Error: {str(err)}")
        if _get_request_type(request) == "GETMAP":
            return _transparent_tile_response(request, upstream_status=504)
        return HttpResponse(
            f"Request to Bhuvan WMS server timed out.",
            status=504,
            content_type="text/plain",
        )
    except Exception as err:
        print(f"[Bhuvan WMS Proxy] Unexpected Error: {str(err)}")
        import traceback
        traceback.print_exc()
        if _get_request_type(request) == "GETMAP":
            return _transparent_tile_response(request, upstream_status=500)
        return HttpResponse(
            f"Unexpected error: {str(err)}",
            status=500,
            content_type="text/plain",
        )


@api_view(['GET', 'POST'])
def geoserver_proxy(request, path=''):
    """
    Proxy for GeoServer WMS/WFS requests.
    Routes requests to the configured GeoServer instance.
    """
    # Build the GeoServer URL
    geoserver_base = "http://192.168.20.57:5855/geoserver"
    
    # Reconstruct the query string from GET parameters
    query_params = request.GET.urlencode()
    
    # Ensure path starts with /
    if path and not path.startswith('/'):
        path = '/' + path
    
    # Build the full URL
    url = f"{geoserver_base}{path}"
    if query_params:
        url += f"?{query_params}"
    
    print(f"[GeoServer Proxy] Forwarding to: {url[:200]}...")
    
    req = Request(url, headers={"User-Agent": "smart-city-webgis"})

    try:
        with urlopen(req, timeout=30) as resp:
            data = resp.read()
            content_type = resp.headers.get("Content-Type", "image/png")
            print(f"[GeoServer Proxy] Success")
            return HttpResponse(data, content_type=content_type)
    except HTTPError as err:
        error_body = err.read().decode("utf-8", errors="ignore")
        print(f"[GeoServer Proxy] HTTP Error {err.code}: {error_body[:200]}")
        return HttpResponse(
            f"GeoServer proxy error: {err.code} - {error_body[:200]}",
            status=err.code,
            content_type="text/plain"
        )
    except URLError as err:
        print(f"[GeoServer Proxy] Connection error: {err.reason}")
        return HttpResponse(
            f"GeoServer connection error: {err.reason}. Please ensure GeoServer is running on port 5855.",
            status=502,
            content_type="text/plain"
        )
    except Exception as err:
        print(f"[GeoServer Proxy] Unexpected Error: {str(err)}")
        return HttpResponse(
            f"Unexpected error: {str(err)}",
            status=500,
            content_type="text/plain",
        )


def _run_overpass_query(query):
    endpoint_errors = []
    for endpoint in _OVERPASS_ENDPOINTS:
        try:
            resp = requests.post(
                endpoint,
                data={"data": query},
                headers={
                    "User-Agent": "smart-city-webgis-osm-proxy/1.0",
                    "Accept": "application/json,text/plain;q=0.9,*/*;q=0.8",
                },
                timeout=45,
            )
            if not resp.ok:
                snippet = re.sub(r"\s+", " ", (resp.text or "")).strip()[:120]
                endpoint_errors.append(f"{endpoint} returned {resp.status_code}: {snippet}")
                continue

            try:
                return resp.json()
            except ValueError:
                snippet = re.sub(r"\s+", " ", (resp.text or "")).strip()[:120]
                if (resp.text or "").lstrip().startswith(("{", "[")):
                    endpoint_errors.append(f"{endpoint} returned invalid JSON payload.")
                else:
                    endpoint_errors.append(f"{endpoint} returned non-JSON payload: {snippet}")
                continue
        except requests.exceptions.RequestException as err:
            endpoint_errors.append(f"{endpoint} failed: {str(err)}")
    if endpoint_errors:
        raise RuntimeError("All Overpass endpoints failed. " + " | ".join(endpoint_errors))
    raise RuntimeError("All Overpass endpoints failed.")


def _extract_overpass_count(json_data):
    if not isinstance(json_data, dict):
        return 0
    elements = json_data.get("elements")
    if not isinstance(elements, list) or not elements:
        return 0
    first = elements[0] if isinstance(elements[0], dict) else {}
    tags = first.get("tags") if isinstance(first, dict) else {}
    try:
        return int((tags or {}).get("total", 0))
    except (TypeError, ValueError):
        return 0


def _overpass_to_feature_collection(elements, category):
    features = []
    for element in elements or []:
        etype = element.get("type")
        if etype == "node":
            lat = element.get("lat")
            lon = element.get("lon")
            if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                props = dict(element.get("tags") or {})
                props.update({"osm_id": element.get("id"), "osm_type": "node", "category": category})
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": props,
                })
            continue

        if etype == "way":
            geom = element.get("geometry") or []
            coords = [
                [pt.get("lon"), pt.get("lat")]
                for pt in geom
                if isinstance(pt.get("lon"), (int, float)) and isinstance(pt.get("lat"), (int, float))
            ]
            if len(coords) < 2:
                continue
            is_closed = len(coords) >= 4 and coords[0] == coords[-1]
            props = dict(element.get("tags") or {})
            props.update({"osm_id": element.get("id"), "osm_type": "way", "category": category})
            features.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coords]} if is_closed else {"type": "LineString", "coordinates": coords},
                "properties": props,
            })

    return {"type": "FeatureCollection", "features": features}


@csrf_exempt
@api_view(["POST"])
def osm_query(request):
    payload = request.data if isinstance(request.data, dict) else {}
    mode = str(payload.get("mode") or "availability").strip().lower()
    bbox = payload.get("bbox")
    categories = payload.get("categories") or []

    if not isinstance(bbox, list) or len(bbox) != 4:
        return Response({"error": "bbox must be [minLon, minLat, maxLon, maxLat]."}, status=400)
    try:
        min_lon, min_lat, max_lon, max_lat = [float(v) for v in bbox]
    except (TypeError, ValueError):
        return Response({"error": "bbox values must be numeric."}, status=400)
    if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180 and -90 <= min_lat <= 90 and -90 <= max_lat <= 90):
        return Response({"error": "bbox coordinates are out of range."}, status=400)
    if min_lon >= max_lon or min_lat >= max_lat:
        return Response({"error": "bbox min values must be smaller than max values."}, status=400)

    bbox_expr = f"{min_lat},{min_lon},{max_lat},{max_lon}"

    if mode == "availability":
        datasets = []
        for key, filter_expr in _OSM_DATASETS.items():
            query = f"[out:json][timeout:25];({filter_expr}({bbox_expr}););out count;"
            try:
                json_data = _run_overpass_query(query)
                count = _extract_overpass_count(json_data)
                datasets.append({"key": key, "count": count})
            except Exception as err:
                datasets.append({"key": key, "count": None, "error": str(err)})

        available_count = sum(1 for item in datasets if isinstance(item.get("count"), int))
        if available_count == 0:
            return Response({"error": "OSM availability failed for all datasets.", "datasets": datasets}, status=502)
        return Response({"datasets": datasets, "partial": available_count != len(datasets)})

    if mode == "fetch":
        if not isinstance(categories, list) or not categories:
            return Response({"error": "categories must be a non-empty list."}, status=400)
        selected = [c for c in categories if c in _OSM_DATASETS]
        if not selected:
            return Response({"error": "No valid categories selected."}, status=400)

        try:
            merged_features = []
            for key in selected:
                filter_expr = _OSM_DATASETS[key]
                query = f"[out:json][timeout:50];({filter_expr}({bbox_expr}););out body geom;"
                json_data = _run_overpass_query(query)
                elements = json_data.get("elements") if isinstance(json_data, dict) else []
                collection = _overpass_to_feature_collection(elements, key)
                merged_features.extend(collection.get("features", []))
            return Response({
                "type": "FeatureCollection",
                "features": merged_features,
                "categories": selected,
            })
        except Exception as err:
            return Response({"error": f"OSM fetch failed: {str(err)}"}, status=502)

    return Response({"error": "mode must be 'availability' or 'fetch'."}, status=400)
