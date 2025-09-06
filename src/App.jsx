import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Download, Upload, RefreshCw, Plus, Trash2, Save, PlugZap, Send, Database, Sun, Moon } from "lucide-react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

/**
 * Prioritization App — Dark Mode + CharterXO Branding
 * - Weighted scoring (0–5) across 7 criteria + cost
 * - Sorts by score (desc)
 * - Value vs Effort chart (toggle)
 * - Import/Export JSON + Export CSV
 * - Trello panel: connect, choose board/list, import cards, push selected rows
 * - Dark/Light theme switcher
 * - CharterXO brand colors: black, white, #D76400 (accent)
 */

const DEFAULT_WEIGHTS = {
  impact: 25,
  ttv: 15,
  feasibility: 15,
  data: 10,
  risk: 10, // reversed
  align: 15,
  buyin: 10,
};

const PRESETS = {
  "Board Pitch": { impact: 30, ttv: 15, feasibility: 10, data: 5, risk: 10, align: 20, buyin: 10 },
  "Ops Quick Wins": { impact: 20, ttv: 25, feasibility: 20, data: 15, risk: 10, align: 5, buyin: 5 },
  "R&D Bets": { impact: 25, ttv: 5, feasibility: 10, data: 15, risk: 10, align: 20, buyin: 15 },
};

const BRAND = { primary: "#D76400", black: "#000000", white: "#ffffff" };

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function scoreRow(r, weights, totalWeight) {
  const normalized = {
    impact: clamp01((r.impact ?? 0) / 5),
    ttv: clamp01((r.ttv ?? 0) / 5),
    feasibility: clamp01((r.feasibility ?? 0) / 5),
    data: clamp01((r.data ?? 0) / 5),
    risk: 1 - clamp01((r.risk ?? 0) / 5),
    align: clamp01((r.align ?? 0) / 5),
    buyin: clamp01((r.buyin ?? 0) / 5),
  };
  const weighted =
    normalized.impact * weights.impact +
    normalized.ttv * weights.ttv +
    normalized.feasibility * weights.feasibility +
    normalized.data * weights.data +
    normalized.risk * weights.risk +
    normalized.align * weights.align +
    normalized.buyin * weights.buyin;
  const score = totalWeight ? Math.round((weighted / totalWeight) * 100) : 0;
  const effort = (6 - ((r.feasibility ?? 0) + (r.ttv ?? 0))) + (r.cost ?? 3); // lower is better
  const value = Math.round(((r.impact ?? 0) + (r.align ?? 0)) * 10);
  return { ...r, score, effort, value };
}

function startRow(name = "New Use Case", owner = "", notes = "", seed = 3) {
  return {
    id: cryptoRandomId(),
    name, owner, notes,
    impact: seed, ttv: seed, feasibility: seed, data: seed, risk: seed, align: seed, buyin: seed,
    cost: seed,
    selected: false,
  };
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return Array.from(buf).map((n) => n.toString(36)).join("-");
  }
  return Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
}

