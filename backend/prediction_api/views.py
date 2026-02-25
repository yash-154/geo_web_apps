import os
import json
import re
import ssl
import struct
import zlib
import certifi
import requests
import urllib3
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.db import connection
from django.db.utils import ProgrammingError, OperationalError
from django.http import HttpResponse
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import SharedStyleConfig

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

# ✅ Layer → Table mapping
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

	

_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

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

    if not field or not _SAFE_IDENTIFIER.match(field):
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
