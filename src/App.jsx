// src/App.jsx
import React, { useMemo, useState, useEffect } from "react";

const BRAND = "#D76400";
const STORAGE_KEY = "cxo_prioritizer_v1"; // local convenience cache

const DEFAULT_WEIGHTS = {
  impact: 25, ttv: 15, feasibility: 15, data: 10, risk: 10, align: 15, buyin: 10,
};

// Short definitions for tooltips
const FACTOR_DEFS = {
  impact: "Business value if delivered. Consider revenue, cost savings, NPS, risk reduction. (0–5 higher is better)",
  ttv: "Time-to-Value: how quickly value is realized after starting. (0–5 higher = faster)",
  feasibility: "Likelihood of successful delivery with current tech, skills, and constraints. (0–5 higher = easier)",
  data: "Data readiness/quality and access. (0–5 higher = better/cleaner/accessible)",
  risk: "Regulatory, compliance, security, or brand risk. (0–5 higher = riskier; reversed in score)",
  align: "Strategic alignment with CharterXO goals and roadmap. (0–5 higher = more aligned)",
  buyin: "Stakeholder enthusiasm and sponsorship. (0–5 higher = stronger support)",
};

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function scoreRow(r, w, total) {
  const n = {
    impact: clamp01((r.impact ?? 0) / 5),
    ttv: clamp01((r.ttv ?? 0) / 5),
    feasibility: clamp01((r.feasibility ?? 0) / 5),
    data: clamp01((r.data ?? 0) / 5),
    risk: 1 - clamp01((r.risk ?? 0) / 5), // reversed
    align: clamp01((r.align ?? 0) / 5),
    buyin: clamp01((r.buyin ?? 0) / 5),
  };
  const weighted =
    n.impact * w.impact + n.ttv * w.ttv + n.feasibility * w.feasibility +
    n.data * w.data + n.risk * w.risk + n.align * w.align + n.buyin * w.buyin;
  const score = total ? Math.round((weighted / total) * 100) : 0;
  const effort = (6 - ((r.feasibility ?? 0) + (r.ttv ?? 0))) + (r.cost ?? 3);
  const value = Math.round(((r.impact ?? 0) + (r.align ?? 0)) * 10);
  return { ...r, score, effort, value };
}
function startRow(name = "New Use Case", description = "", seed = 3) {
  return {
    id: Math.random().toString(36).slice(2),
    name, notes: description,
    impact: seed, ttv: seed, feasibility: seed, data: seed, risk: seed, align: seed, buyin: seed, cost: seed,
    selected: false,
  };
}

// local storage helpers
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } };
const saveNow = (payload) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {} };

// score → color (Red high priority → Orange → Yellow → Green low)
function scoreColor(score) {
  if (score >= 75) return "#E02424";   // red
  if (score >= 50) return "#F59E0B";   // orange
  if (score >= 25) return "#FBBF24";   // yellow
  return "#10B981";                    // green
}

