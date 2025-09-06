export default async function handler(req, res) {
  const { id } = req.query; // boardId
  const { TRELLO_KEY, TRELLO_TOKEN } = process.env;
  try {
    const resp = await fetch(`https://api.trello.com/1/boards/${id}/lists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`);
    const data = await resp.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
