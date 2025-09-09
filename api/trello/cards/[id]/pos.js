// /api/trello/cards/[id]/pos.js
export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Use PUT' });
  }

  try {
    const { id } = req.query;
    const { pos } = req.body || {};

    if (!id) return res.status(400).json({ error: 'Missing card id' });
    if (!pos) return res.status(400).json({ error: 'Missing pos (e.g., "top", "bottom", or a number)' });

    const key = process.env.TRELLO_KEY;
    const token = process.env.TRELLO_TOKEN;
    if (!key || !token) return res.status(500).json({ error: 'Missing Trello credentials' });

    const url = `https://api.trello.com/1/cards/${encodeURIComponent(
      id
    )}?pos=${encodeURIComponent(pos)}&key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;

    const trelloRes = await fetch(url, { method: 'PUT' });
    const txt = await trelloRes.text();

    if (!trelloRes.ok) {
      return res.status(trelloRes.status).json({ error: txt || 'Trello error' });
    }
    try { return res.status(200).json(JSON.parse(txt)); }
    catch { return res.status(200).send(txt); }
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
