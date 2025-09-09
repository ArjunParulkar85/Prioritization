// api/storage/load.js
import { Firestore } from "@google-cloud/firestore";

let db;
function getDb() {
  if (db) return db;
  const { GCP_SA_CLIENT_EMAIL, GCP_SA_PRIVATE_KEY, GCP_PROJECT_ID } = process.env;
  if (!GCP_SA_CLIENT_EMAIL || !GCP_SA_PRIVATE_KEY || !GCP_PROJECT_ID) {
    throw new Error("Missing GCP env vars (GCP_SA_CLIENT_EMAIL, GCP_SA_PRIVATE_KEY, GCP_PROJECT_ID).");
  }
  const privateKey = GCP_SA_PRIVATE_KEY.replace(/\\n/g, "\n");
  db = new Firestore({
    projectId: GCP_PROJECT_ID,
    credentials: { client_email: GCP_SA_CLIENT_EMAIL, private_key: privateKey },
  });
  return db;
}

export default async function handler(req, res) {
  const { FIRESTORE_COLLECTION = "charterxo_prioritizer", FIRESTORE_DOC_ID = "default" } = process.env;

  try {
    const db = getDb();
    const snap = await db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).get();
    if (!snap.exists) return res.status(404).json({ error: "No saved state found" });

    const { rows, weights, dark, updatedAt } = snap.data() || {};
    return res.status(200).json({ data: { rows, weights, dark }, updatedAt });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Load failed" });
  }
}
