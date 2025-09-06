export default async function handler(req, res) {
  // CORS for convenience
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { path = [] } = req.query;
  const method = req.method || "GET";

  const key = process.env.TRELLO_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) {
    return res.status(500).json({ error: "Missing TRELLO_KEY or TRELLO_TOKEN env vars." });
  }

  const base = "https://api.trello.com/1";
  const targetPath = Array.isArray(path) ? path.join("/") : String(path);
  const url = new URL(`${base}/${targetPath}`);

  // Forward query params (except 'path') + add key/token
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== "path") url.searchParams.set(k, String(v));
  }
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);

  const init = { method, headers: { "Content-Type": "application/json" } };
  if (method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(req.body ?? {});
  }

  try {
    const r = await fetch(url.toString(), init);
    const text = await r.text();
    try {
      return res.status(r.status).json(JSON.parse(text));
    } catch {
      return res.status(r.status).send(text);
    }
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Proxy error" });
  }
}
