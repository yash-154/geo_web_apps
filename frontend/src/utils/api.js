export async function getJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => null);
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function postJson(url, payload = {}, opts = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    ...opts,
  });
  let json;
  try {
    json = await res.json();
  } catch (e) {
    const text = await res.text().catch(() => null);
    throw new Error(text || 'Invalid JSON response');
  }
  if (!res.ok) throw new Error(json?.error || JSON.stringify(json) || `Request failed: ${res.status}`);
  return json;
}
