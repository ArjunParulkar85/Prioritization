import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Download, Upload, RefreshCw, Plus, Trash2, Save, PlugZap } from "lucide-react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

/**
 * Agentic Use‑Case Prioritization App (v2, with Trello proxy hookup)
 * - Weighted scoring with editable criteria (0–5)
 * - Preset templates (Board Pitch, Ops Quick Wins, R&D Bets)
 * - Value vs Effort chart
 * - Import/Export JSON, Export CSV, copy to clipboard
 * - Inline editing of use cases
 * - NEW: Trello panel to test the secure proxy connection
 *
 * Backend (deploy separately via Vercel):
 *   File: /api/trello/[...path].js (provided in chat)
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

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return Array.from(buf).map((n) => n.toString(36)).join("-");
  }
  return Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

export default function PrioritizationApp() {
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [rows, setRows] = useState([startRow(
    "Autonomous Case Triage in Service Cloud",
    "CX Ops",
    "Use Agentforce to auto‑classify, route, and draft replies.", 4,4,4,4,2,5,4,2
  ), startRow(
    "Sales Email Agent for Pipeline Acceleration",
    "Sales Ops",
    "Auto‑draft personalization, next‑best‑action, call summaries.", 5,3,3,3,3,4,4,3
  ), startRow(
    "Knowledge Mining for Field Service",
    "FS Tech",
    "Semantic search + agent playbooks for technicians.", 4,2,3,3,2,4,3,4
  )]);
  const [showEffort, setShowEffort] = useState(true);
  const [trelloBoards, setTrelloBoards] = useState([]);
  const [trelloStatus, setTrelloStatus] = useState("");

  const totalWeight = useMemo(() => Object.values(weights).reduce((a, b) => a + (isNaN(b) ? 0 : b), 0), [weights]);

  const scored = useMemo(() => rows
    .map((r) => scoreRow(r, weights, totalWeight))
    .sort((a, b) => b.score - a.score), [rows, weights, totalWeight]);

  function updateWeight(key, value) { setWeights((w) => ({ ...w, [key]: value[0] })); }
  function updateRow(id, patch) { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))); }
  function addRow() { setRows((rs) => [...rs, startRow("New Use Case", "", "")]); }
  function removeRow(id) { setRows((rs) => rs.filter((r) => r.id !== id)); }
  function setPreset(name) { setWeights(PRESETS[name]); }

  function exportJSON() {
    const blob = new Blob([JSON.stringify({ weights, rows }, null, 2)], { type: "application/json" });
    downloadBlob(blob, `agentic-prioritization-${dateStr()}.json`);
  }

  function exportCSV() {
    const header = ["Name","Owner","Score","Impact","TTV","Feasibility","Data","Risk(Rev)","Alignment","BuyIn","Cost","Notes"];
    const body = scored.map(r => [csv(r.name), csv(r.owner), r.score, r.impact, r.ttv, r.feasibility, r.data, r.risk, r.align, r.buyin, r.cost, csv(r.notes)].join(","));
    const csvText = [header.join(","), ...body].join("\n");
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, `agentic-prioritization-${dateStr()}.csv`);
  }

  function importJSON(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data.weights) setWeights(data.weights);
        if (data.rows) setRows(data.rows);
      } catch {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
    e.currentTarget.value = "";
  }

  async function testTrelloConnection() {
    setTrelloStatus("Connecting…");
    try {
      const res = await fetch(`/api/trello/members/me/boards`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTrelloBoards(data);
      setTrelloStatus(`✅ Connected. Found ${data?.length ?? 0} boards.`);
    } catch (e) {
      setTrelloStatus(`❌ ${e.message ?? e}`);
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Agentic Use‑Case Prioritization</h1>
          <div className="flex gap-2">
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

          <TabsContent value="prioritizer" className="mt-4">
            <div className="grid md:grid-cols-5 gap-4">
              <Card className="md:col-span-3 shadow-md">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-medium">Weighted Criteria</h2>
                    <Tabs defaultValue="Board Pitch" onValueChange={setPreset}>
                      <TabsList className="grid grid-cols-3">
                        {Object.keys(PRESETS).map((k) => (
                          <TabsTrigger key={k} value={k}>{k}</TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="space-y-5">
                    {([
                      ["Business Impact", "impact"],
                      ["Time‑to‑Value", "ttv"],
                      ["Feasibility", "feasibility"],
                      ["Data Readiness", "data"],
                      ["Risk / Compliance (lower is better)", "risk"],
                      ["Strategic Alignment", "align"],
                      ["Stakeholder Buy‑in", "buyin"],
                    ]).map(([label, key]) => (
                      <div key={key} className="grid grid-cols-6 gap-3 items-center">
                        <div className="col-span-2 text-sm">{label}</div>
                        <div className="col-span-3"><Slider value={[weights[key]]} max={40} step={1} onValueChange={(v) => updateWeight(key, v)} /></div>
                        <div className="col-span-1 text-right text-sm font-medium tabular-nums">{weights[key]}</div>
                      </div>
                    ))}

                    <div className="text-xs text-slate-500 text-right">Total Weight: <span className="font-medium">{totalWeight}</span> (tip: keep ~100)</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2 shadow-md">
                <CardContent className="p-4 md:p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-medium">Chart</h2>
                    <div className="flex items-center gap-2 text-sm">
                      <Checkbox id="eff" checked={showEffort} onCheckedChange={(v) => setShowEffort(Boolean(v))} />
                      <label htmlFor="eff">Show Value vs Effort</label>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart>
                        <CartesianGrid />
                        <XAxis type="number" dataKey="effort" name="Effort" tickFormatter={(v) => String(v)} />
                        <YAxis type="number" dataKey="score" name="Score" domain={[0, 100]} />
                        <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 12 }} />
                        <Scatter data={scored} name="Use Cases" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-slate-500">Aim for high‑score & low‑effort (top‑left). Effort is roughly lower when Feasibility and Time‑to‑Value are higher, adjusted by Cost.</p>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-md mt-4">
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl font-medium">Use Cases</h2>
                  <div className="flex gap-2">
                    <Button className="gap-2" onClick={addRow}><Plus className="w-4 h-4"/>Add</Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="p-2">Rank</th>
                        <th className="p-2">Use Case</th>
                        <th className="p-2">Owner</th>
                        <th className="p-2">Impact</th>
                        <th className="p-2">TTV</th>
                        <th className="p-2">Feas.</th>
                        <th className="p-2">Data</th>
                        <th className="p-2">Risk</th>
                        <th className="p-2">Align</th>
                        <th className="p-2">Buy‑in</th>
                        <th className="p-2">Cost</th>
                        <th className="p-2">Score</th>
                        <th className="p-2">Notes</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {scored.map((r, i) => (
                        <tr key={r.id} className="border-t">
                          <td className="p-2 tabular-nums">{i + 1}</td>
                          <td className="p-2"><Input value={r.name} onChange={(e) => updateRow(r.id, { name: e.target.value })} /></td>
                          <td className="p-2 w-40"><Input value={r.owner ?? ""} onChange={(e) => updateRow(r.id, { owner: e.target.value })} /></td>
                          <td className="p-2 w-20"><ScoreInput value={r.impact} onChange={(v) => updateRow(r.id, { impact: v })} /></td>
                          <td className="p-2 w-20"><ScoreInput value={r.ttv} onChange={(v) => updateRow(r.id, { ttv: v })} /></td>
                          <td className="p-2 w-20"><ScoreInput value={r.feasibility} onChange={(v) => updateRow(r.id, { feasibility: v })} /></td>
                          <td className="p-2 w-20"><ScoreInput value={r.data} onChange={(v) => updateRow(r.id, { data: v })} /></td>
                          <td className="p-2 w-20"><ScoreInput value={r.risk} onChange={(v) => updateRow(r.id, { risk: v })} /></td>
                          <td className="p-2 w-20"><ScoreInput value={r.align} onChange={(v) => updateRow(r.id, { align: v })} /></td>
                          <td className="p-2 w-20"><ScoreInput value={r.buyin} onChange={(v) => updateRow(r.id, { buyin: v })} /></td>
                          <td className="p-2 w-20"><ScoreInput value={r.cost} onChange={(v) => updateRow(r.id, { cost: v })} /></td>
                          <td className="p-2 tabular-nums font-medium">{r.score}</td>
                          <td className="p-2 min-w-[240px]"><Textarea rows={1} value={r.notes ?? ""} onChange={(e) => updateRow(r.id, { notes: e.target.value })} /></td>
                          <td className="p-2"><Button variant="ghost" size="icon" onClick={() => removeRow(r.id)}><Trash2 className="w-4 h-4"/></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trello" className="mt-4">
            <Card className="shadow-md">
              <CardContent className="p-4 md:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-medium flex items-center gap-2"><PlugZap className="w-5 h-5"/>Trello Connection (via secure proxy)</h2>
                  <Button onClick={testTrelloConnection}>Test Connection</Button>
                </div>
                <p className="text-sm text-slate-600">Click “Test Connection” after you deploy the backend proxy (instructions + code provided in chat). If successful, your Trello boards will appear below.</p>
                <div className="text-sm">{trelloStatus}</div>
                <div className="grid md:grid-cols-2 gap-3">
                  {trelloBoards?.map((b) => (
                    <div key={b.id} className="border rounded-xl p-3 bg-white flex flex-col">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-slate-500">{b.id}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

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

function startRow(name, owner, notes, impact=3, ttv=3, feasibility=3, data=3, risk=3, align=3, buyin=3, cost=3) {
  return { id: cryptoRandomId(), name, owner, notes, impact, ttv, feasibility, data, risk, align, buyin, cost };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function dateStr() { return new Date().toISOString().slice(0,10); }

function csv(v) { return `"${String(v ?? "").replaceAll("\"", "\"\"")}"`; }

function ScoreInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Input type="number" min={0} max={5} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} className="w-16" />
      <Slider value={[value ?? 0]} min={0} max={5} step={1} onValueChange={(v) => onChange(v[0])} className="w-24" />
    </div>
  );
}
