import React, { useEffect, useState } from 'react'
import Chat from './pages/Chat'

export default function App() {
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('sessionId') || 'dev-session')
  const [token, setToken] = useState(() => localStorage.getItem('token') || '')

  useEffect(() => {
    localStorage.setItem('sessionId', sessionId)
  }, [sessionId])

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
  }, [token])

  return (
    <div className="app singleChat">
      <header>
        <h1>Grogi Chat</h1>
      </header>
      <main>
        <div className="chatConfig">
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="session id"
          />
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="bearer token (optional)"
            type="password"
          />
        </div>
        <Chat key={sessionId} sessionId={sessionId} />
      </main>
    </div>
  )
}
