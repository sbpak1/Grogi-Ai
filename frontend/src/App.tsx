import React, { useState, useEffect } from 'react'
import Chat from './pages/Chat'
import Login from './pages/Login'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import { getSessions, getMe } from './api'

export default function App() {
  console.log('App Rendering... Current URL:', window.location.href);
  const [token, setToken] = useState(() => localStorage.getItem('token') || '')
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [profile, setProfile] = useState<{ nickname?: string; profileImage?: string; email?: string } | null>(null)

  useEffect(() => {
    console.log('App mounted. Processing URL search params...')
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (code) {
      console.log('Detection: Kakao code found!', code)
      // Use clean URL for state replacement
      window.history.replaceState({}, '', '/')

      import('./api').then(({ kakaoAuth }) => {
        console.log('Calling kakaoAuth API...')
        kakaoAuth(code)
          .then((data) => {
            console.log('Kakao login success:', data)
            if (data?.token) {
              localStorage.setItem('token', data.token)
              setToken(data.token)
            }
          })
          .catch((err) => {
            console.error('Kakao login API call failed:', err)
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

  // Render main layout (always accessible, login triggered via TopBar or when action required)
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
