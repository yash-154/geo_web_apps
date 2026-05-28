def build_chat_messages(messages, question, extra_system_message=None):
    """
    Build a list of chat messages in OpenAI format.
    Includes a base system prompt, optional extra system context, recent message history, and the current question.
    """
    chat_msgs = [
        {
            "role": "system",
            "content": "You are Smart City WebGIS Assistant. Answer briefly and clearly.",
        }
    ]
    if extra_system_message:
        chat_msgs.append({"role": "system", "content": extra_system_message})

    for item in messages[-8:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        if role not in {"user", "assistant"}:
            continue
        chat_msgs.append({"role": role, "content": text})
    chat_msgs.append({"role": "user", "content": question})
    return chat_msgs
