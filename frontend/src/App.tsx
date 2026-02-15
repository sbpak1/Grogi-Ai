import React, { useState } from 'react'
import Login from './pages/Login'
import Sessions from './pages/Sessions'
import Chat from './pages/Chat'

export default function App() {
  const [page, setPage] = useState<'login'|'sessions'|'chat'>('login')
  const [sessionId, setSessionId] = useState<string | null>(null)

  return (
    <div className="app">
      <header>
        <h1>Grogi</h1>
        <nav>
          <button onClick={()=>setPage('login')}>Login</button>
          <button onClick={()=>setPage('sessions')}>Sessions</button>
          <button onClick={()=>setPage('chat')} disabled={!sessionId}>Chat</button>
        </nav>
      </header>
      <main>
        {page === 'login' && <Login onLogin={()=>setPage('sessions')} />}
        {page === 'sessions' && <Sessions onOpen={(id)=>{ setSessionId(id); setPage('chat')}} />}
        {page === 'chat' && sessionId && <Chat sessionId={sessionId} />}
      </main>
    </div>
  )
}
