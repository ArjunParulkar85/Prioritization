// src/App.jsx
import React, { useMemo, useState, useEffect } from "react";

const BRAND = "#D76400";
const STORAGE_KEY = "cxo_prioritizer_v2";

// Factor weights (default = 1)
const DEFAULT_WEIGHTS = { wI: 1, wR: 1, wE: 1, wU: 1, wA: 1 };

// Tooltips/defs
const FACTOR_DEFS = {
  impact:
    "How much will this move the needle on key business goals and solve a real user problem? (1–5 higher is better)",
  reach:
    "How many users or customers will be affected in a given period? (1–5 higher = more people)",
  effort:
    "Total work to deliver (dev/design/QA). T-shirt sizes: XS=1, S=2, M=3, L=5, XL=8. Higher = more effort.",
  urgency:
    "How critical is this right now? Used to flag blockers or time-sensitive work. Low=1, Medium=2, High=3, Critical=4.",
  align:
    "How well does this support current strategic goals (quarter/year)? (1–5 higher = more aligned)",
};

// Effort & Urgency dropdown maps
const EFFORT_OPTIONS = [
  { label: "XS", value: 1 },
  { label: "S", value: 2 },
  { label: "M", value: 3 },
  { label: "L", value: 5 },
  { label: "XL", value: 8 },
];
const URGENCY_OPTIONS = [
  { label: "Low", value: 1 },
  { label: "Medium", value: 2 },
  { label: "High", value: 3 },
  { label: "Critical", value: 4 },
];

// Helpers
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function startRow(
  title = "New Use Case",
  description = "",
  imported = false,
  extra = {}
) {
  return {
    id: Math.random().toString(36).slice(2),
    name: title,
    notes: description,
    // New factors (fresh defaults):
    impact: 3,
    reach: 3,
    effort: 3, // M
    urgency: 2, // Medium
    align: 3,
    // selection flags
    selected: false,
    imported,
    ...extra, // e.g., trelloId
  };
}

// Weighted formula; returns {score, raw, maxRaw}
function computeScore(row, W) {
  const I = Number(row.impact || 0);
  const R = Number(row.reach || 0);
  const E = Math.max(1, Number(row.effort || 1));  // avoid divide by zero
  const U = Number(row.urgency || 0);
  const A = Number(row.align || 0);

  const wI = Number(W.wI || 1);
  const wR = Number(W.wR || 1);
  const wE = Math.max(0.0001, Number(W.wE || 1));
  const wU = Number(W.wU || 1);
  const wA = Number(W.wA || 1);

  const raw = ((wI * I) * (wR * R) + (wU * U) + (wA * A)) / (wE * E);

  // compute a theoretical max for 0..100 scaling
  const maxRaw = ((wI * 5) * (wR * 5) + (wU * 4) + (wA * 5)) / (wE * 1);
  const score = Math.round(clamp01(raw / (maxRaw || 1)) * 100);
  return { score, raw, maxRaw };
}

// Red → Orange → Yellow → Magenta → Purple → Blue
function colorForScore(score) {
  const stops = ["#FF0000", "#FF7F00", "#FFEA00", "#FF00FF", "#8B00FF", "#007BFF"];
  const t = clamp01(score / 100);
  const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
  const localT = (t * (stops.length - 1)) - seg;
  const from = hexToRgb(stops[seg]);
  const to = hexToRgb(stops[seg + 1]);
  const r = Math.round(from.r + (to.r - from.r) * localT);
  const g = Math.round(from.g + (to.g - from.g) * localT);
  const b = Math.round(from.b + (to.b - from.b) * localT);
  return `rgb(${r}, ${g}, ${b})`;
}
function hexToRgb(hex) {
  const m = hex.replace("#", "");
  const int = parseInt(m, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

const loadSaved = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } };
const saveNow = (payload) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {} };

