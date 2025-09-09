// /api/storage/save.js
import { Firestore } from '@google-cloud/firestore';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

function getDb() {
  const projectId = process.env.GCP_PROJECT_ID;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
  const client_email = process.env.GCP_SA_CLIENT_EMAIL;
  const private_key = process.env.GCP_SA_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !client_email || !private_key) {
    return { error: 'Missing GCP credentials env vars.' };
  }

  const db = new Firestore({
    projectId,
    databaseId,                  // <<< use named database
    credentials: { client_email, private_key },
  });
  return { db, projectId, databaseId };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }
  try {
    const { db, error } = getDb();
    if (error) return res.status(500).json({ error });

    const collection = process.env.FIRESTORE_COLLECTION || 'charterxo_prioritizer';
    const docId = process.env.FIRESTORE_DOC_ID || 'default';

    const { data } = req.body || {};
    if (!data) return res.status(400).json({ error: 'Missing data' });

    await db.collection(collection).doc(docId).set(data, { merge: true });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