export default function PrioritizationUI() {
  const [dark, setDark] = useState(false);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [rows, setRows] = useState([
    startRow("Autonomous Case Triage in Service Cloud", "CX Ops", "Auto‑classify, route, draft replies", 4),
    startRow("Sales Email Agent for Pipeline Acceleration", "Sales Ops", "Personalization & next‑best‑action", 3),
    startRow("Knowledge Mining for Field Service", "FS Tech", "Semantic search for technicians", 3),
  ]);
  const [showChart, setShowChart] = useState(true);
  const [status, setStatus] = useState("");

  // Trello state
  const [boards, setBoards] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState("");
  const [selectedList, setSelectedList] = useState("");

  const totalWeight = useMemo(() => Object.values(weights).reduce((a, b) => a + (isNaN(b) ? 0 : b), 0), [weights]);
  const scored = useMemo(() => rows.map(r => scoreRow(r, weights, totalWeight)).sort((a,b) => b.score - a.score), [rows, weights, totalWeight]);

  function setPreset(name) { setWeights(PRESETS[name]); }
  function updateWeight(key, v) { setWeights((w) => ({ ...w, [key]: v[0] })); }
  function updateRow(id, patch) { setRows((rs) => rs.map(r => r.id === id ? { ...r, ...patch } : r)); }
  function addRow() { setRows((rs) => [startRow(), ...rs]); }
  function removeRow(id) { setRows((rs) => rs.filter(r => r.id !== id)); }
  function toggleSelect(id, v) { updateRow(id, { selected: Boolean(v) }); }

  // Export / Import
  function exportJSON() {
    const blob = new Blob([JSON.stringify({ weights, rows }, null, 2)], { type: "application/json" });
    downloadBlob(blob, `prioritization-${dateStr()}.json`);
  }
  function exportCSV() {
    const header = ["Name","Owner","Score","Impact","TTV","Feasibility","Data","Risk(Rev)","Alignment","BuyIn","Cost","Notes"];
    const body = scored.map(r => [csv(r.name), csv(r.owner), r.score, r.impact, r.ttv, r.feasibility, r.data, r.risk, r.align, r.buyin, r.cost, csv(r.notes)].join(","));
    const blob = new Blob([[header.join(",") , ...body].join("\n")], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, `prioritization-${dateStr()}.csv`);
  }
  function importJSON(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { try { const data = JSON.parse(String(reader.result)); if (data.weights) setWeights(data.weights); if (data.rows) setRows(data.rows); } catch { alert("Invalid JSON."); } };
    reader.readAsText(f); e.currentTarget.value = "";
  }

  // Trello calls (wired to your working endpoints)
  async function fetchBoards() {
    setStatus("Connecting to Trello…");
    try { const r = await fetch('/api/trello/members/me/boards'); if (!r.ok) throw new Error(await r.text()); const data = await r.json(); setBoards(data); setStatus(`✅ Connected. Found ${data.length} boards.`);} catch (e) { setStatus(`❌ ${e.message || e}`);} }
  async function fetchLists(boardId) {
    setSelectedBoard(boardId); setSelectedList(""); setLists([]); if (!boardId) return;
    setStatus("Loading lists…");
    try { const r = await fetch(`/api/trello/boards/${boardId}/lists`); if (!r.ok) throw new Error(await r.text()); const data = await r.json(); setLists(data); setStatus(`📋 ${data.length} lists loaded.`);} catch (e) { setStatus(`❌ ${e.message || e}`);} }
  async function importFromList(listId) {
    if (!listId) { setStatus("⚠️ Choose a list first"); return; }
    setStatus("Importing cards…");
    try { const r = await fetch(`/api/trello/lists/${listId}/cards`); if (!r.ok) throw new Error(await r.text()); const data = await r.json(); const imported = data.map(c => ({ ...startRow(c.name || "Card", "", c.desc || "", 3) })); setRows(prev => [...imported, ...prev]); setStatus(`✅ Imported ${imported.length} cards.`);} catch (e) { setStatus(`❌ ${e.message || e}`);} }
  async function pushSelected(listId) {
    const toSend = scored.filter(r => r.selected);
    if (!listId) return setStatus("⚠️ Choose a destination list first.");
    if (!toSend.length) return setStatus("⚠️ Select one or more rows.");
    setStatus("Creating Trello cards…"); let ok = 0, fail = 0;
    for (const r of toSend) {
      try { const desc = `Priority Score: ${r.score}/100\n\n${r.notes || ''}`; const res = await fetch('/api/trello/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idList: listId, name: r.name, desc }) }); if (!res.ok) throw new Error(await res.text()); ok++; } catch { fail++; }
    }
    setStatus(`✅ Created ${ok} card(s)${fail ? `, ${fail} failed` : ''}.`);
  }

  return (
    <div className={`min-h-screen ${dark ? 'bg-[#0b0b0c] text-slate-100' : 'bg-gradient-to-b from-white to-slate-50'} p-6`} style={{ ['--brand']: BRAND.primary }}>
      <style>{`::selection{background: #D7640022}`}</style>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full" style={{background:'var(--brand)'}}></div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              <span className="mr-2">CharterXO</span>
              <span style={{color:'var(--brand)'}}>Agentic Prioritization</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={()=>setDark(v=>!v)}>
              {dark ? <Moon className="w-4 h-4"/> : <Sun className="w-4 h-4"/>}
              {dark ? 'Dark' : 'Light'}
            </Button>
            <label className="relative inline-flex items-center">
              <Input type="file" accept="application/json" className="absolute inset-0 opacity-0 cursor-pointer" onChange={importJSON} />
              <Button variant="outline" className="gap-2"><Upload className="w-4 h-4"/>Import</Button>
            </label>
            <Button variant="outline" className="gap-2" onClick={exportCSV}><Download className="w-4 h-4"/>CSV</Button>
            <Button variant="outline" className="gap-2" onClick={exportJSON}><Save className="w-4 h-4"/>JSON</Button>
            <Button variant="secondary" className="gap-2" onClick={() => window.location.reload()}><RefreshCw className="w-4 h-4"/>Reset</Button>
          </div>
        </header>

        <Tabs defaultValue="prioritizer">
          <TabsList className="grid grid-cols-2 w-full md:w-auto">
            <TabsTrigger value="prioritizer">Prioritizer</TabsTrigger>
            <TabsTrigger value="trello">Trello</TabsTrigger>
          </TabsList>

          {/* PRIORITIZER TAB */}
          <TabsContent value="prioritizer" className="mt-4 space-y-4">
            <div className="grid md:grid-cols-5 gap-4">
              {/* Weights */}
              <Card className="md:col-span-3 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Weighted Criteria</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {Object.keys(PRESETS).map((k) => (
                      <Button key={k} size="sm" variant="outline" onClick={() => setPreset(k)}>{k}</Button>
                    ))}
                  </div>
                  {[ ["Business Impact","impact"], ["Time‑to‑Value","ttv"], ["Feasibility","feasibility"], ["Data Readiness","data"], ["Risk / Compliance (lower better)","risk"], ["Strategic Alignment","align"], ["Stakeholder Buy‑in","buyin"] ].map(([label,key]) => (
                    <div key={key} className="grid grid-cols-6 gap-3 items-center">
                      <div className="col-span-2 text-sm">{label}</div>
                      <div className="col-span-3"><Slider value={[weights[key]]} max={40} step={1} onValueChange={(v)=>updateWeight(key,v)} /></div>
                      <div className="col-span-1 text-right text-sm font-medium tabular-nums">{weights[key]}</div>
                    </div>
                  ))}
                  <div className="text-xs text-slate-500 text-right">Total Weight: <span className="font-medium">{totalWeight}</span> (tip: keep ~100)</div>
                </CardContent>
              </Card>

              {/* Chart */}
              <Card className="md:col-span-2 shadow-sm">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Value vs Effort</CardTitle>
                  <div className="flex items-center gap-2 text-sm">
                    <Checkbox id="chart" checked={showChart} onCheckedChange={(v)=>setShowChart(Boolean(v))} />
                    <label htmlFor="chart">Show</label>
                  </div>
                </CardHeader>
                <CardContent>
                  {showChart ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart>
                          <CartesianGrid />
                          <XAxis type="number" dataKey="effort" name="Effort" tickFormatter={(v)=>String(v)} />
                          <YAxis type="number" dataKey="score" name="Score" domain={[0,100]} />
                          <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ fontSize: 12 }} />
                          <Scatter data={scored} name="Use Cases" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Chart hidden.</p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">Aim for high‑score & low‑effort (top‑left). Effort ≈ (6 − (Feasibility + TTV)) + Cost.</p>
                </CardContent>
              </Card>
            </div>

            {/* Table */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Use Cases</CardTitle>
                <div className="flex gap-2"><Button className="gap-2" onClick={addRow}><Plus className="w-4 h-4"/>Add Row</Button></div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-slate-500">
                        <TableHead className="w-10">Sel</TableHead>
                        <TableHead>Use Case</TableHead>
                        <TableHead className="w-40">Owner</TableHead>
                        <TableHead>Impact</TableHead>
                        <TableHead>TTV</TableHead>
                        <TableHead>Feas.</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Align</TableHead>
                        <TableHead>Buy‑in</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scored.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell><Checkbox checked={!!r.selected} onCheckedChange={(v)=>toggleSelect(r.id,v)} /></TableCell>
                          <TableCell><Input value={r.name} onChange={(e)=>updateRow(r.id,{ name: e.target.value })} className="w-[22rem]" /></TableCell>
                          <TableCell><Input value={r.owner||""} onChange={(e)=>updateRow(r.id,{ owner: e.target.value })} /></TableCell>
                          {(["impact","ttv","feasibility","data","risk","align","buyin","cost"]).map((k) => (
                            <TableCell key={k} className="w-24">
                              <Input type="number" min={0} max={5} value={r[k]??0} onChange={(e)=>updateRow(r.id, { [k]: Number(e.target.value) })} />
                            </TableCell>
                          ))}
                          <TableCell className="font-medium tabular-nums">{r.score}</TableCell>
                          <TableCell className="min-w-[420px]"><Textarea rows={3} value={r.notes||""} onChange={(e)=>updateRow(r.id,{ notes: e.target.value })} /></TableCell>
                          <TableCell><Button variant="ghost" size="icon" onClick={()=>removeRow(r.id)}><Trash2 className="w-4 h-4"/></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TRELLO TAB */}
          <TabsContent value="trello" className="mt-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2"><PlugZap className="w-5 h-5"/> Trello Connection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={fetchBoards} className="gap-2"><Database className="w-4 h-4"/>Connect</Button>
                  <Select value={selectedBoard} onValueChange={fetchLists}>
                    <SelectTrigger className="w-80"><SelectValue placeholder="Choose board" /></SelectTrigger>
                    <SelectContent>
                      {boards.map((b)=> <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={selectedList} onValueChange={setSelectedList}>
                    <SelectTrigger className="w-80"><SelectValue placeholder="Choose list" /></SelectTrigger>
                    <SelectContent>
                      {lists.map((l)=> <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={()=>importFromList(selectedList)} className="gap-2"><Download className="w-4 h-4"/>Import from list</Button>
                  <Button onClick={()=>pushSelected(selectedList)} className="gap-2" style={{background:'var(--brand)', color:'#fff'}}><Send className="w-4 h-4"/>Push selected</Button>
                </div>
                <div className="text-sm text-slate-600 min-h-[28px]">{status}</div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Utilities
function dateStr() { return new Date().toISOString().slice(0,10); }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function csv(v) { return `"${String(v ?? "").replaceAll("\"", "\"\"")}"`; }
