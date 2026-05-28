import re


def extract_show_layer_request(question, normalize_func):
    """
    Extract a "show layer" request from user question.
    Returns tuple of (cleaned_phrase, normalized_layer_name).
    """
    text = (question or "").strip().lower()
    if not text:
        return None, None
    if any(keyword in text for keyword in ("buffer", "heatmap", "spatial query", "routing", "route", "analysis")):
        return None, None

    patterns = [
        r"show\s+(?:me\s+)?([a-z0-9_ -]+?)\s+on\s+map(?:s)?\b",
        r"show\s+(?:me\s+)?([a-z0-9_ -]+?)\s*$",
    ]
    candidate = None
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            candidate = match.group(1).strip().strip(".?!,;:")
            break
    if not candidate:
        return None, None

    cleaned = re.sub(r"\b(the|this|that|city|of|layer|layers)\b", " ", candidate, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return None, None

    normalized = normalize_func(cleaned)
    return cleaned, normalized or None


def extract_roads_type_filter_request(question, resolve_layer_type_value):
    """
    Extract a roads type filter request from user question.
    Returns resolved type value string or None.
    """
    text = str(question or "").strip().lower()
    if not text:
        return None

    if "road" not in text and "type" not in text:
        return None

    patterns = [
        r"\btype\s*(?:is|=|as)?\s*([a-z0-9_ -]+?)(?:\s+roads?)?\b",
        r"\bonly\s+([a-z0-9_ -]+?)\s+roads?\b",
        r"\b([a-z0-9_ -]+?)\s+roads?\s+only\b",
        r"\bshow(?:\s+me)?\s+([a-z0-9_ -]+?)\s+roads?\b",
        r"\bin\s+roads?\s+show(?:\s+me)?\s+type\s+([a-z0-9_ -]+?)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        resolved = resolve_layer_type_value("roads", match.group(1))
        if resolved:
            return resolved

    # Fallback for inputs like "major roads".
    fallback = re.search(r"\b([a-z0-9_ -]+?)\s+roads?\b", text, flags=re.IGNORECASE)
    if fallback:
        resolved = resolve_layer_type_value("roads", fallback.group(1))
        if resolved:
            return resolved
    return None
