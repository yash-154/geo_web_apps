import os
import requests


# Get configuration from environment
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3").strip()
OLLAMA_TIMEOUT_SECONDS = 90


def call_ollama_chat(base_url, model, messages, max_tokens=320):
    """
    Call Ollama chat API with the given model and messages.
    Returns tuple of (response_obj, error).
    """
    if not model:
        return None, ValueError("OLLAMA_MODEL is not configured")
    url = f"{base_url}/api/chat"
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"num_predict": max_tokens},
    }
    try:
        resp = requests.post(url, json=payload, timeout=OLLAMA_TIMEOUT_SECONDS)
        return resp, None
    except requests.exceptions.RequestException as err:
        return None, err


def get_ollama_model_candidates(model_name):
    """
    Generate candidate model names for Ollama.
    Handles tagged and untagged model names.
    """
    model = (model_name or "").strip()
    if not model:
        return []
    candidates = [model]
    if ":" in model:
        base = model.split(":", 1)[0].strip()
        if base and base not in candidates:
            candidates.append(base)
    else:
        tagged = f"{model}:latest"
        if tagged not in candidates:
            candidates.append(tagged)
    return candidates
