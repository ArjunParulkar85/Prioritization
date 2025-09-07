import React, { useMemo, useState } from "react";

const BRAND = "#D76400";

const DEFAULT_WEIGHTS = {
  impact: 25, ttv: 15, feasibility: 15, data: 10, risk: 10, align: 15, buyin: 10,
};

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function scoreRow(r, w, total) {
  const n = {
    impact: clamp01((r.impact ?? 0) / 5),
    ttv: clamp01((r.ttv ?? 0) / 5),
    feasibility: clamp01((r.feasibility ?? 0) / 5),
    data: clamp01((r.data ?? 0) / 5),
    risk: 1 - clamp01((r.risk ?? 0) / 5),
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
function startRow(name = "New Use Case", owner = "", notes = "", seed = 3) {
  return {
    id: Math.random().toString(36).slice(2),
    name, owner, notes,
    impact: seed, ttv: seed, feasibility: seed, data: seed, risk: seed, align: seed, buyin: seed, cost: seed,
    selected: false,
  };
}

export default function App() {
  const [dark, setDark] = useState(false);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [rows, setRows] = useState([
    startRow("Autonomous Case Triage in Service Cloud", "CX Ops", "Auto-classify, route, draft replies", 4),
    startRow("Sales Email Agent for Pipeline Acceleration", "Sales Ops", "Personalization & next-best-action", 3),
  ]);

  // Trello state
  const [status, setStatus] = useState("");
  const [boards, setBoards] = useState([]);
  const [lists, setLists] = useState([]);
  const [boardId, setBoardId] = useState("");
  const [listId, setListId] = useState("");

  const totalWeight = useMemo(() => Object.values(weights).reduce((a,b)=>a+(isNaN(b)?0:b),0), [weights]);
  const scored = useMemo(() => rows.map(r => scoreRow(r, weights, totalWeight)).sort((a,b)=>b.score-a.score), [rows, weights, totalWeight]);

  // UI helpers
  function setWeight(k, v) { setWeights(w => ({ ...w, [k]: Number(v) })); }
  function updateRow(id, patch) { setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r)); }
  function addRow() { setRows(rs => [startRow(), ...rs]); }
  function removeRow(id) { setRows(rs => rs.filter(r => r.id !== id)); }
  function toggleSelect(id, v) { updateRow(id, { selected: v }); }

  // Trello calls (to your API)
  async function fetchBoards() {
    setStatus("Connecting…");
    try {
      const r = await fetch("/api/trello/members/me/boards");
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setBoards(data);
      setStatus(`✅ Connected. Found ${data.length} boards.`);
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
      setLists(data);
      setStatus(`📋 ${data.length} lists loaded.`);
    } catch (e) { setStatus(`❌ ${e.message || e}`); }
  }
  async function importFromList() {
    if (!listId) { setStatus("⚠️ Choose a list first."); return; }
    setStatus("Importing cards…");
    try {
      const r = await fetch(`/api/trello/lists/${listId}/cards`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const imported = data.map(c => startRow(c.name || "Card", "", c.desc || "", 3));
      setRows(prev => [...imported, ...prev]);
      setStatus(`✅ Imported ${imported.length} cards.`);
    } catch (e) { setStatus(`❌ ${e.message || e}`); }
  }
  async function pushSelected() {
    const chosen = scored.filter(r => r.selected);
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
    ? { background:"#0b0b0c", color:"#e5e7eb", border:"#334155", muted:"#94a3b8" }
    : { background:"#ffffff", color:"#0f172a", border:"#e2e8f0", muted:"#64748b" };

  return (
    <div style={{ minHeight:"100vh", background: theme.background, color: theme.color, fontFamily:"system-ui, Arial", padding:24 }}>
      <div style={{ maxWidth:1200, margin:"0 auto" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:999, background: BRAND }} />
            <h1 style={{ margin:0 }}>
              <span>CharterXO </span>
              <span style={{ color: BRAND }}>Agentic Prioritization</span>
            </h1>
          </div>
          <button onClick={()=>setDark(d=>!d)} style={{ padding:"6px 10px", border:`1px solid ${theme.border}`, background: dark ? "#0f172a" : "#fff", color: theme.color, borderRadius:8 }}>
            {dark ? "🌙 Dark" : "☀️ Light"}
          </button>
        </div>

        {/* Trello controls */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", marginBottom:12 }}>
          <button onClick={fetchBoards} style={{ padding:"8px 12px", background:BRAND, color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>Connect Trello</button>
          <select value={boardId} onChange={(e)=>fetchListsFor(e.target.value)} style={{ padding:"8px", border:`1px solid ${theme.border}`, borderRadius:8 }}>
            <option value=\"\">— Choose board —</option>
            {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={listId} onChange={(e)=>setListId(e.target.value)} style={{ padding:"8px", border:`1px solid ${theme.border}`, borderRadius:8 }}>
            <option value=\"\">— Choose list —</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button onClick={importFromList} style={{ padding:"8px 12px", border:`1px solid ${theme.border}`, background:"transparent", color:theme.color, borderRadius:8, cursor:"pointer" }}>Import from list</button>
          <button onClick={pushSelected} style={{ padding:"8px 12px", background:BRAND, color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>Push selected</button>
          <div style={{ marginLeft:8, color:theme.muted, minHeight:22 }}>{status}</div>
        </div>

        {/* Weights */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:12, border:`1px solid ${theme.border}`, borderRadius:12, padding:12 }}>
          {[
            ["Impact","impact"],["TTV","ttv"],["Feasibility","feasibility"],
            ["Data","data"],["Risk (lower better)","risk"],["Alignment","align"],["Buy-in","buyin"],
          ].map(([label,key]) => (
            <div key={key}>
              <div style={{ fontSize:12, color:theme.muted }}>{label}</div>
              <input type="range" min="0" max="40" value={weights[key]} onChange={(e)=>setWeight(key, e.target.value)} style={{ width:"100%" }} />
              <div style={{ fontSize:12, textAlign:"right" }}>{weights[key]}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign:"right", fontSize:12, color:theme.muted, marginTop:6 }}>
          Total weight: {totalWeight} (tip: ~100)
        </div>

        {/* Table */}
        <div style={{ overflowX:"auto", marginTop:16 }}>
          <table style={{ borderCollapse:"collapse", width:"100%" }}>
            <thead>
              <tr style={{ textAlign:"left", color:theme.muted }}>
                <th style={{ padding:8 }}>Sel</th>
                <th style={{ padding:8 }}>Use Case / Trello Title</th>
                <th style={{ padding:8 }}>Owner</th>
                <th style={{ padding:8 }}>Impact</th>
                <th style={{ padding:8 }}>TTV</th>
                <th style={{ padding:8 }}>Feas.</th>
                <th style={{ padding:8 }}>Data</th>
                <th style={{ padding:8 }}>Risk</th>
                <th style={{ padding:8 }}>Align</th>
                <th style={{ padding:8 }}>Buy-in</th>
                <th style={{ padding:8 }}>Cost</th>
                <th style={{ padding:8 }}>Score</th>
                <th style={{ padding:8, minWidth:420 }}>Notes / Trello Description</th>
                <th style={{ padding:8 }}>—</th>
              </tr>
            </thead>
            <tbody>
              {scored.map(r => (
                <tr key={r.id} style={{ borderTop:`1px solid ${theme.border}` }}>
                  <td style={{ padding:6 }}><input type="checkbox" checked={!!r.selected} onChange={(e)=>toggleSelect(r.id, e.target.checked)} /></td>
                  <td style={{ padding:6 }}><input value={r.name} onChange={(e)=>updateRow(r.id,{ name:e.target.value })} style={{ width:360 }} /></td>
                  <td style={{ padding:6 }}><input value={r.owner||""} onChange={(e)=>updateRow(r.id,{ owner:e.target.value })} style={{ width:140 }} /></td>
                  {["impact","ttv","feasibility","data","risk","align","buyin","cost"].map(k=>(
                    <td key={k} style={{ padding:6 }}><input type="number" min="0" max="5" value={r[k]??0} onChange={(e)=>updateRow(r.id,{ [k]:Number(e.target.value) })} style={{ width:60 }} /></td>
                  ))}
                  <td style={{ padding:6, fontVariantNumeric:"tabular-nums", fontWeight:600 }}>{r.score}</td>
                  <td style={{ padding:6 }}><textarea rows={3} value={r.notes||""} onChange={(e)=>updateRow(r.id,{ notes:e.target.value })} style={{ width:480 }} /></td>
                  <td style={{ padding:6 }}><button onClick={()=>removeRow(r.id)} style={{ padding:"4px 8px", background:BRAND, color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop:12 }}><button onClick={addRow} style={{ padding:"8px 12px", background:BRAND, color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>Add Row</button></div>
      </div>
    </div>
  );
}
