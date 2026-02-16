import React, { useState, useEffect } from 'react'
import Chat from './pages/Chat'
// import Login from './pages/Login'
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
    // Check for Kakao auth code in URL
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      window.history.replaceState({}, '', window.location.pathname)
      import('./api').then(({ kakaoAuth }) => {
        kakaoAuth(code)
          .then((data) => {
            if (data?.token) {
              localStorage.setItem('token', data.token)
              setToken(data.token)
            }
          })
          .catch((err) => {
            console.error('Kakao login failed', err)
            alert('로그인에 실패했습니다.')
          })
      })
    }
  }, [])

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
