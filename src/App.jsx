import React, { useMemo, useState, useEffect } from "react";

/* =========================================
   Constants & Utilities
========================================= */
const BRAND = "#D76400";
const STORAGE_KEY = "cxo_prioritizer_v2";

// Weights (RICE-like, simplified)
const DEFAULT_WEIGHTS = { wI: 1, wR: 1, wE: 1, wU: 1, wA: 1 };

// Factor dropdowns
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

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function hexToRgb(hex) { const m = hex.replace("#",""); const n = parseInt(m,16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
function colorForScore(score){
  const stops = ["#FF0000","#FF7F00","#FFEA00","#FF00FF","#8B00FF","#007BFF"];
  const t=clamp01(score/100); const seg=Math.min(stops.length-2, Math.floor(t*(stops.length-1)));
  const lt=(t*(stops.length-1))-seg; const a=hexToRgb(stops[seg]); const b=hexToRgb(stops[seg+1]);
  const r=Math.round(a.r+(b.r-a.r)*lt), g=Math.round(a.g+(b.g-a.g)*lt), bl=Math.round(a.b+(b.b-a.b)*lt);
  return `rgb(${r},${g},${bl})`;
}

// Priority formula: ((wI*I)*(wR*R) + (wU*U) + (wA*A)) / (wE*E), scaled to 0..100
function computeScore(row, W){
  const I=Number(row.impact||0), R=Number(row.reach||0), E=Math.max(1,Number(row.effort||1)),
        U=Number(row.urgency||0), A=Number(row.align||0);
  const wI=Number(W.wI||1), wR=Number(W.wR||1), wE=Math.max(0.0001,Number(W.wE||1)),
        wU=Number(W.wU||1), wA=Number(W.wA||1);
  const raw=((wI*I)*(wR*R)+(wU*U)+(wA*A))/(wE*E);
  const maxRaw=((wI*5)*(wR*5)+(wU*4)+(wA*5))/(wE*1);
  return Math.round(clamp01(raw/(maxRaw||1))*100);
}

// readable UID for local before Trello idShort
function makeTempUID(){
  const t=new Date(); const y=String(t.getFullYear()).slice(-2);
  const m=("0"+(t.getMonth()+1)).slice(-2); const d=("0"+t.getDate()).slice(-2);
  const s=Math.random().toString(36).slice(2,6).toUpperCase();
  return `CXO-${y}${m}${d}-${s}`;
}

// encode meta inside description
const META_PREFIX="[CXO]";
function buildMetaLine({impact,reach,effort,urgency,align,uid}){
  return `${META_PREFIX} impact=${impact};reach=${reach};effort=${effort};urgency=${urgency};align=${align};uid=${uid}`;
}
function parseMetaFromDescription(desc=""){
  const idx=desc.lastIndexOf(META_PREFIX);
  if(idx<0) return null;
  const tail=desc.slice(idx).trim();
  const mm=tail.match(/\[CXO\]\s*(.*)$/);
  if(!mm) return null;
  const kv=mm[1].split(";").map(s=>s.trim()).filter(Boolean);
  const o={};
  kv.forEach(p=>{
    const [k,v]=(p||"").split("=").map(x=>x?.trim());
    if(!k) return;
    if(["impact","reach","effort","urgency","align"].includes(k)) o[k]=Number(v);
    if(k==="uid") o.uid=v;
  });
  return o;
}

// row factory
function startRow(name="New Use Case", notes="", imported=false, extra={}){
  return {
    id: Math.random().toString(36).slice(2),
    name, notes, imported,
    impact:3, reach:3, effort:3, urgency:2, align:3,
    selected:false,
    trelloId:undefined, idShort:undefined, shortLink:undefined, uid:undefined,
    ...extra
  };
}

const loadSaved = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null"); } catch { return null; } };
const saveNow = (payload) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {} };

/* =========================================
   Small UI Bits
========================================= */
function HeaderWithHelp({label, tip}){
  return (
    <div className="th-help">
      <span>{label}</span>
      <span className="bubble-wrap" aria-label={`${label} help`}>
        <span className="bubble">i</span>
        <span className="tooltip-box">{tip}</span>
      </span>
    </div>
  );
}
function ConfirmModal({open, title, message, confirmText="Confirm", onConfirm, onCancel}){
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

/* =========================================
   App
========================================= */
export default function App(){
  const saved = typeof window!=="undefined" ? loadSaved() : null;

  const [dark,setDark]=useState(()=>saved?.dark ?? true);
  const [showWeights,setShowWeights]=useState(false);
  const [query,setQuery]=useState("");

  const [weights,setWeights]=useState(()=>saved?.weights ?? DEFAULT_WEIGHTS);
  const [rows,setRows]=useState(()=>saved?.rows ?? [
    startRow("Autonomous Case Triage in Service Cloud","Auto-classify, route, and draft replies"),
    startRow("Sales Email Agent for Pipeline Acceleration","Auto-personalize emails and suggest next best actions"),
  ]);

  // Trello
  const [status,setStatus]=useState("");
  const [boards,setBoards]=useState([]);
  const [lists,setLists]=useState([]);
  const [boardId,setBoardId]=useState("");
  const [listId,setListId]=useState("");

  // sort
  const [sortKey,setSortKey]=useState("score");
  const [sortDir,setSortDir]=useState("desc");

  // confirmations
  const [confirm,setConfirm]=useState({open:false,type:null,payload:null,message:""});

  // to force checkbox re-render after bulk changes
  const [selectionEpoch,setSelectionEpoch]=useState(0);
  const bumpEpoch=()=>setSelectionEpoch(e=>e+1);

  // persist local
  useEffect(()=>{ saveNow({rows,weights,dark}); },[rows,weights,dark]);

  // auto-load from cloud at start
  useEffect(()=>{ loadFromCloud(true); },[]);
  // autosave every 5 mins
  useEffect(()=>{ const id=setInterval(()=>saveToCloud(true), 5*60*1000); return ()=>clearInterval(id); },[rows,weights,dark]);

  const scored = useMemo(()=>rows.map(r=>({...r, score: computeScore(r,weights)})),[rows,weights]);

  const searched=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q) return scored;
    return scored.filter(r=>(r.name||"").toLowerCase().includes(q) || (r.notes||"").toLowerCase().includes(q));
  },[scored,query]);

  const sorted=useMemo(()=>{
    const arr=[...searched];
    arr.sort((a,b)=>{
      const ax = sortKey==="name" ? String(a.name||"").toLowerCase() : a[sortKey];
      const bx = sortKey==="name" ? String(b.name||"").toLowerCase() : b[sortKey];
      if(ax<bx) return sortDir==="asc"?-1:1;
      if(ax>bx) return sortDir==="asc"?1:-1;
      return 0;
    });
    return arr;
  },[searched,sortKey,sortDir]);

  // mutators
  const setW=(k,v)=>setWeights(w=>({...w,[k]:Number(v)}));
  const updateRow=(id,patch)=>setRows(rs=>rs.map(r=>r.id===id?{...r,...patch}:r));
  const addRow=()=>setRows(rs=>[startRow(),...rs]);
  const removeRow=id=>setRows(rs=>rs.filter(r=>r.id!==id));
  const toggleSelect=(id,v)=>updateRow(id,{selected:v});

  // selection helpers
  const selectVisible=()=>{ const vis=new Set(sorted.map(r=>r.id)); setRows(prev=>prev.map(r=>vis.has(r.id)?{...r,selected:true}:r)); bumpEpoch(); setStatus(`✅ Selected ${sorted.length} visible row(s).`); };
  const clearVisible =()=>{ const vis=new Set(sorted.map(r=>r.id)); setRows(prev=>prev.map(r=>vis.has(r.id)?{...r,selected:false}:r)); bumpEpoch(); setStatus(`✅ Cleared selection for ${sorted.length} visible row(s).`); };
  const selectAll    =()=>{ setRows(prev=>prev.map(r=>({...r,selected:true}))); bumpEpoch(); setStatus("✅ Selected all rows."); };
  const clearAllSel  =()=>{ setRows(prev=>prev.map(r=>({...r,selected:false}))); bumpEpoch(); setStatus("✅ Cleared selection for all rows."); };
  const selectAllImported=()=>{ setRows(prev=>prev.map(r=>r.imported?{...r,selected:true}:r)); bumpEpoch(); setStatus("✅ Selected all imported rows."); };

  const deleteSelectedLocal=()=>{ setRows(prev=>prev.filter(r=>!r.selected)); bumpEpoch(); setStatus("🗑️ Deleted selected row(s) locally."); };
  const deleteAllImportedLocal=()=>{ setRows(prev=>prev.filter(r=>!r.imported)); bumpEpoch(); setStatus("🗑️ Deleted all imported row(s) locally."); };

  const resetAll=()=>{ try{localStorage.removeItem(STORAGE_KEY);}catch{}; setDark(true); setWeights(DEFAULT_WEIGHTS); setRows([startRow(), startRow("Example Feature","Describe the value")]); bumpEpoch(); setStatus("🔄 Data reset (local)."); };

  /* ---------- Cloud (GCP) ---------- */
  async function saveToCloud(silent=false){
    try{
      const r=await fetch("/api/storage/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:{rows,weights,dark}})});
      const j=await r.json().catch(()=>({}));
      if(!silent) setStatus(r.ok?"☁️ Saved to GCP.":`❌ Save failed: ${j.error||r.status}`);
    }catch(e){ if(!silent) setStatus(`❌ Save failed: ${e.message||e}`); }
  }
  async function loadFromCloud(silent=false){
    try{
      const r=await fetch("/api/storage/load");
      if(!r.ok){ if(!silent) setStatus(`❌ Load failed: ${r.status}`); return; }
      const j=await r.json();
      const {rows:R,weights:W,dark:D}=j?.data||{};
      if(Array.isArray(R)&&R.length){ setRows(R); if(W) setWeights(W); if(typeof D==="boolean") setDark(D); bumpEpoch(); if(!silent) setStatus("☁️ Loaded from GCP."); }
      else if(!silent) setStatus("ℹ️ No cloud snapshot yet; using local data.");
    }catch(e){ if(!silent) setStatus(`❌ Load failed: ${e.message||e}`); }
  }

  /* ---------- Trello ---------- */
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
      const imported=data.map(c=>{
        const parsed=parseMetaFromDescription(c.desc||"");
        const base=startRow(c.name||"Card", c.desc||"", true,{
          trelloId:c.id, idShort:c.idShort, shortLink:c.shortLink,
          uid:c.idShort ?? parsed?.uid ?? undefined
        });
        if(parsed){
          base.impact=parsed.impact ?? base.impact;
          base.reach =parsed.reach  ?? base.reach;
          base.effort=parsed.effort ?? base.effort;
          base.urgency=parsed.urgency ?? base.urgency;
          base.align=parsed.align ?? base.align;
        }
        return base;
      });
      setRows(prev=>[...imported, ...prev]); bumpEpoch(); setStatus(`✅ Imported ${imported.length} cards.`);
    }catch(e){ setStatus(`❌ ${e.message||e}`); }
  }

  /* ---------- Mixed Create/Update with Copy Fallback ---------- */
  function confirmPushSelected(){
    const selected = rows.filter(r=>r.selected);
    if(!selected.length) return setStatus("⚠️ Select one or more rows.");
    const toCreate = selected.filter(r=>!r.trelloId);
    const toUpdate = selected.filter(r=>!!r.trelloId || !!r.shortLink);
    if(toCreate.length && !listId) return setStatus("⚠️ Choose a destination list to create new cards.");
    const parts=[]; if(toCreate.length) parts.push(`create ${toCreate.length}`); if(toUpdate.length) parts.push(`update ${toUpdate.length}`);
    setConfirm({open:true,type:"push-mixed",payload:{toCreate,toUpdate},message:`This will ${parts.join(" and ")} card(s) in Trello. Proceed?`});
  }

  async function pushSelectedMixed({toCreate=[], toUpdate=[]}){
    let created=0, updated=0, copied=0, failed=0; let firstError="";

    // CREATE new
    for(const r of toCreate){
      try{
        if(!listId) throw new Error("No destination list selected");
        const uid=r.uid || makeTempUID();
        const desc=`${r.notes||""}${r.notes? "\n\n": ""}${buildMetaLine({impact:r.impact,reach:r.reach,effort:r.effort,urgency:r.urgency,align:r.align,uid})}`;
        const res=await fetch("/api/trello/cards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idList:listId,name:r.name,desc})});
        if(!res.ok){ const t=await res.text().catch(()=> ""); if(!firstError) firstError=t||res.statusText; throw new Error(); }
        const card=await res.json(); created++;
        if(card?.id && (card.idShort||card.shortLink)){
          const trueUid=card.idShort ?? card.shortLink;
          const newDesc=`${r.notes||""}${r.notes? "\n\n": ""}${buildMetaLine({impact:r.impact,reach:r.reach,effort:r.effort,urgency:r.urgency,align:r.align,uid:trueUid})}`;
          await fetch(`/api/trello/cards/${encodeURIComponent(card.id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({desc:newDesc})}).catch(()=>{});
          updateRow(r.id,{trelloId:card.id,idShort:card.idShort,shortLink:card.shortLink,uid:trueUid,imported:true});
        }
      }catch{ failed++; }
    }

    // UPDATE existing with COPY fallback
    for(const r of toUpdate){
      try{
        const idForUrl=r.trelloId || r.shortLink;
        if(!idForUrl){ failed++; continue; }
        const safeId=encodeURIComponent(idForUrl);
        const uid=r.idShort ?? r.uid ?? makeTempUID();
        const desc=`${r.notes||""}${r.notes? "\n\n": ""}${buildMetaLine({impact:r.impact,reach:r.reach,effort:r.effort,urgency:r.urgency,align:r.align,uid})}`;

        // try update/move
        const body={name:r.name, desc}; if(listId) body.idList=listId;
        let res=await fetch(`/api/trello/cards/${safeId}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});

        if(!res.ok){
          // fallback: copy into destination list if set
          if(listId){
            const copyRes=await fetch("/api/trello/cards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
              idCardSource:idForUrl, idList:listId, keepFromSource:"all", name:r.name, desc
            })});
            if(!copyRes.ok){ const t=await copyRes.text().catch(()=> ""); if(!firstError) firstError=t||copyRes.statusText; throw new Error(); }
            const newCard=await copyRes.json(); copied++;
            updateRow(r.id,{trelloId:newCard.id,idShort:newCard.idShort,shortLink:newCard.shortLink,uid:newCard.idShort ?? uid, imported:true});
            // Optionally archive the original (uncomment):
            // await fetch(`/api/trello/cards/${safeId}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({closed:true})}).catch(()=>{});
          }else{
            const t=await res.text().catch(()=> ""); if(!firstError) firstError=t||res.statusText; throw new Error();
          }
        }else{
          updated++; updateRow(r.id,{uid,imported:true});
        }
      }catch{ failed++; }
    }

    setStatus(`✅ Created ${created}${copied?`, copied ${copied}`:""}${updated?`, updated ${updated}`:""}${failed?`, failed ${failed}${firstError?` (first error: ${String(firstError).slice(0,120)}…)`:""}`:""}.`);
  }

  /* ---------- Reorder ---------- */
  async function pushOrderToTrello(ordered){
    setStatus("Reordering cards on Trello…");
    let firstError="";
    try{
      for(let i=ordered.length-1;i>=0;i--){
        const r=ordered[i]; const idForUrl=r.trelloId || r.shortLink; if(!idForUrl) continue;
        const safeId=encodeURIComponent(idForUrl);
        const res=await fetch(`/api/trello/cards/${safeId}/pos`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({pos:"top"})});
        if(!res.ok){ const t=await res.text().catch(()=> ""); if(!firstError) firstError=t||res.statusText; throw new Error(); }
      }
      setStatus(`✅ Reordered ${ordered.length} card(s) on Trello to match the app.`);
    }catch(e){ setStatus(`❌ Reorder failed: ${firstError || e.message || e}`); }
  }

  // theme
  const theme = dark
    ? { background:"#0b0b0c", panel:"#0f172a", text:"#e5e7eb", border:"#273244", muted:"#8aa0b2", input:"#0f172a", inputBorder:"#334155" }
    : { background:"#f6f7fb", panel:"#ffffff", text:"#0f172a", border:"#e2e8f0", muted:"#64748b", input:"#ffffff", inputBorder:"#cbd5e1" };

  const allVisibleSelected = sorted.length>0 && sorted.every(r=>!!r.selected);

  return (
    <div style={{minHeight:"100vh", background:theme.background, color:theme.text, fontFamily:"Inter, ui-sans-serif, system-ui, Arial", padding:"12px 12px"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
        :root { --panel:${theme.panel}; --text:${theme.text}; --border:${theme.border}; --muted:${theme.muted}; --brand:${BRAND}; --input:${theme.input}; --inputBorder:${theme.inputBorder}; }
        *{ box-sizing:border-box; }
        .wrap{ max-width:min(1920px,98.5vw); margin:0 auto; }
        .toolbar{ display:grid; grid-auto-flow:column; grid-auto-columns:max-content; align-items:center; gap:10px; }
        @media (max-width:1100px){ .toolbar{ grid-auto-flow:row; grid-template-columns:repeat(3, minmax(160px,1fr)); } }
        .cx-btn{ padding:10px 14px; border:1px solid var(--border); background:var(--panel); color:var(--text); border-radius:12px; cursor:pointer; }
        .cx-btn.primary{ background:var(--brand); color:#fff; border-color:var(--brand); }
        .cx-btn.ghost{ background:transparent; }
        input[type="checkbox"]{ accent-color:var(--brand); transform:scale(1.1); }
        .cx-input,.cx-select,.cx-number,.cx-textarea{ background:var(--input); color:var(--text); border:1px solid var(--inputBorder); border-radius:12px; padding:10px 12px; outline:none; transition:border-color .15s, box-shadow .15s; line-height:1.25; }
        .cx-select{ width:auto; }
        .cx-input,.cx-textarea{ width:100%; }
        .cx-number{ width:62px; text-align:center; padding:8px 10px; }
        .cx-input:focus,.cx-select:focus,.cx-number:focus,.cx-textarea:focus{ border-color:var(--brand); box-shadow:0 0 0 3px ${BRAND}22; }
        .cx-textarea{ resize:vertical; min-height:46px; }
        .title-textarea,.desc-textarea{ font-family:'Roboto', ui-sans-serif, system-ui, Arial; }
        .title-textarea{ overflow:hidden; resize:none; min-height:46px; }
        .scroll-viewport{ max-height:66vh; overflow:auto; }
        .scroll-viewport::-webkit-scrollbar{ width:12px; height:12px; }
        .scroll-viewport::-webkit-scrollbar-track{ background:var(--panel); border-left:1px solid var(--border); }
        .scroll-viewport::-webkit-scrollbar-thumb{ background:linear-gradient(180deg, ${BRAND}, ${BRAND}AA); border-radius:8px; border:3px solid var(--panel); }
        .scroll-viewport{ scrollbar-width:thin; scrollbar-color:${BRAND} var(--panel); }
        .cx-table{ width:100%; border-collapse:separate; border-spacing:0; table-layout:fixed; }
        .cx-table thead th{ position:sticky; top:0; background:var(--panel); z-index:2; }
        .cell{ padding:10px 12px; vertical-align:top; }
        .col-score{ width:76px; } .col-sel{ width:80px; } .col-num{ width:110px; } .col-del{ width:96px; }
        .cx-chip{ display:inline-flex; align-items:center; justify-content:center; min-width:46px; height:46px; font-weight:800; border-radius:999px; color:#fff; }
        .th-help{ display:inline-flex; align-items:center; gap:6px; }
        .bubble-wrap{ position:relative; display:inline-flex; align-items:center; }
        .bubble{ width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:var(--border); color:var(--text); font-size:11px; line-height:1; opacity:.9; }
        .tooltip-box{ position:absolute; left:0; top:120%; min-width:220px; max-width:320px; background:var(--panel); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:10px 12px; font-size:12px; line-height:1.35; box-shadow:0 8px 22px rgba(0,0,0,.18); opacity:0; transform:translateY(-4px); pointer-events:none; transition:opacity .12s, transform .12s; z-index:5; }
        .bubble-wrap:hover .tooltip-box{ opacity:1; transform:translateY(0); pointer-events:auto; }
        .drawer-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:49; opacity:0; pointer-events:none; transition:opacity .2s ease; }
        .drawer-backdrop.open{ opacity:1; pointer-events:auto; }
        .drawer{ position:fixed; right:0; top:0; bottom:0; width:380px; background:var(--panel); border-left:1px solid var(--border); transform:translateX(100%); transition:transform .2s ease; z-index:50; padding:16px; overflow:auto; }
        .drawer.open{ transform:translateX(0); }
        .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:60; }
        .modal{ width:min(560px,92vw); background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; }
      `}</style>

      <div className="wrap">
        {/* HEADER */}
        <div style={{display:"grid", gridTemplateColumns:"auto 1fr minmax(520px, 980px) auto", alignItems:"center", columnGap:12, marginBottom:12}}>
          <img src="/cxo-logo.png" alt="CharterXO" style={{height:36,width:36,borderRadius:8,objectFit:"cover"}}/>
          <h1 style={{margin:0, letterSpacing:.3}}><span>CharterXO </span><span style={{color:BRAND,fontWeight:800}}>Backlog Intelligence</span></h1>

          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto",gap:8,alignItems:"center"}}>
            <input className="cx-input" placeholder="Search title or description…" value={query} onChange={e=>setQuery(e.target.value)}/>
            <button className="cx-btn" onClick={()=>setShowWeights(true)}>Weights</button>
            <button className="cx-btn" onClick={()=>setDark(d=>!d)}>{dark?"🌙 Dark":"☀️ Light"}</button>
            <button className="cx-btn" onClick={()=>saveToCloud(false)}>Save</button>
          </div>
          <div />
        </div>

        {/* CONTROLS */}
        <div style={{background:theme.panel, border:`1px solid ${theme.border}`, borderRadius:14, padding:12, marginBottom:12}}>
          <div className="toolbar" style={{marginBottom:10}}>
            <button className="cx-btn primary" onClick={fetchBoards}>Connect Trello</button>
            <select className="cx-select" value={boardId} onChange={e=>fetchListsFor(e.target.value)} title="Choose board">
              <option value="">— Choose board —</option>
              {boards.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className="cx-select" value={listId} onChange={e=>setListId(e.target.value)} title="Choose list">
              <option value="">— Choose list —</option>
              {lists.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="cx-btn" onClick={importFromList}>Import from list</button>

            <div style={{width:12}}/>

            <select className="cx-select" value={sortKey} onChange={e=>setSortKey(e.target.value)}>
              <option value="score">Sort by: Priority Score</option>
              <option value="name">Title (A→Z)</option>
              <option value="impact">Impact</option>
              <option value="reach">Reach</option>
              <option value="effort">Effort</option>
              <option value="urgency">Urgency</option>
              <option value="align">Alignment</option>
            </select>
            <select className="cx-select" value={sortDir} onChange={e=>setSortDir(e.target.value)}>
              <option value="desc">High → Low</option>
              <option value="asc">Low → High</option>
            </select>
          </div>

          <div className="toolbar">
            <button className="cx-btn" onClick={selectVisible}>Select Visible</button>
            <button className="cx-btn" onClick={clearVisible}>Clear Visible</button>
            <button className="cx-btn" onClick={selectAll}>Select All</button>
            <button className="cx-btn" onClick={clearAllSel}>Clear All</button>
            <button className="cx-btn" onClick={selectAllImported}>Select All Imported</button>
            <button className="cx-btn" onClick={deleteSelectedLocal}>Delete Selected (Local)</button>
            <button className="cx-btn" onClick={deleteAllImportedLocal}>Delete All Imported (Local)</button>
            <button className="cx-btn ghost" onClick={resetAll}>Reset Data</button>
          </div>

          <div style={{marginTop:8, color:theme.muted, minHeight:22}}>{status}</div>
        </div>

        {/* TABLE */}
        <div style={{background:theme.panel, border:`1px solid ${theme.border}`, borderRadius:14, overflow:"hidden"}}>
          <div className="scroll-viewport">
            <table className="cx-table">
              <thead>
                <tr style={{textAlign:"left", color:theme.muted}}>
                  <th className="cell col-score">Score</th>
                  <th className="cell col-sel">
                    <label style={{display:"inline-flex",alignItems:"center",gap:8}}>
                      <input type="checkbox" checked={allVisibleSelected} onChange={e=>e.target.checked?selectVisible():clearVisible()}/>
                      Sel
                    </label>
                  </th>
                  <th className="cell">Use Case / Trello Title</th>
                  <th className="cell">Description</th>
                  <th className="cell col-num"><HeaderWithHelp label="Impact" tip="How much this moves key business goals AND solves a real user problem. 1=min, 5=max."/></th>
                  <th className="cell col-num"><HeaderWithHelp label="Reach" tip="How many users will be affected. 1=few, 5=all/most."/></th>
                  <th className="cell col-num"><HeaderWithHelp label="Effort" tip="Total team work. XS=1, S=2, M=3, L=5, XL=8. Higher effort lowers score."/></th>
                  <th className="cell col-num"><HeaderWithHelp label="Urgency" tip="Criticality right now. Low=1…Critical=4."/></th>
                  <th className="cell col-num"><HeaderWithHelp label="Alignment" tip="Strategic fit with current goals. 1=none, 5=perfect."/></th>
                  <th className="cell col-del">—</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r=>(
                  <tr key={`${r.id}-${selectionEpoch}`} style={{borderTop:`1px solid ${theme.border}`}}>
                    <td className="cell">
                      <div className="cx-chip" style={{background:colorForScore(r.score)}}>{r.score}</div>
                    </td>
                    <td className="cell">
                      <input type="checkbox" checked={!!r.selected} onChange={e=>toggleSelect(r.id, e.target.checked)}/>
                    </td>
                    <td className="cell">
                      <textarea className="cx-textarea title-textarea" rows={1} value={r.name}
                        onChange={e=>updateRow(r.id,{name:e.target.value})}
                        onInput={e=>{ e.target.style.height="auto"; e.target.style.height=(e.target.scrollHeight)+"px"; }} />
                    </td>
                    <td className="cell">
                      <textarea className="cx-textarea desc-textarea" rows={3} value={r.notes||""}
                        onChange={e=>updateRow(r.id,{notes:e.target.value})}/>
                      <div style={{fontSize:12,color:theme.muted,marginTop:6}}>UID: {r.idShort ?? r.uid ?? "—"}</div>
                    </td>
                    <td className="cell">
                      <select className="cx-select" value={r.impact??3} onChange={e=>updateRow(r.id,{impact:Number(e.target.value)})}>
                        {ONE_TO_FIVE.map(v=><option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="cell">
                      <select className="cx-select" value={r.reach??3} onChange={e=>updateRow(r.id,{reach:Number(e.target.value)})}>
                        {ONE_TO_FIVE.map(v=><option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="cell">
                      <select className="cx-select" value={r.effort??3} onChange={e=>updateRow(r.id,{effort:Number(e.target.value)})}>
                        {EFFORT_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="cell">
                      <select className="cx-select" value={r.urgency??2} onChange={e=>updateRow(r.id,{urgency:Number(e.target.value)})}>
                        {URGENCY_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="cell">
                      <select className="cx-select" value={r.align??3} onChange={e=>updateRow(r.id,{align:Number(e.target.value)})}>
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

        {/* FOOTER ACTIONS */}
        <div className="toolbar" style={{marginTop:12}}>
          <button className="cx-btn primary" onClick={addRow}>Add Row</button>
          <button className="cx-btn" onClick={confirmPushSelected}>Push selected to Trello</button>
          <button className="cx-btn" onClick={()=>{
            const ordered=sorted.filter(r=>r.imported && (r.trelloId || r.shortLink));
            if(!ordered.length) return setStatus("No imported cards with Trello IDs to reorder.");
            setConfirm({open:true,type:"push-order",payload:{ordered},message:`This will reorder ${ordered.length} card(s) to match the order here. Proceed?`});
          }}>Push Order to Trello</button>
          <div style={{color:theme.muted, lineHeight:"36px"}}>{status}</div>
        </div>
      </div>

      {/* DRAWER */}
      <div className={`drawer-backdrop ${showWeights?"open":""}`} onClick={()=>setShowWeights(false)} />
      <div className={`drawer ${showWeights?"open":""}`}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <h3 style={{margin:0}}>Weights</h3>
          <button className="cx-btn" onClick={()=>setShowWeights(false)}>Close</button>
        </div>
        {[
          ["Impact (wI)","wI","Emphasize value to business & users"],
          ["Reach (wR)","wR","How many users are affected"],
          ["Effort (wE)","wE","Total team work; higher reduces score"],
          ["Urgency (wU)","wU","Criticality / blockers / timing"],
          ["Alignment (wA)","wA","Strategic fit with current goals"],
        ].map(([label,key,sub])=>(
          <div key={key} style={{marginBottom:16}}>
            <div style={{fontSize:12,color:theme.muted,marginBottom:6}}>{label} <span style={{opacity:.7}}>— {sub}</span></div>
            <input type="range" min="0" max="4" step="0.1" value={weights[key]} onChange={e=>setW(key,e.target.value)} style={{width:"100%"}}/>
            <div style={{textAlign:"right",fontSize:12}}>{weights[key]}</div>
          </div>
        ))}
        <div style={{fontSize:12,color:theme.muted}}>Tip: set all to 1 for neutral; increase a slider to emphasize that factor.</div>
      </div>

      {/* CONFIRM MODALS */}
      <ConfirmModal
        open={confirm.open && confirm.type==="push-mixed"}
        title="Sync Selected with Trello"
        message={confirm.message}
        onCancel={()=>setConfirm({open:false})}
        onConfirm={async()=>{ const payload=confirm.payload||{toCreate:[],toUpdate:[]}; setConfirm({open:false}); await pushSelectedMixed(payload); }}
      />
      <ConfirmModal
        open={confirm.open && confirm.type==="push-order"}
        title="Reorder Trello Cards"
        message={confirm.message}
        onCancel={()=>setConfirm({open:false})}
        onConfirm={async()=>{ const ordered=confirm.payload?.ordered||[]; setConfirm({open:false}); await pushOrderToTrello(ordered); }}
      />
    </div>
  );
}