export default function App() {
  const saved = typeof window !== "undefined" ? loadSaved() : null;

  const [dark, setDark] = useState(() => saved?.dark ?? false);
  const [weights, setWeights] = useState(() => saved?.weights ?? DEFAULT_WEIGHTS);
  const [rows, setRows] = useState(() =>
    saved?.rows ?? [
      startRow("Autonomous Case Triage in Service Cloud", "Auto-classify, route, and draft replies to reduce handle time", 4),
      startRow("Sales Email Agent for Pipeline Acceleration", "Auto-personalize emails and suggest next best actions", 3),
    ]
  );

  // Trello state
  const [status, setStatus] = useState("");
  const [boards, setBoards] = useState([]);
  const [lists, setLists] = useState([]);
  const [boardId, setBoardId] = useState("");
  const [listId, setListId] = useState("");

  // Sorting state
  const [sortKey, setSortKey] = useState("score"); // score | impact | ttv | feasibility | data | risk | align | buyin | cost | name
  const [sortDir, setSortDir] = useState("desc");  // asc | desc

  useEffect(() => { saveNow({ rows, weights, dark }); }, [rows, weights, dark]);

  const totalWeight = useMemo(() => Object.values(weights).reduce((a,b)=>a+(isNaN(b)?0:b),0), [weights]);
  const computed = useMemo(() => rows.map(r => scoreRow(r, weights, totalWeight)), [rows, weights, totalWeight]);

  const sorted = useMemo(() => {
    const copy = [...computed];
    copy.sort((a, b) => {
      const A = (sortKey === "name") ? String(a.name || "").toLowerCase() : a[sortKey];
      const B = (sortKey === "name") ? String(b.name || "").toLowerCase() : b[sortKey];
      if (A < B) return sortDir === "asc" ? -1 : 1;
      if (A > B) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [computed, sortKey, sortDir]);

  // UI helpers
  function setWeight(k, v) { setWeights(w => ({ ...w, [k]: Number(v) })); }
  function updateRow(id, patch) { setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r)); }
  function addRow() { setRows(rs => [startRow(), ...rs]); }
  function removeRow(id) { setRows(rs => rs.filter(r => r.id !== id)); }
  function toggleSelect(id, v) { updateRow(id, { selected: v }); }
  function resetAll() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setDark(false);
    setWeights(DEFAULT_WEIGHTS);
    setRows([
      startRow("Autonomous Case Triage in Service Cloud", "Auto-classify, route, and draft replies", 4),
      startRow("Sales Email Agent for Pipeline Acceleration", "Auto-personalize emails and suggest next best actions", 3),
    ]);
    setStatus("🔄 Data reset (local).");
  }

  // Cloud SAVE / LOAD (Firestore via API)
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

  // Trello calls
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
      const imported = data.map(c => startRow(c.name || "Card", c.desc || "", 3));
      setRows(prev => [...imported, ...prev]);
      setStatus(`✅ Imported ${imported.length} cards.`);
    } catch (e) { setStatus(`❌ ${e.message || e}`); }
  }
  async function pushSelected() {
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

  const theme = dark
    ? { background:"#0b0b0c", panel:"#0f172a", text:"#e5e7eb", border:"#273244", muted:"#8aa0b2", input:"#0f172a", inputBorder:"#334155" }
    : { background:"#f8fafc", panel:"#ffffff", text:"#0f172a", border:"#e2e8f0", muted:"#64748b", input:"#ffffff", inputBorder:"#cbd5e1" };

  return (
    <div style={{ minHeight:"100vh", background: theme.background, color: theme.text, fontFamily:"Inter, ui-sans-serif, system-ui, Arial", padding:24 }}>
      <style>{`
        .cx-btn { padding:8px 12px; border:1px solid ${theme.border}; background:${theme.panel}; color:${theme.text}; border-radius:10px; cursor:pointer; }
        .cx-btn.primary { background:${BRAND}; color:#fff; border-color:${BRAND}; }
        .cx-btn.ghost { background:transparent; }
        .cx-input, .cx-select, .cx-number, .cx-textarea {
          width:100%; background:${theme.input}; color:${theme.text};
          border:1px solid ${theme.inputBorder}; border-radius:10px; padding:8px 10px; outline:none;
          transition: border-color .15s, box-shadow .15s;
        }
        .cx-input:focus, .cx-select:focus, .cx-number:focus, .cx-textarea:focus { border-color:${BRAND}; box-shadow:0 0 0 3px ${BRAND}22; }
        .cx-table thead th { position: sticky; top: 0; background:${theme.panel}; z-index: 2; }
        .cx-chip { display:inline-flex; align-items:center; justify-content:center; min-width:42px; height:42px; font-weight:800; border-radius:999px; color:#fff; }
        .tooltip { position: relative; cursor: help; }
        .tooltip:hover .tip { opacity:1; transform: translateY(0); pointer-events:auto; }
        .tip {
          position:absolute; left:0; top:100%; margin-top:6px; max-width:260px;
          background:${theme.panel}; color:${theme.text}; border:1px solid ${theme.border};
          border-radius:10px; padding:10px 12px; font-size:12px; line-height:1.35; opacity:0; transform: translateY(-4px);
          pointer-events:none; transition: opacity .12s ease, transform .12s ease; box-shadow: 0 6px 18px rgba(0,0,0,.12);
        }
      `}</style>

      <div style={{ maxWidth:1300, margin:"0 auto" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:999, background: BRAND }} />
            <h1 style={{ margin:0, letterSpacing:.3 }}>
              <span>CharterXO </span>
              <span style={{ color: BRAND, fontWeight:800 }}>Agentic Prioritization</span>
            </h1>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button className="cx-btn" onClick={()=>setDark(d=>!d)}>{dark ? "🌙 Dark" : "☀️ Light"}</button>
            <button className="cx-btn" onClick={saveToCloud}>Save to Cloud</button>
            <button className="cx-btn" onClick={loadFromCloud}>Load from Cloud</button>
            <button className="cx-btn ghost" onClick={resetAll}>Reset Data</button>
          </div>
        </div>

        {/* Trello + Sorting */}
        <div style={{ background:theme.panel, border:`1px solid ${theme.border}`, borderRadius:14, padding:12, marginBottom:14, display:"grid", gridTemplateColumns:"auto auto auto auto 1fr", gap:8, alignItems:"center" }}>
          <button className="cx-btn primary" onClick={fetchBoards}>Connect Trello</button>
          <select className="cx-select" value={boardId} onChange={(e)=>fetchListsFor(e.target.value)}>
            <option value="">— Choose board —</option>
            {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="cx-select" value={listId} onChange={(e)=>setListId(e.target.value)}>
            <option value="">— Choose list —</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button className="cx-btn" onClick={importFromList}>Import from list</button>

          <div style={{ display:"flex", gap:8, justifySelf:"end" }}>
            <select className="cx-select" value={sortKey} onChange={(e)=>setSortKey(e.target.value)} style={{ width:220 }}>
              <option value="score">Sort by: Priority Score</option>
              <option value="name">Title (A→Z)</option>
              <option value="impact">Impact</option>
              <option value="ttv">TTV</option>
              <option value="feasibility">Feasibility</option>
              <option value="data">Data</option>
              <option value="risk">Risk (reversed)</option>
              <option value="align">Alignment</option>
              <option value="buyin">Buy-in</option>
              <option value="cost">Cost</option>
            </select>
            <select className="cx-select" value={sortDir} onChange={(e)=>setSortDir(e.target.value)} style={{ width:130 }}>
              <option value="desc">High → Low</option>
              <option value="asc">Low → High</option>
            </select>
          </div>
        </div>

        {/* Weights with tooltips */}
        <div style={{ background:theme.panel, border:`1px solid ${theme.border}`, borderRadius:14, padding:14, marginBottom:14 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:14 }}>
            {[
              ["Impact","impact"],["TTV","ttv"],["Feasibility","feasibility"],
              ["Data","data"],["Risk (lower better)","risk"],["Alignment","align"],["Buy-in","buyin"],
            ].map(([label,key]) => (
              <div key={key}>
                <div className="tooltip" style={{ fontSize:12, color:theme.muted, display:"flex", alignItems:"center", gap:6 }}>
                  <span>{label}</span>
                  <span style={{ background:theme.border, color:theme.text, borderRadius:6, padding:"0 6px", fontSize:11 }}>i</span>
                  <div className="tip">{FACTOR_DEFS[key]}</div>
                </div>
                <input type="range" min="0" max="40" value={weights[key]} onChange={(e)=>setWeight(key, e.target.value)} style={{ width:"100%" }} />
                <div style={{ fontSize:12, textAlign:"right" }}>{weights[key]}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign:"right", fontSize:12, color:theme.muted, marginTop:6 }}>
            Total weight: {Object.values(weights).reduce((a,b)=>a+b,0)} (tip: ~100)
          </div>
        </div>

        {/* Table with sticky header + new column order */}
        <div style={{ background:theme.panel, border:`1px solid ${theme.border}`, borderRadius:14, overflow:"hidden" }}>
          <div style={{ maxHeight:"65vh", overflow:"auto" }}>
            <table className="cx-table" style={{ borderCollapse:"separate", borderSpacing:0, width:"100%" }}>
              <thead>
                <tr style={{ textAlign:"left", color:theme.muted }}>
                  <th style={{ padding:10, width:70 }}>Score</th>
                  <th style={{ padding:10, width:56 }}>Sel</th>
                  <th style={{ padding:10, minWidth:340 }}>Use Case / Trello Title</th>
                  <th style={{ padding:10, minWidth:420 }}>Description</th>
                  <th style={{ padding:10, width:90 }}>Impact</th>
                  <th style={{ padding:10, width:90 }}>TTV</th>
                  <th style={{ padding:10, width:90 }}>Feas.</th>
                  <th style={{ padding:10, width:90 }}>Data</th>
                  <th style={{ padding:10, width:90 }}>Risk</th>
                  <th style={{ padding:10, width:90 }}>Align</th>
                  <th style={{ padding:10, width:90 }}>Buy-in</th>
                  <th style={{ padding:10, width:90 }}>Cost</th>
                  <th style={{ padding:10, width:70 }}>—</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.id} style={{ borderTop:`1px solid ${theme.border}` }}>
                    {/* Score bubble (left) */}
                    <td style={{ padding:8 }}>
                      <div className="cx-chip" style={{ background: scoreColor(r.score) }}>{r.score}</div>
                    </td>

                    {/* Select */}
                    <td style={{ padding:8, verticalAlign:"top" }}>
                      <input type="checkbox" checked={!!r.selected} onChange={(e)=>toggleSelect(r.id, e.target.checked)} />
                    </td>

                    {/* Title */}
                    <td style={{ padding:8 }}>
                      <input className="cx-input" value={r.name} onChange={(e)=>updateRow(r.id,{ name:e.target.value })} />
                    </td>

                    {/* Description (moved earlier) */}
                    <td style={{ padding:8 }}>
                      <textarea className="cx-textarea" rows={3} value={r.notes||""} onChange={(e)=>updateRow(r.id,{ notes:e.target.value })} />
                    </td>

                    {/* Factors */}
                    {["impact","ttv","feasibility","data","risk","align","buyin","cost"].map(k=>(
                      <td key={k} style={{ padding:8, verticalAlign:"top" }}>
                        <input className="cx-number" type="number" min="0" max="5" value={r[k]??0} onChange={(e)=>updateRow(r.id,{ [k]:Number(e.target.value) })} />
                      </td>
                    ))}

                    {/* Delete */}
                    <td style={{ padding:8 }}>
                      <button className="cx-btn primary" onClick={()=>removeRow(r.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ display:"flex", gap:10, marginTop:12 }}>
          <button className="cx-btn primary" onClick={addRow}>Add Row</button>
          <button className="cx-btn" onClick={pushSelected}>Push selected to Trello</button>
          <div style={{ color:theme.muted, lineHeight:"36px" }}>{status}</div>
        </div>
      </div>
    </div>
  );
}
