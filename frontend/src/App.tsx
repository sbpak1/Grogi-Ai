import React, { useState, useEffect } from 'react'
import Chat from './pages/Chat'
import Login from './pages/Login'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import SettingsModal from './components/SettingsModal'
import { LegalModal, PrivacyContent, TermsContent } from './components/LegalModals'
import { getSessions, getMe, kakaoAuth } from './api'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '')
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false)
  const [isTermsOpen, setIsTermsOpen] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Array<{ id: string; title?: string; createdAt: string; privateMode?: boolean; messages?: Array<{ content: string }> }>>([])
  const [profile, setProfile] = useState<{
    nickname?: string;
    profileImage?: string;
    email?: string;
    fontSize: 'small' | 'medium' | 'large';
    expertise: string;
    responseStyle: 'short' | 'long';
    privateMode: boolean;
  } | null>(null)

  useEffect(() => {
    if (profile?.fontSize) {
      const sizes = { small: '12px', medium: '16px', large: '24px' };
      document.documentElement.style.setProperty('--base-font-size', sizes[profile.fontSize]);
    }
  }, [profile?.fontSize])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setSidebarCollapsed(true)
      }
    }
    window.addEventListener('resize', handleResize)
    handleResize() // Initial check
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (code) {
      window.history.replaceState({}, '', '/')
      kakaoAuth(code, `${window.location.origin}/auth/kakao`)
        .then((data) => {
          if (data?.token) {
            localStorage.setItem('token', data.token)
            setToken(data.token)
          }
        })
        .catch(() => alert('로그인에 실패했습니다.'))
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

  function handleLogout() {
    localStorage.removeItem('token')
    setToken('')
    setProfile(null)
    setSessions([])
    document.documentElement.style.setProperty('--base-font-size', '16px');
  }

  const [isNextSessionPrivate, setIsNextSessionPrivate] = useState(false);
  const [isCurrentSessionPrivate, setIsCurrentSessionPrivate] = useState(false);

  async function handleSessionDeleted(id: string) {
    if (currentSessionId === id) {
      setCurrentSessionId(null);
    }
    refreshSessions();
  }

  return (
    <div className="app">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!isSidebarCollapsed)}
        onNewChat={() => {
          setCurrentSessionId(null);
          setIsNextSessionPrivate(false);
          setIsCurrentSessionPrivate(false);
        }}
        onSelectSession={(id) => {
          setCurrentSessionId(id);
          setIsNextSessionPrivate(false);
          setIsCurrentSessionPrivate(false);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        currentSessionId={currentSessionId}
        sessions={sessions}
        isNextSessionPrivate={isNextSessionPrivate}
        isCurrentSessionPrivate={isCurrentSessionPrivate}
        onSessionDeleted={handleSessionDeleted}
      />

      <div className="mainLayout">
        <TopBar
          onLogout={handleLogout}
          profile={profile}
          onProfileUpdate={(updated) => setProfile((prev) => prev ? { ...prev, ...updated } : prev)}
          onHome={() => {
            setCurrentSessionId(null);
            setIsNextSessionPrivate(false);
            setIsCurrentSessionPrivate(false);
          }}
          onOpenPrivacy={() => setIsPrivacyOpen(true)}
          onOpenTerms={() => setIsTermsOpen(true)}
        />
        <main className="chatContainer">
          <Chat
            sessionId={currentSessionId}
            isPrivateRequested={isNextSessionPrivate || isCurrentSessionPrivate}
            onSessionStarted={(id) => {
              setCurrentSessionId(id)
              setIsCurrentSessionPrivate(isNextSessionPrivate) // 시작된 세션의 프라이빗 여부 확정
              setIsNextSessionPrivate(false)
              refreshSessions()
            }}
          />
        </main>
      </div>

      {profile && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onStartPrivateChat={() => {
            setCurrentSessionId(null);
            setIsNextSessionPrivate(true);
            setIsCurrentSessionPrivate(false); // 새로운 세션 준비 중이므로 현재 상태 초기화
          }}
          settings={profile}
          onUpdate={(updated) => setProfile((prev) => prev ? { ...prev, ...updated } : prev)}
        />
      )}

      <LegalModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
        title="개인정보처리방침"
        content={<PrivacyContent />}
      />

      <LegalModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        title="서비스 약관"
        content={<TermsContent />}
      />
    </div>
  )
}