export default function App() {
  const saved = typeof window !== "undefined" ? loadSaved() : null;

  // Theme/UI
  const [dark, setDark] = useState(() => saved?.dark ?? true);
  const [showWeights, setShowWeights] = useState(false);
  const [query, setQuery] = useState("");

  // Model state
  const [weights, setWeights] = useState(() => saved?.weights ?? DEFAULT_WEIGHTS);
  const [rows, setRows] = useState(() =>
    saved?.rows ?? [
      startRow("Autonomous Case Triage in Service Cloud", "Auto-classify, route, and draft replies"),
      startRow("Sales Email Agent for Pipeline Acceleration", "Auto-personalize emails and suggest next best actions"),
    ]
  );

  // Trello state
  const [status, setStatus] = useState("");
  const [boards, setBoards] = useState([]);
  const [lists, setLists] = useState([]);
  const [boardId, setBoardId] = useState("");
  const [listId, setListId] = useState("");

  // Sorting state
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => { saveNow({ rows, weights, dark }); }, [rows, weights, dark]);

  // Score rows
  const scored = useMemo(() => rows.map(r => {
    const { score } = computeScore(r, weights);
    return { ...r, score };
  }), [rows, weights]);

  // Search filter
  const searched = useMemo(() => {
    if (!query.trim()) return scored;
    const q = query.toLowerCase();
    return scored.filter(r =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.notes || "").toLowerCase().includes(q)
    );
  }, [scored, query]);

  // Sort
  const sorted = useMemo(() => {
    const A = [...searched];
    A.sort((a, b) => {
      const ax = sortKey === "name" ? String(a.name || "").toLowerCase() : a[sortKey];
      const bx = sortKey === "name" ? String(b.name || "").toLowerCase() : b[sortKey];
      if (ax < bx) return sortDir === "asc" ? -1 : 1;
      if (ax > bx) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return A;
  }, [searched, sortKey, sortDir]);

  // Mutators
  function setW(key, val) { setWeights(w => ({ ...w, [key]: Number(val) })); }
  function updateRow(id, patch) { setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r)); }
  function addRow() { setRows(rs => [startRow(), ...rs]); }
  function removeRow(id) { setRows(rs => rs.filter(r => r.id !== id)); }
  function toggleSelect(id, v) { updateRow(id, { selected: v }); }
  function selectAll() { setRows(rs => rs.map(r => ({ ...r, selected: true }))); }
  function clearSelection() { setRows(rs => rs.map(r => ({ ...r, selected: false }))); }
  function selectAllImported() { setRows(rs => rs.map(r => r.imported ? { ...r, selected: true } : r)); }
  function deleteSelectedLocal() {
    const n = rows.filter(r => r.selected).length;
    setRows(rs => rs.filter(r => !r.selected));
    setStatus(n ? `🗑️ Deleted ${n} selected row(s) locally.` : "No selected rows to delete.");
  }
  function deleteAllImportedLocal() {
    const n = rows.filter(r => r.imported).length;
    setRows(rs => rs.filter(r => !r.imported));
    setStatus(n ? `🗑️ Deleted ${n} imported row(s) locally.` : "No imported rows to delete.");
  }
  function resetAll() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setDark(true);
    setWeights(DEFAULT_WEIGHTS);
    setRows([startRow(), startRow("Example Feature", "Describe the value here")]);
    setStatus("🔄 Data reset (local).");
  }

  // Cloud SAVE/LOAD
  async function saveToCloud() {
    try {
      const r = await fetch("/api/storage/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { rows, weights, dark } }),
      });
      const j = await r.json();
      setStatus(r.ok ? "☁️ Saved to GCP." : `❌ Save failed: ${j.error || r.status}`);
    } catch (e) { setStatus(`❌ Save failed: ${e.message || e}`); }
  }
  async function loadFromCloud() {
    try {
      const r = await fetch("/api/storage/load");
      const j = await r.json();
      if (!r.ok) return setStatus(`❌ Load failed: ${j.error || r.status}`);
      const { rows: R, weights: W, dark: D } = j.data || {};
      if (R) setRows(R);
      if (W) setWeights(W);
      if (typeof D === "boolean") setDark(D);
      setStatus("☁️ Loaded from GCP.");
    } catch (e) { setStatus(`❌ Load failed: ${e.message || e}`); }
  }

  // Trello
  async function fetchBoards() {
    setStatus("Connecting…");
    try {
      const r = await fetch("/api/trello/members/me/boards");
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setBoards(data); setStatus(`✅ Connected. Found ${data.length} boards.`);
    } catch (e) { setStatus(`❌ ${e.message || e}`); }
  }
  async function fetchListsFor(bid) {
    setBoardId(bid); setLists([]); setListId("");
    if (!bid) return;
    setStatus("Loading lists…");
    try {
      const r = await fetch(`/api/trello/boards/${bid}/lists`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setLists(data); setStatus(`📋 ${data.length} lists loaded.`);
    } catch (e) { setStatus(`❌ ${e.message || e}`); }
  }
  async function importFromList() {
    if (!listId) { setStatus("⚠️ Choose a list first."); return; }
    setStatus("Importing cards…");
    try {
      const r = await fetch(`/api/trello/lists/${listId}/cards`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const imported = data.map(c => ({
        ...startRow(c.name || "Card", c.desc || "", true),
        trelloId: c.id
      }));
      setRows(prev => [...imported, ...prev]);
      setStatus(`✅ Imported ${imported.length} cards.`);
    } catch (e) { setStatus(`❌ ${e.message || e}`); }
  }
  async function pushSelectedToTrello() {
    const chosen = sorted.filter(r => r.selected);
    if (!listId) return setStatus("⚠️ Choose a destination list first.");
    if (!chosen.length) return setStatus("⚠️ Select one or more rows.");
    setStatus("Creating Trello cards…");
    let ok = 0, fail = 0;
    for (const r of chosen) {
      try {
        const desc = `Priority Score: ${r.score}/100\n\n${r.notes || ""}`;
        const res = await fetch("/api/trello/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idList: listId, name: r.name, desc }),
        });
        if (!res.ok) throw new Error(await res.text());
        ok++;
      } catch { fail++; }
    }
    setStatus(`✅ Created ${ok} card(s)${fail ? `, ${fail} failed` : ""}.`);
  }
  async function pushOrderToTrello() {
    if (!listId) { setStatus("⚠️ Choose a list first."); return; }
    const ordered = sorted.filter(r => r.imported && r.trelloId);
    if (!ordered.length) return setStatus("No imported cards with Trello IDs to reorder.");
    setStatus("Reordering cards on Trello…");
    try {
      // bottom → top, pos='top' so final order matches the table
      for (let i = ordered.length - 1; i >= 0; i--) {
        const r = ordered[i];
        const res = await fetch(`/api/trello/cards/${r.trelloId}/pos`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pos: "top" }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      setStatus(`✅ Reordered ${ordered.length} card(s) on Trello to match the app.`);
    } catch (e) {
      setStatus(`❌ Reorder failed: ${e.message || e}`);
    }
  }

  // Theme
  const theme = dark
    ? { background:"#0b0b0c", panel:"#0f172a", text:"#e5e7eb", border:"#273244", muted:"#8aa0b2", input:"#0f172a", inputBorder:"#334155" }
    : { background:"#f6f7fb", panel:"#ffffff", text:"#0f172a", border:"#e2e8f0", muted:"#64748b", input:"#ffffff", inputBorder:"#cbd5e1" };

  return (
    <div style={{ minHeight:"100vh", background: theme.background, color: theme.text, fontFamily:"Inter, ui-sans-serif, system-ui, Arial", padding:"12px 12px" }}>
      <style>{`
        :root { --border:${theme.border}; --panel:${theme.panel}; --text:${theme.text}; --muted:${theme.muted}; --brand:${BRAND}; --input:${theme.input}; --inputBorder:${theme.inputBorder}; }
        * { box-sizing: border-box; }
        .wrap { max-width: min(1920px, 98.5vw); margin: 0 auto; }
        .actions { display:flex; gap:8px; flex-wrap:wrap; }
        .cx-btn { padding:10px 14px; border:1px solid var(--border); background:var(--panel); color:var(--text); border-radius:12px; cursor:pointer; }
        .cx-btn.primary { background:var(--brand); color:#fff; border-color:var(--brand); }
        .cx-btn.ghost { background:transparent; }
        .cx-input, .cx-select, .cx-number, .cx-textarea {
          width:100%; background:var(--input); color:var(--text);
          border:1px solid var(--inputBorder); border-radius:12px; padding:10px 12px; outline:none;
          transition: border-color .15s, box-shadow .15s; line-height:1.25;
        }
        .cx-input:focus, .cx-select:focus, .cx-number:focus, .cx-textarea:focus { border-color:var(--brand); box-shadow:0 0 0 3px ${BRAND}22; }
        .cx-number { width:62px; text-align:center; padding:8px 10px; }
        .cx-textarea { resize: vertical; min-height: 46px; }
        .title-textarea { overflow:hidden; resize:none; min-height: 46px; }
        .scroll-viewport { max-height: 66vh; overflow: auto; }
        .cx-table { width:100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
        .cx-table thead th { position: sticky; top: 0; background:var(--panel); z-index: 2; }
        .cell { padding: 10px 12px; vertical-align: top; }
        .col-score{ width:76px; } .col-sel{ width:60px; } .col-num{ width:90px; } .col-del{ width:96px; }
        .cx-chip { display:inline-flex; align-items:center; justify-content:center; min-width:46px; height:46px; font-weight:800; border-radius:999px; color:#fff; }
        .tooltip { position: relative; cursor: help; }
        .tooltip .i { background:var(--border); color:var(--text); border-radius:8px; padding:0 6px; font-size:11px }
        .tooltip:hover .tip { opacity:1; transform: translateY(0); pointer-events:auto; }
        .tip {
          position:absolute; left:0; top:100%; margin-top:6px; max-width:280px;
          background:var(--panel); color:var(--text); border:1px solid var(--border);
          border-radius:10px; padding:10px 12px; font-size:12px; line-height:1.35; opacity:0; transform: translateY(-4px);
          pointer-events:none; transition: opacity .12s ease, transform .12s ease; box-shadow: 0 6px 18px rgba(0,0,0,.12);
        }
        .scroll-viewport::-webkit-scrollbar { width: 12px; height: 12px; }
        .scroll-viewport::-webkit-scrollbar-track { background: var(--panel); border-left:1px solid var(--border); }
        .scroll-viewport::-webkit-scrollbar-thumb { background: linear-gradient(180deg, ${BRAND}, ${BRAND}AA); border-radius: 8px; border: 3px solid var(--panel); }
        .scroll-viewport { scrollbar-width: thin; scrollbar-color: ${BRAND} var(--panel); }
        /* Drawer */
        .drawer { position: fixed; right: 0; top: 0; bottom: 0; width: 360px; background: var(--panel); border-left: 1px solid var(--border); transform: translateX(100%); transition: transform .2s ease; z-index: 50; padding: 16px; }
        .drawer.open { transform: translateX(0); }
        .drawer h3 { margin: 0 0 10px 0; }
      `}</style>

      <div className="wrap">
        {/* Header bar */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:999, background: BRAND }} />
            <h1 style={{ margin:0, letterSpacing:.3 }}>
              <span>CharterXO </span>
              <span style={{ color: BRAND, fontWeight:800 }}>Backlog Intelligence</span>
            </h1>
          </div>

          {/* Header actions & search */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto auto", gap:8, alignItems:"center", width:"min(900px, 60vw)" }}>
            <input
              className="cx-input"
              placeholder="Search title or description…"
              value={query}
              onChange={(e)=>setQuery(e.target.value)}
            />
            <button className="cx-btn" onClick={()=>setShowWeights(s=>!s)}>Weights</button>
            <button className="cx-btn" onClick={()=>setDark(d=>!d)}>{dark ? "🌙 Dark" : "☀️ Light"}</button>
            <button className="cx-btn" onClick={saveToCloud}>Save to Cloud</button>
            <button className="cx-btn" onClick={loadFromCloud}>Load from Cloud</button>
          </div>
        </div>

        {/* Trello + sorting + bulk actions */}
        <div style={{ background:theme.panel, border:`1px solid ${theme.border}`, borderRadius:14, padding:12, marginBottom:12 }}>
          <div className="actions">
            <button className="cx-btn primary" onClick={fetchBoards}>Connect Trello</button>
            <select className="cx-select" value={boardId} onChange={(e)=>fetchListsFor(e.target.value)} style={{ minWidth:260 }}>
              <option value="">— Choose board —</option>
              {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className="cx-select" value={listId} onChange={(e)=>setListId(e.target.value)} style={{ minWidth:240 }}>
              <option value="">— Choose list —</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="cx-btn" onClick={importFromList}>Import from list</button>

            <select className="cx-select" value={sortKey} onChange={(e)=>setSortKey(e.target.value)} style={{ minWidth:220 }}>
              <option value="score">Sort by: Priority Score</option>
              <option value="name">Title (A→Z)</option>
              <option value="impact">Impact</option>
              <option value="reach">Reach</option>
              <option value="effort">Effort</option>
              <option value="urgency">Urgency</option>
              <option value="align">Alignment</option>
            </select>
            <select className="cx-select" value={sortDir} onChange={(e)=>setSortDir(e.target.value)} style={{ width:140 }}>
              <option value="desc">High → Low</option>
              <option value="asc">Low → High</option>
            </select>
          </div>

          <div className="actions" style={{ marginTop:10 }}>
            <button className="cx-btn" onClick={selectAll}>Select All</button>
            <button className="cx-btn" onClick={clearSelection}>Clear Selection</button>
            <button className="cx-btn" onClick={selectAllImported}>Select All Imported</button>
            <button className="cx-btn" onClick={deleteSelectedLocal}>Delete Selected (Local)</button>
            <button className="cx-btn" onClick={deleteAllImportedLocal}>Delete All Imported (Local)</button>
            <button className="cx-btn ghost" onClick={resetAll}>Reset Data</button>
          </div>

          <div style={{ marginTop:8, color:theme.muted, minHeight:22 }}>{status}</div>
        </div>

        {/* Drawer with weight sliders */}
        <div className={`drawer ${showWeights ? "open" : ""}`}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <h3>Weights</h3>
            <button className="cx-btn" onClick={()=>setShowWeights(false)}>Close</button>
          </div>
          {[
            ["Impact (wI)","wI"],["Reach (wR)","wR"],["Effort (wE)","wE"],["Urgency (wU)","wU"],["Alignment (wA)","wA"],
          ].map(([label,key])=>(
            <div key={key} style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, color:theme.muted, marginBottom:6 }}>{label}</div>
              <input type="range" min="0" max="4" step="0.1" value={weights[key]} onChange={(e)=>setW(key, e.target.value)} style={{ width:"100%" }} />
              <div style={{ textAlign:"right", fontSize:12 }}>{weights[key]}</div>
            </div>
          ))}
          <div style={{ fontSize:12, color:theme.muted }}>Tip: all 1’s give a simple, clean model. Increase a slider to emphasize that factor.</div>
        </div>

        {/* Table */}
        <div style={{ background:theme.panel, border:`1px solid ${theme.border}`, borderRadius:14, overflow:"hidden" }}>
          <div className="scroll-viewport">
            <table className="cx-table">
              <thead>
                <tr style={{ textAlign:"left", color:theme.muted }}>
                  <th className="cell col-score">Score</th>
                  <th className="cell col-sel">Sel</th>
                  <th className="cell">Use Case / Trello Title</th>
                  <th className="cell">Description</th>
                  <th className="cell col-num">Impact</th>
                  <th className="cell col-num">Reach</th>
                  <th className="cell col-num">Effort</th>
                  <th className="cell col-num">Urgency</th>
                  <th className="cell col-num">Alignment</th>
                  <th className="cell col-del">—</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.id} style={{ borderTop:`1px solid ${theme.border}` }}>
                    <td className="cell">
                      <div className="cx-chip" style={{ background: colorForScore(r.score) }}>{r.score}</div>
                    </td>
                    <td className="cell">
                      <input type="checkbox" checked={!!r.selected} onChange={(e)=>toggleSelect(r.id, e.target.checked)} />
                    </td>
                    <td className="cell">
                      <textarea
                        className="cx-textarea title-textarea"
                        rows={1}
                        value={r.name}
                        onChange={(e)=>updateRow(r.id,{ name:e.target.value })}
                        onInput={(e)=>{ e.target.style.height='auto'; e.target.style.height=(e.target.scrollHeight)+'px'; }}
                      />
                    </td>
                    <td className="cell">
                      <textarea
                        className="cx-textarea"
                        rows={3}
                        value={r.notes || ""}
                        onChange={(e)=>updateRow(r.id,{ notes:e.target.value })}
                      />
                    </td>

                    {/* Impact */}
                    <td className="cell">
                      <input className="cx-number" type="number" min="1" max="5" value={r.impact ?? 3}
                        onChange={(e)=>updateRow(r.id,{ impact:Number(e.target.value) })} />
                    </td>
                    {/* Reach */}
                    <td className="cell">
                      <input className="cx-number" type="number" min="1" max="5" value={r.reach ?? 3}
                        onChange={(e)=>updateRow(r.id,{ reach:Number(e.target.value) })} />
                    </td>
                    {/* Effort dropdown */}
                    <td className="cell">
                      <select className="cx-select" value={r.effort ?? 3}
                        onChange={(e)=>updateRow(r.id,{ effort:Number(e.target.value) })}>
                        {EFFORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    {/* Urgency dropdown */}
                    <td className="cell">
                      <select className="cx-select" value={r.urgency ?? 2}
                        onChange={(e)=>updateRow(r.id,{ urgency:Number(e.target.value) })}>
                        {URGENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    {/* Alignment */}
                    <td className="cell">
                      <input className="cx-number" type="number" min="1" max="5" value={r.align ?? 3}
                        onChange={(e)=>updateRow(r.id,{ align:Number(e.target.value) })} />
                    </td>
                    <td className="cell">
                      <button className="cx-btn primary" onClick={()=>removeRow(r.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer actions */}
        <div className="actions" style={{ marginTop:12 }}>
          <button className="cx-btn primary" onClick={addRow}>Add Row</button>
          <button className="cx-btn" onClick={pushSelectedToTrello}>Push selected to Trello</button>
          <button className="cx-btn" onClick={pushOrderToTrello}>Push Order to Trello</button>
          <div style={{ color:theme.muted, lineHeight:"36px" }}>{status}</div>
        </div>
      </div>
    </div>
  );
}
