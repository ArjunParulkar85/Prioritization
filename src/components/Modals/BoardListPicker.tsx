import React from 'react'
import type { TrelloBoard, TrelloList } from '@services/trello'
import { getMyBoards, getLists } from '@services/trello'

type Props = {
  open: boolean
  onClose: () => void
  onPick: (payload: { boardId: string; boardName: string; listId: string; listName: string }) => void
}

export default function BoardListPicker({ open, onClose, onPick }: Props) {
  const [loadingBoards, setLoadingBoards] = React.useState(false)
  const [loadingLists, setLoadingLists] = React.useState(false)
  const [boards, setBoards] = React.useState<TrelloBoard[]>([])
  const [lists, setLists] = React.useState<TrelloList[]>([])
  const [boardId, setBoardId] = React.useState('')
  const [listId, setListId] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setLoadingBoards(true)
    setBoards([])
    setLists([])
    setBoardId('')
    setListId('')
    getMyBoards()
      .then(setBoards)
      .catch(e => console.error('Get boards failed', e))
      .finally(() => setLoadingBoards(false))
  }, [open])

  React.useEffect(() => {
    if (!boardId) { setLists([]); setListId(''); return }
    setLoadingLists(true)
    getLists(boardId)
      .then(setLists)
      .catch(e => console.error('Get lists failed', e))
      .finally(() => setLoadingLists(false))
  }, [boardId])

  if (!open) return null

  const boardName = boards.find(b => b.id === boardId)?.name ?? ''
  const listName = lists.find(l => l.id === listId)?.name ?? ''

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'grid', placeItems:'center', zIndex:60 }} onClick={onClose}>
      <div className="card" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Choose Board & List</h3>

        <label style={{ display:'block', marginBottom:6 }}>Board</label>
        <select value={boardId} onChange={e => setBoardId(e.target.value)} disabled={loadingBoards} style={{ width:'100%', marginBottom:12 }}>
          <option value="" disabled>{loadingBoards ? 'Loading boards…' : 'Select a board'}</option>
          {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <label style={{ display:'block', marginBottom:6 }}>List</label>
        <select value={listId} onChange={e => setListId(e.target.value)} disabled={!boardId || loadingLists} style={{ width:'100%', marginBottom:16 }}>
          <option value="" disabled>{!boardId ? 'Pick a board first' : (loadingLists ? 'Loading lists…' : 'Select a list')}</option>
          {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button
            onClick={() => onPick({ boardId, boardName, listId, listName })}
            disabled={!boardId || !listId}
            style={{ borderColor:'var(--accent)', color:'var(--accent)' }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
