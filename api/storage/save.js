// api/storage/save.js
import { Firestore } from "@google-cloud/firestore";

let db;
/** Lazy init Firestore using service-account creds from env */
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
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { FIRESTORE_COLLECTION = "charterxo_prioritizer", FIRESTORE_DOC_ID = "default" } = process.env;

  const body = await readJson(req);
  const payload = body?.data;
  if (!payload) return res.status(400).json({ error: "Missing { data } in JSON body" });

  try {
    const db = getDb();
    const ref = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID);

    await ref.set(
      {
        ...payload, // expect { rows, weights, dark }
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true, id: ref.id });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Save failed" });
  }
}

async function readJson(req) {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const text = Buffer.concat(chunks).toString("utf8");
    return JSON.parse(text || "{}");
  } catch {
    return null;
  }
}
