// src/App.jsx
import React, { useMemo, useState, useEffect } from "react";

const BRAND = "#D76400";
const STORAGE_KEY = "cxo_prioritizer_v2";

// weights default
const DEFAULT_WEIGHTS = { wI: 1, wR: 1, wE: 1, wU: 1, wA: 1 };

// dropdown options
const ONE_TO_FIVE = [1, 2, 3, 4, 5];
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

// helpers
function clamp01(x){ return Math.max(0, Math.min(1,x)); }
function hexToRgb(hex){ const m=hex.replace("#",""); const n=parseInt(m,16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}; }
function colorForScore(score){
  const stops=["#FF0000","#FF7F00","#FFEA00","#FF00FF","#8B00FF","#007BFF"];
  const t=clamp01(score/100);
  const seg=Math.min(stops.length-2,Math.floor(t*(stops.length-1)));
  const localT=(t*(stops.length-1))-seg;
  const a=hexToRgb(stops[seg]), b=hexToRgb(stops[seg+1]);
  const r=Math.round(a.r+(b.r-a.r)*localT), g=Math.round(a.g+(b.g-a.g)*localT), bl=Math.round(a.b+(b.b-a.b)*localT);
  return `rgb(${r}, ${g}, ${bl})`;
}

function computeScore(row,W){
  const I=Number(row.impact||0), R=Number(row.reach||0), E=Math.max(1,Number(row.effort||1)), U=Number(row.urgency||0), A=Number(row.align||0);
  const wI=Number(W.wI||1), wR=Number(W.wR||1), wE=Math.max(0.0001,Number(W.wE||1)), wU=Number(W.wU||1), wA=Number(W.wA||1);
  const raw=((wI*I)*(wR*R)+(wU*U)+(wA*A))/(wE*E);
  const maxRaw=((wI*5)*(wR*5)+(wU*4)+(wA*5))/(wE*1);
  return { score: Math.round(clamp01(raw/(maxRaw||1))*100), raw, maxRaw };
}

// human-readable temp UID for new, non-Trello rows
function makeTempUID(){
  const t=new Date();
  const y=t.getFullYear().toString().slice(-2);
  const m=("0"+(t.getMonth()+1)).slice(-2);
  const d=("0"+t.getDate()).slice(-2);
  const suffix=Math.random().toString(36).slice(-4).toUpperCase();
  return `CXO-${y}${m}${d}-${suffix}`;
}

// CXO metadata line helpers
const META_PREFIX = "[CXO]";
function buildMetaLine({impact,reach,effort,urgency,align,uid}){
  return `${META_PREFIX} impact=${impact};reach=${reach};effort=${effort};urgency=${urgency};align=${align};uid=${uid}`;
}
function parseMetaFromDescription(desc=""){
  const idx=desc.lastIndexOf(META_PREFIX);
  if(idx<0) return null;
  const tail=desc.slice(idx).trim();
  // expected: [CXO] k=v;k=v;...
  const m = tail.match(/\[CXO\]\s*(.*)$/);
  if(!m) return null;
  const kv=m[1].split(";").map(s=>s.trim()).filter(Boolean);
  const obj={};
  kv.forEach(pair=>{
    const [k,v]=pair.split("=").map(x=>x?.trim());
    if(!k) return;
    if(["impact","reach","effort","urgency","align"].includes(k)) obj[k]=Number(v);
    if(k==="uid") obj.uid=v;
  });
  return obj;
}

function startRow(title="New Use Case", description="", imported=false, extra={}){
  return {
    id: Math.random().toString(36).slice(2),
    name: title,
    notes: description,
    impact: 3, reach: 3, effort: 3, urgency: 2, align: 3,
    selected: false,
    imported,
    trelloId: undefined,
    idShort: undefined,
    shortLink: undefined,
    uid: undefined, // app-visible UID
    ...extra
  };
}

const loadSaved = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null"); } catch { return null; } };
const saveNow   = (payload) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {} };

