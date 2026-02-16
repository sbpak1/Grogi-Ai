import React, { useState, useEffect } from 'react'
import Chat from './pages/Chat'
import Login from './pages/Login'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import { getSessions, getMe } from './api'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '')
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [profile, setProfile] = useState<{ nickname?: string; profileImage?: string; email?: string } | null>(null)

  useEffect(() => {
    if (token) {
      refreshSessions()
      fetchProfile()
    } else {
      setProfile(null)
      setSessions([])
    }
  }, [token])

  async function refreshSessions() {
    try {
      const data = await getSessions()
      setSessions(Array.isArray(data) ? data : data.sessions || [])
    } catch (err) {
      console.error('Failed to load sessions', err)
    }
  }

  async function fetchProfile() {
    try {
      const data = await getMe()
      setProfile(data)
    } catch (err) {
      console.error('Failed to fetch profile', err)
    }
  }

  function handleLogin() {
    setToken(localStorage.getItem('token') || '')
  }

  function handleLogout() {
    localStorage.removeItem('token')
    setToken('')
    setProfile(null)
    setSessions([])
  }

  function handleNewChat() {
    setCurrentSessionId(null)
  }

  // 로그인 안 된 상태면 로그인 페이지
  if (!token) {
    return (
      <div className="app">
        <header>
          <h1>Grogi</h1>
        </header>
        <main>
          <Login onLogin={handleLogin} />
        </main>
      </div>
    )
  }

  // 로그인 된 상태 → 바로 채팅 (Sidebar + TopBar 레이아웃)
  return (
    <div className="app">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!isSidebarCollapsed)}
        onNewChat={handleNewChat}
        onSelectSession={(id) => setCurrentSessionId(id)}
        currentSessionId={currentSessionId}
        sessions={sessions}
      />

      <div className="mainLayout">
        <TopBar
          onLogout={handleLogout}
          profile={profile}
          onProfileUpdate={(updated) => setProfile(updated)}
        />
        <main className="chatContainer">
          <Chat
            sessionId={currentSessionId}
            onSessionStarted={(id) => {
              setCurrentSessionId(id)
              refreshSessions()
            }}
          />
        </main>
      </div>
    </div>
  )
}
