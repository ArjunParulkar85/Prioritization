export default async function handler(req, res) {
  const key = process.env.TRELLO_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) return res.status(500).json({ error: "Missing TRELLO_KEY or TRELLO_TOKEN" });

  const url = new URL("https://api.trello.com/1/members/me/boards");
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);

  try {
    const r = await fetch(url.toString());
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Proxy error" });
  }
}