function HeaderWithHelp({label,tip}) {
  return (
    <div className="th-help">
      <span>{label}</span>
      <span className="bubble-wrap" aria-label={`${label} help`}><span className="bubble">i</span><span className="tooltip-box">{tip}</span></span>
    </div>
  );
}

/* lightweight modal */
function ConfirmModal({open, title, message, confirmText="Confirm", onConfirm, onCancel}) {
  if(!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3 style={{marginTop:0}}>{title}</h3>
        <p style={{marginTop:6, marginBottom:18, lineHeight:1.4}}>{message}</p>
        <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
          <button className="cx-btn" onClick={onCancel}>Cancel</button>
          <button className="cx-btn primary" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

export default function App(){
  const saved = typeof window!=="undefined"? loadSaved(): null;

  // theme
  const [dark,setDark] = useState(()=>saved?.dark ?? true);
  const [showWeights,setShowWeights] = useState(false);
  const [query,setQuery] = useState("");

  // data
  const [weights,setWeights] = useState(()=>saved?.weights ?? DEFAULT_WEIGHTS);
  const [rows,setRows] = useState(()=>saved?.rows ?? [
    startRow("Autonomous Case Triage in Service Cloud","Auto-classify, route, and draft replies"),
    startRow("Sales Email Agent for Pipeline Acceleration","Auto-personalize emails and suggest next best actions"),
  ]);

  // trello
  const [status,setStatus] = useState("");
  const [boards,setBoards] = useState([]);
  const [lists,setLists]   = useState([]);
  const [boardId,setBoardId] = useState("");
  const [listId,setListId]   = useState("");

  // sort
  const [sortKey,setSortKey] = useState("score");
  const [sortDir,setSortDir] = useState("desc");

  // confirmations
  const [confirm, setConfirm] = useState({ open:false, type:null, payload:null, message:"" });

  useEffect(()=>{ saveNow({rows,weights,dark}); },[rows,weights,dark]);

  const scored = useMemo(()=>rows.map(r=>({ ...r, score: computeScore(r,weights).score })),[rows,weights]);

  const searched = useMemo(()=>{
    if(!query.trim()) return scored;
    const q=query.toLowerCase();
    return scored.filter(r => (r.name||"").toLowerCase().includes(q) || (r.notes||"").toLowerCase().includes(q));
  },[scored,query]);

  const sorted = useMemo(()=>{
    const A=[...searched];
    A.sort((a,b)=>{
      const ax = sortKey==="name" ? String(a.name||"").toLowerCase() : a[sortKey];
      const bx = sortKey==="name" ? String(b.name||"").toLowerCase() : b[sortKey];
      if(ax<bx) return sortDir==="asc"? -1: 1;
      if(ax>bx) return sortDir==="asc"? 1: -1;
      return 0;
    });
    return A;
  },[searched,sortKey,sortDir]);

  // mutators
  const setW = (k,v)=> setWeights(w=>({...w,[k]:Number(v)}));
  const updateRow = (id,patch)=> setRows(rs=>rs.map(r=>r.id===id?({...r,...patch}):r));
  const addRow = ()=> setRows(rs=>[startRow(),...rs]);
  const removeRow = id => setRows(rs=>rs.filter(r=>r.id!==id));

  function toggleSelect(id,v){ updateRow(id,{selected:v}); }
  function selectAll(){ setRows(rs=>rs.map(r=>({...r,selected:true}))); }
  function clearSelection(){ setRows(rs=>rs.map(r=>({...r,selected:false}))); }
  function selectAllImported(){ setRows(rs=>rs.map(r=>r.imported? {...r,selected:true}:r)); }
  function deleteSelectedLocal(){
    const n=rows.filter(r=>r.selected).length;
    setRows(rs=>rs.filter(r=>!r.selected));
    setStatus(n? `🗑️ Deleted ${n} selected row(s) locally.` : "No selected rows to delete.");
  }
  function deleteAllImportedLocal(){
    const n=rows.filter(r=>r.imported).length;
    setRows(rs=>rs.filter(r=>!r.imported));
    setStatus(n? `🗑️ Deleted ${n} imported row(s) locally.` : "No imported rows to delete.");
  }
  function resetAll(){
    try{ localStorage.removeItem(STORAGE_KEY); }catch{}
    setDark(true); setWeights(DEFAULT_WEIGHTS);
    setRows([startRow(),startRow("Example Feature","Describe the value here")]);
    setStatus("🔄 Data reset (local).");
  }

  // cloud
  async function saveToCloud(){
    try{
      const r=await fetch("/api/storage/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:{rows,weights,dark}})});
      const j=await r.json();
      setStatus(r.ok? "☁️ Saved to GCP." : `❌ Save failed: ${j.error||r.status}`);
    }catch(e){ setStatus(`❌ Save failed: ${e.message||e}`); }
  }
  async function loadFromCloud(){
    try{
      const r=await fetch("/api/storage/load");
      const j=await r.json();
      if(!r.ok) return setStatus(`❌ Load failed: ${j.error||r.status}`);
      const { rows:R, weights:W, dark:D } = j.data || {};
      if(R) setRows(R);
      if(W) setWeights(W);
      if(typeof D==="boolean") setDark(D);
      setStatus("☁️ Loaded from GCP.");
    }catch(e){ setStatus(`❌ Load failed: ${e.message||e}`); }
  }

  // trello
  async function fetchBoards(){
    setStatus("Connecting…");
    try{
      const r=await fetch("/api/trello/members/me/boards");
      if(!r.ok) throw new Error(await r.text());
      const data=await r.json();
      setBoards(data); setStatus(`✅ Connected. Found ${data.length} boards.`);
    }catch(e){ setStatus(`❌ ${e.message||e}`); }
  }
  async function fetchListsFor(bid){
    setBoardId(bid); setLists([]); setListId("");
    if(!bid) return;
    setStatus("Loading lists…");
    try{
      const r=await fetch(`/api/trello/boards/${bid}/lists`);
      if(!r.ok) throw new Error(await r.text());
      const data=await r.json();
      setLists(data); setStatus(`📋 ${data.length} lists loaded.`);
    }catch(e){ setStatus(`❌ ${e.message||e}`); }
  }
  async function importFromList(){
    if(!listId) return setStatus("⚠️ Choose a list first.");
    setStatus("Importing cards…");
    try{
      const r=await fetch(`/api/trello/lists/${listId}/cards`);
      if(!r.ok) throw new Error(await r.text());
      const data=await r.json();
      const imported = data.map(c=>{
        // parse CXO metadata if present
        const parsed=parseMetaFromDescription(c.desc||"");
        const base = startRow(c.name||"Card", c.desc||"", true, {
          trelloId: c.id,
          idShort: c.idShort,
          shortLink: c.shortLink,
          uid: c.idShort ?? parsed?.uid ?? undefined
        });
        if(parsed){
          base.impact = parsed.impact ?? base.impact;
          base.reach  = parsed.reach  ?? base.reach;
          base.effort = parsed.effort ?? base.effort;
          base.urgency= parsed.urgency?? base.urgency;
          base.align  = parsed.align  ?? base.align;
        }
        return base;
      });
      setRows(prev=>[...imported,...prev]);
      setStatus(`✅ Imported ${imported.length} cards.`);
    }catch(e){ setStatus(`❌ ${e.message||e}`); }
  }

  // confirm wrappers
  function confirmPushSelected(){
    const chosen=sorted.filter(r=>r.selected && !r.trelloId);
    if(!listId) return setStatus("⚠️ Choose a destination list first.");
    if(!chosen.length) return setStatus("⚠️ Select one or more local rows to create.");
    setConfirm({
      open:true,
      type:"push-create",
      payload:{ chosen },
      message:`This will create ${chosen.length} card(s) in the selected Trello list. Proceed?`,
    });
  }
  function confirmPushOrder(){
    const ordered=sorted.filter(r=>r.imported && r.trelloId);
    if(!listId) return setStatus("⚠️ Choose a list first.");
    if(!ordered.length) return setStatus("No imported cards with Trello IDs to reorder.");
    setConfirm({
      open:true,
      type:"push-order",
      payload:{ ordered },
      message:`This will reorder ${ordered.length} card(s) in Trello to match the order shown here. Proceed?`,
    });
  }

  async function pushSelectedToTrello(chosen){
    setStatus("Creating Trello cards…");
    let ok=0, fail=0;
    for(const r of chosen){
      try{
        // temp UID; will replace with idShort after POST succeed if available
        let uid = r.uid || makeTempUID();
        const metaLine = buildMetaLine({
          impact:r.impact, reach:r.reach, effort:r.effort, urgency:r.urgency, align:r.align, uid
        });
        let desc = `${r.notes || ""}${r.notes ? "\n\n" : ""}${metaLine}`;

        // create
        const res = await fetch("/api/trello/cards",{
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ idList:listId, name:r.name, desc })
        });
        if(!res.ok) throw new Error(await res.text());
        const card = await res.json(); // expect id, idShort, etc.
        ok++;

        // if Trello gave us idShort, patch metadata line to use it
        if(card?.id && (card.idShort || card.shortLink)){
          const trueUid = card.idShort ?? card.shortLink;
          const newMeta = buildMetaLine({
            impact:r.impact, reach:r.reach, effort:r.effort, urgency:r.urgency, align:r.align, uid:trueUid
          });
          const newDesc = `${r.notes || ""}${r.notes ? "\n\n" : ""}${newMeta}`;
          // update description to replace temp uid
          await fetch(`/api/trello/cards/${card.id}`,{
            method:"PUT", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ desc:newDesc })
          }).catch(()=>{});
          // reflect back in local row
          updateRow(r.id,{ trelloId:card.id, idShort:card.idShort, shortLink:card.shortLink, uid:trueUid, imported:true });
        }
      }catch{ fail++; }
    }
    setStatus(`✅ Created ${ok} card(s)${fail?`, ${fail} failed`:''}.`);
  }

  async function pushOrderToTrello(ordered){
    setStatus("Reordering cards on Trello…");
    try{
      for(let i=ordered.length-1;i>=0;i--){
        const r=ordered[i];
        const res=await fetch(`/api/trello/cards/${r.trelloId}/pos`,{
          method:"PUT", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ pos:"top" })
        });
        if(!res.ok) throw new Error(await res.text());
      }
      setStatus(`✅ Reordered ${ordered.length} card(s) on Trello to match the app.`);
    }catch(e){ setStatus(`❌ Reorder failed: ${e.message||e}`); }
  }

  // theme
  const theme = dark
    ? { background:"#0b0b0c", panel:"#0f172a", text:"#e5e7eb", border:"#273244", muted:"#8aa0b2", input:"#0f172a", inputBorder:"#334155" }
    : { background:"#f6f7fb", panel:"#ffffff", text:"#0f172a", border:"#e2e8f0", muted:"#64748b", input:"#ffffff", inputBorder:"#cbd5e1" };

  return (
    <div style={{ minHeight:"100vh", background:theme.background, color:theme.text, fontFamily:"Inter, ui-sans-serif, system-ui, Arial", padding:"12px 12px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
        :root { --border:${theme.border}; --panel:${theme.panel}; --text:${theme.text}; --muted:${theme.muted}; --brand:${BRAND}; --input:${theme.input}; --inputBorder:${theme.inputBorder}; }
        * { box-sizing: border-box; }
        .wrap { max-width: min(1920px, 98.5vw); margin: 0 auto; }
        .actions { display:flex; gap:8px; flex-wrap:wrap; }
        .cx-btn { padding:10px 14px; border:1px solid var(--border); background:var(--panel); color:var(--text); border-radius:12px; cursor:pointer; }
        .cx-btn.primary { background:var(--brand); color:#fff; border-color:var(--brand); }
        .cx-btn.ghost { background:transparent; }
        .cx-input, .cx-select, .cx-number, .cx-textarea {
          background:var(--input); color:var(--text);
          border:1px solid var(--inputBorder); border-radius:12px; padding:10px 12px; outline:none;
          transition: border-color .15s, box-shadow .15s; line-height:1.25;
        }
        .cx-input, .cx-textarea { width:100%; }
        .cx-select { width:auto; }
        .cx-number { width:62px; text-align:center; padding:8px 10px; }
        .cx-input:focus, .cx-select:focus, .cx-number:focus, .cx-textarea:focus { border-color:var(--brand); box-shadow:0 0 0 3px ${BRAND}22; }
        .cx-textarea { resize:vertical; min-height:46px; }
        .title-textarea, .desc-textarea { font-family:'Roboto', ui-sans-serif, system-ui, Arial; }
        .title-textarea { overflow:hidden; resize:none; min-height:46px; }

        .scroll-viewport { max-height:66vh; overflow:auto; }
        .cx-table { width:100%; border-collapse:separate; border-spacing:0; table-layout:fixed; }
        .cx-table thead th { position:sticky; top:0; background:var(--panel); z-index:2; }
        .cell { padding:10px 12px; vertical-align:top; }
        .col-score{ width:76px; } .col-sel{ width:60px; } .col-num{ width:110px; } .col-del{ width:96px; }
        .cx-chip { display:inline-flex; align-items:center; justify-content:center; min-width:46px; height:46px; font-weight:800; border-radius:999px; color:#fff; }

        .th-help { display:inline-flex; align-items:center; gap:6px; }
        .bubble-wrap { position:relative; display:inline-flex; align-items:center; }
        .bubble { width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:var(--border); color:var(--text); font-size:11px; line-height:1; opacity:.9; }
        .tooltip-box { position:absolute; left:0; top:120%; min-width:220px; max-width:320px; background:var(--panel); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:10px 12px; font-size:12px; line-height:1.35; box-shadow:0 8px 22px rgba(0,0,0,.18); opacity:0; transform:translateY(-4px); pointer-events:none; transition:opacity .12s, transform .12s; z-index:5; }
        .bubble-wrap:hover .tooltip-box { opacity:1; transform:translateY(0); pointer-events:auto; }

        .toolbar { display:grid; grid-auto-flow:column; grid-auto-columns:max-content; align-items:center; gap:10px; }
        @media (max-width:1100px){ .toolbar { grid-auto-flow:row; grid-template-columns:repeat(3, minmax(160px, 1fr)); } }

        /* modal */
        .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:60; }
        .modal { width:min(560px, 92vw); background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; }
      `}</style>

      <div className="wrap">
        {/* Header with logo left of title */}
        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr minmax(500px, 900px) auto", alignItems:"center", columnGap:12, marginBottom:12 }}>
          <img src="/cxo-logo.png" alt="CharterXO" style={{ height:36, width:36, borderRadius:8, objectFit:"cover" }} />
          <h1 style={{ margin:0, letterSpacing:.3 }}>
            <span>CharterXO </span><span style={{ color:BRAND, fontWeight:800 }}>Backlog Intelligence</span>
          </h1>

          {/* Search & controls */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:8, alignItems:"center" }}>
            <input className="cx-input" placeholder="Search title or description…" value={query} onChange={(e)=>setQuery(e.target.value)} />
            <button className="cx-btn" onClick={()=>setShowWeights(s=>!s)}>Weights</button>
            <button className="cx-btn" onClick={()=>setDark(d=>!d)}>{dark? "🌙 Dark":"☀️ Light"}</button>
            <div style={{ display:"flex", gap:8 }}>
              <button className="cx-btn" onClick={saveToCloud}>Save</button>
              <button className="cx-btn" onClick={loadFromCloud}>Load</button>
            </div>
          </div>

          {/* spacer (right) */}
          <div />
        </div>

        {/* Trello + sorting + bulk actions */}
        <div style={{ background:theme.panel, border:`1px solid ${theme.border}`, borderRadius:14, padding:12, marginBottom:12 }}>
          <div className="toolbar" style={{ marginBottom:10 }}>
            <button className="cx-btn primary" onClick={fetchBoards}>Connect Trello</button>

            <select className="cx-select" value={boardId} onChange={(e)=>fetchListsFor(e.target.value)} title="Choose board">
              <option value="">— Choose board —</option>
              {boards.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>

            <select className="cx-select" value={listId} onChange={(e)=>setListId(e.target.value)} title="Choose list">
              <option value="">— Choose list —</option>
              {lists.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>

            <button className="cx-btn" onClick={importFromList}>Import from list</button>

            <div style={{ width:12 }} />

            <select className="cx-select" value={sortKey} onChange={(e)=>setSortKey(e.target.value)} title="Sort by">
              <option value="score">Sort by: Priority Score</option>
              <option value="name">Title (A→Z)</option>
              <option value="impact">Impact</option>
              <option value="reach">Reach</option>
              <option value="effort">Effort</option>
              <option value="urgency">Urgency</option>
              <option value="align">Alignment</option>
            </select>
            <select className="cx-select" value={sortDir} onChange={(e)=>setSortDir(e.target.value)} title="Order">
              <option value="desc">High → Low</option>
              <option value="asc">Low → High</option>
            </select>
          </div>

          <div className="toolbar">
            <button className="cx-btn" onClick={selectAll}>Select All</button>
            <button className="cx-btn" onClick={clearSelection}>Clear Selection</button>
            <button className="cx-btn" onClick={selectAllImported}>Select All Imported</button>
            <button className="cx-btn" onClick={deleteSelectedLocal}>Delete Selected (Local)</button>
            <button className="cx-btn" onClick={deleteAllImportedLocal}>Delete All Imported (Local)</button>
            <button className="cx-btn ghost" onClick={resetAll}>Reset Data</button>
          </div>

          <div style={{ marginTop:8, color:theme.muted, minHeight:22 }}>{status}</div>
        </div>

        {/* Weights drawer */}
        <div className={`drawer ${showWeights? "open": ""}`}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <h3>Weights</h3><button className="cx-btn" onClick={()=>setShowWeights(false)}>Close</button>
          </div>
          {[
            ["Impact (wI)","wI","Emphasize value to business & users"],
            ["Reach (wR)","wR","How many users are affected"],
            ["Effort (wE)","wE","Total team work; higher reduces score"],
            ["Urgency (wU)","wU","Criticality / blockers / timing"],
            ["Alignment (wA)","wA","Strategic fit with current goals"],
          ].map(([label,key,sub])=>(
            <div key={key} style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, color:theme.muted, marginBottom:6 }}>{label} <span style={{opacity:.7}}>— {sub}</span></div>
              <input type="range" min="0" max="4" step="0.1" value={weights[key]} onChange={(e)=>setW(key,e.target.value)} style={{ width:"100%" }} />
              <div style={{ textAlign:"right", fontSize:12 }}>{weights[key]}</div>
            </div>
          ))}
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
                  <th className="cell col-num"><HeaderWithHelp label="Impact" tip="How much this moves key business goals AND solves a real user problem. 1=min, 5=max." /></th>
                  <th className="cell col-num"><HeaderWithHelp label="Reach" tip="How many users will be affected. 1=few, 5=all/most." /></th>
                  <th className="cell col-num"><HeaderWithHelp label="Effort" tip="Total team work. XS=1, S=2, M=3, L=5, XL=8. Higher effort lowers score." /></th>
                  <th className="cell col-num"><HeaderWithHelp label="Urgency" tip="Criticality right now to unblock work or seize timing. Low=1…Critical=4." /></th>
                  <th className="cell col-num"><HeaderWithHelp label="Alignment" tip="Strategic fit with current goals. 1=none, 5=perfect." /></th>
                  <th className="cell col-del">—</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r=>(
                  <tr key={r.id} style={{ borderTop:`1px solid ${theme.border}` }}>
                    <td className="cell"><div className="cx-chip" style={{ background:colorForScore(r.score) }}>{r.score}</div></td>
                    <td className="cell"><input type="checkbox" checked={!!r.selected} onChange={(e)=>toggleSelect(r.id,e.target.checked)} /></td>
                    <td className="cell">
                      <textarea className="cx-textarea title-textarea" rows={1} value={r.name}
                        onChange={(e)=>updateRow(r.id,{name:e.target.value})}
                        onInput={(e)=>{ e.target.style.height='auto'; e.target.style.height=(e.target.scrollHeight)+'px'; }} />
                    </td>
                    <td className="cell">
                      <textarea className="cx-textarea desc-textarea" rows={3} value={r.notes||""}
                        onChange={(e)=>updateRow(r.id,{notes:e.target.value})} />
                      {/* UID hint (read-only display) */}
                      <div style={{ fontSize:12, color:theme.muted, marginTop:6 }}>
                        UID: {r.idShort ?? r.uid ?? "—"}
                      </div>
                    </td>

                    <td className="cell">
                      <select className="cx-select" value={r.impact??3} onChange={(e)=>updateRow(r.id,{impact:Number(e.target.value)})}>
                        {ONE_TO_FIVE.map(v=><option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="cell">
                      <select className="cx-select" value={r.reach??3} onChange={(e)=>updateRow(r.id,{reach:Number(e.target.value)})}>
                        {ONE_TO_FIVE.map(v=><option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="cell">
                      <select className="cx-select" value={r.effort??3} onChange={(e)=>updateRow(r.id,{effort:Number(e.target.value)})}>
                        {EFFORT_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="cell">
                      <select className="cx-select" value={r.urgency??2} onChange={(e)=>updateRow(r.id,{urgency:Number(e.target.value)})}>
                        {URGENCY_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="cell">
                      <select className="cx-select" value={r.align??3} onChange={(e)=>updateRow(r.id,{align:Number(e.target.value)})}>
                        {ONE_TO_FIVE.map(v=><option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>

                    <td className="cell"><button className="cx-btn primary" onClick={()=>removeRow(r.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* footer actions */}
        <div className="actions" style={{ marginTop:12 }}>
          <button className="cx-btn primary" onClick={addRow}>Add Row</button>
          <button className="cx-btn" onClick={confirmPushSelected}>Push selected to Trello</button>
          <button className="cx-btn" onClick={confirmPushOrder}>Push Order to Trello</button>
          <div style={{ color:theme.muted, lineHeight:"36px" }}>{status}</div>
        </div>
      </div>

      {/* Confirm modals */}
      <ConfirmModal
        open={confirm.open && confirm.type==="push-create"}
        title="Create Trello Cards"
        message={confirm.message}
        onCancel={()=>setConfirm({open:false})}
        onConfirm={async ()=>{
          const chosen=confirm.payload?.chosen || [];
          setConfirm({open:false});
          await pushSelectedToTrello(chosen);
        }}
      />
      <ConfirmModal
        open={confirm.open && confirm.type==="push-order"}
        title="Reorder Trello Cards"
        message={confirm.message}
        onCancel={()=>setConfirm({open:false})}
        onConfirm={async ()=>{
          const ordered=confirm.payload?.ordered || [];
          setConfirm({open:false});
          await pushOrderToTrello(ordered);
        }}
      />
    </div>
  );
}
