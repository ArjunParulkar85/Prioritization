import React, { useState } from 'react'

export default function App() {
  const [status, setStatus] = useState('')
  const [boards, setBoards] = useState([])

  async function testTrello() {
    setStatus('Connecting…')
    try {
      const res = await fetch('/api/trello/members/me/boards')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setBoards(data)
      setStatus(`✅ Connected. Found ${data?.length ?? 0} boards.`)
    } catch (e) {
      setStatus(`❌ ${e.message || e}`)
    }
  }

  return (
    <div style={{fontFamily:'system-ui,Arial', padding: 24}}>
      <h1>Agentic Prioritization App</h1>
      <p>This is a minimal starter to verify the Trello proxy works on Vercel.</p>
      <button onClick={testTrello} style={{padding:'8px 12px', cursor:'pointer'}}>Test Trello Connection</button>
      <div style={{marginTop:12}}>{status}</div>
      <ul>
        {boards?.map(b => <li key={b.id}>{b.name} <small>({b.id})</small></li>)}
      </ul>
      <p style={{marginTop:24, color:'#555'}}>Once this is working, we can replace this screen with the full prioritization UI.</p>
    </div>
  )
}
