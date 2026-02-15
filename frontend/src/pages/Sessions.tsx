import React, { useState } from 'react'
import { createSession } from '../api'

export default function Sessions({ onOpen }: { onOpen?: (id:string)=>void }){
  const [category, setCategory] = useState('default')
  const [level, setLevel] = useState('normal')
  const [created, setCreated] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent){
    e.preventDefault()
    try{
      const data = await createSession(category, level)
      setCreated(data.sessionId || data.id || null)
    }catch(err){
      alert('세션 생성 실패')
    }
  }

  return (
    <div>
      <h2>Sessions</h2>
      <form onSubmit={handleCreate}>
        <label>Category: <input value={category} onChange={e=>setCategory(e.target.value)} /></label>
        <label>Level: <input value={level} onChange={e=>setLevel(e.target.value)} /></label>
        <button type="submit">Create Session</button>
      </form>
      {created && (
        <div>
          <p>Created session: {created}</p>
          <button onClick={()=>onOpen && onOpen(created)}>Open Chat</button>
        </div>
      )}
    </div>
  )
}
