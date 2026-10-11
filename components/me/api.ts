// Small fetch helper for the /me actions. Routes owned by T2 may not be deployed yet: a 404 becomes a
// friendly message instead of a crash, so the page works end to end as soon as they land.

export async function postJSON(url: string, body: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 404 && !res.headers.get("content-type")?.includes("json")) {
      return { ok: false, error: "This step isn’t live yet. Try again in a bit." };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { error?: string }).error ?? "Something went wrong. Please try again." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Can’t reach the server. Check your connection." };
  }
}
