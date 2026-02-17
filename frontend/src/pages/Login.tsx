import React from 'react'

export default function Login({ onLogin }: { onLogin?: () => void }) {
  const handleKakaoLogin = () => {
    const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY
    const REDIRECT_URI = `${window.location.origin}/auth/kakao`

    if (!KAKAO_KEY) {
      alert('VITE_KAKAO_JS_KEY is missing')
      return
    }

    // Direct redirection to Kakao Auth URL (REST API method)
    // talk_message scope included (talk_calendar removed as per previous request)
    const KAKAO_AUTH_URL = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=profile_nickname,profile_image,talk_message`

    window.location.href = KAKAO_AUTH_URL
  }

  return (
    <div className="loginContainer" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: '#1a1a1a',
      color: '#fff'
    }}>
      <h1 style={{ marginBottom: '2rem', fontSize: '2.5rem', fontWeight: 'bold' }}>Grogi</h1>
      <p style={{ marginBottom: '2rem', color: '#888' }}>이성적인 대화의 시작</p>

      <button
        onClick={handleKakaoLogin}
        style={{
          backgroundColor: '#FEE500',
          color: '#000',
          padding: '12px 24px',
          borderRadius: '8px',
          border: 'none',
          fontSize: '1rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          transition: 'transform 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.558 1.707 4.8 4.34 6.054l-.84 3.12c-.1.385.115.774.5.873a.75.75 0 0 0 .195.027c.285 0 .54-.15.675-.405l1.63-3.045c.81.18 1.66.285 2.5.285 4.97 0 9-3.185 9-7.115S16.97 3 12 3z" />
        </svg>
        카카오 로그인하기
      </button>

      {/* 개발용 Guest 로그인은 하단에 작게 배치 */}
      <button
        onClick={async () => {
          try {
            const { devLogin } = await import('../api')
            const data = await devLogin()
            if (data?.token) {
              localStorage.setItem('token', data.token)
              onLogin && onLogin()
            }
          } catch (err) {
            alert('개발 로그인 실패')
          }
        }}
        style={{
          marginTop: '3rem',
          background: 'none',
          border: 'none',
          color: '#555',
          cursor: 'pointer',
          fontSize: '0.875rem',
          textDecoration: 'underline'
        }}
      >
        Guest 로그인 (Dev)
      </button>
    </div>
  )
}
