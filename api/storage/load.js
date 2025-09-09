// /api/storage/load.js
import { Firestore } from '@google-cloud/firestore';

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
  try {
    const { db, error } = getDb();
    if (error) return res.status(500).json({ error });

    const collection = process.env.FIRESTORE_COLLECTION || 'charterxo_prioritizer';
    const docId = process.env.FIRESTORE_DOC_ID || 'default';

    const snap = await db.collection(collection).doc(docId).get();
    if (!snap.exists) {
      return res.status(200).json({ data: { rows: [], weights: null, dark: false }, updatedAt: null });
    }
    const data = snap.data();
    return res.status(200).json({ data, updatedAt: snap.updateTime?.toDate?.() ?? null });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
