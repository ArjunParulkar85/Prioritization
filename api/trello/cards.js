export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { idList, name, desc } = req.body;
  const { TRELLO_KEY, TRELLO_TOKEN } = process.env;
  try {
    const url = `https://api.trello.com/1/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}&idList=${idList}&name=${encodeURIComponent(name)}&desc=${encodeURIComponent(desc)}`;
    const resp = await fetch(url, { method: "POST" });
    const data = await resp.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
