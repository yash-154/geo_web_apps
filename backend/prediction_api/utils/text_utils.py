import difflib
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from django.conf import settings


def normalize_layer_name(raw, layer_table_map=None):
    """
    Normalize layer names to standard keys from LAYER_TABLE_MAP.
    Handles aliases, keyword matching, and simple misspellings.
    """
    if layer_table_map is None:
        from ..gis.layer_service import LAYER_TABLE_MAP

        layer_table_map = LAYER_TABLE_MAP

    text = (raw or "").strip().lower()
    if not text:
        return ""
    text = re.sub(
        r"\b(near|nearby|nearest|closest|that|these|those|all|my|the|this|layer|layers)\b",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""

    alias_map = {
        "road": "roads",
        "roads": "roads",
        "landuse": "landuse",
        "land use": "landuse",
        "lulc": "landuse",
        "water": "waterbody",
        "waterbody": "waterbody",
        "water body": "waterbody",
        "canal": "waterbody",
        "river": "waterbody",
        "landmark": "landmarks",
        "landmarks": "landmarks",
        "poi": "landmarks",
    }
    normalized = alias_map.get(text, text if text in layer_table_map else "")
    if normalized:
        return normalized

    keyword_aliases = (
        ("landmark", "landmarks"),
        ("poi", "landmarks"),
        ("road", "roads"),
        ("water", "waterbody"),
        ("river", "waterbody"),
        ("canal", "waterbody"),
        ("land use", "landuse"),
        ("landuse", "landuse"),
        ("lulc", "landuse"),
    )
    for keyword, layer_name in keyword_aliases:
        if keyword in text:
            return layer_name

    # If the user made a small typo (e.g. "landuse" -> "landusee"), try fuzzy matching.
    candidates = list(layer_table_map.keys())
    matches = difflib.get_close_matches(text, candidates, n=1, cutoff=0.6)
    if matches:
        return matches[0]

    return ""


def normalize_type_phrase(raw_value):
    """
    Normalize field values (e.g., type values) for comparison.
    Removes common keywords and normalizes spaces/characters.
    """
    value = str(raw_value or "").strip().lower()
    if not value:
        return ""
    value = re.sub(r"\b(?:type|types)\b", " ", value)
    value = re.sub(r"[_-]+", " ", value)
    value = re.sub(r"[^a-z0-9\s]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\s+roads?$", "", value).strip()
    return value


def local_greeting_answer(question, layer_label_func, list_layers_func):
    """
    Generate a local greeting answer if the question is a greeting.
    Uses layer information to personalize the response.
    """
    raw_text = (question or "").strip().lower()
    text = re.sub(r"[^a-z0-9\s]+", " ", raw_text)
    text = re.sub(r"\s+", " ", text).strip()
    greetings = ("hi", "hey", "hello", "hii", "yo", "good morning", "good afternoon", "good evening")
    if any(text == g or text.startswith(f"{g} ") for g in greetings):
        local_tz = ZoneInfo(getattr(settings, "CHAT_TIME_ZONE", "Asia/Kolkata"))
        hour = datetime.now(local_tz).hour

        if 5 <= hour < 12:
            period_greeting = "Good morning"
        elif 12 <= hour < 17:
            period_greeting = "Good Afternoon"
        else:
            period_greeting = "Good Evening"

        layer_labels = [layer_label_func(layer_key) for layer_key in list_layers_func()]
        layers_text = ", ".join(layer_labels) if layer_labels else "No layers are configured yet"

        return (
            f"Hello, {period_greeting}. "
            f"This WebGIS currently has these layers: {layers_text}. "
            "I can help you show layers, summarize data, filter by attributes, and run analysis tools like "
            "buffer, spatial query, heatmap, and routing."
        )
    return None


def local_tool_help_answer(question):
    """
    Provide local help text for specific tools.
    """
    text = (question or "").strip().lower()
    if "spatial query" in text:
        return (
            "To run Spatial Query: open Analysis tab -> choose tool 'Spatial Query' -> "
            "select Reference Layer and Target Layer -> choose operator (inside/within/overlap/etc.) -> "
            "set distance tolerance if needed -> click Run Spatial Query. "
            "Results are highlighted on map and reflected in attributes."
        )
    if "buffer" in text:
        return (
            "To run Buffer: Analysis tab -> Buffer tool -> select target layer -> set distance (meters) -> "
            "choose input mode (center click/polygon/rectangle) -> draw or click -> run. "
            "Matched features appear on map and attributes panel."
        )
    if "heatmap" in text:
        return (
            "To run Heatmap: Analysis tab -> Heatmap tool -> select target layer -> set radius and blur -> "
            "optionally choose a numeric weight field -> click Build Heatmap."
        )
    if "routing" in text or "route" in text:
        return (
            "To run Routing: Analysis tab -> Routing -> provide token -> click Start Routing -> "
            "click start point and end point on map."
        )
    return None
