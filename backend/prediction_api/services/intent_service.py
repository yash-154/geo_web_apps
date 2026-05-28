def wants_available_layers(question):
    """
    Check if the user is asking which configured layers are available.
    """
    text = (question or "").strip().lower()
    if "layer" not in text:
        return False
    triggers = ("available", "which", "what", "list", "have", "i have", "my")
    return any(token in text for token in triggers)
