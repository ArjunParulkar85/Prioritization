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
    } catch (e) { setStatus(`❌ ${
