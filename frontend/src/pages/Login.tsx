import React from 'react'
import { kakaoAuth } from '../api'

export default function Login({ onLogin }: { onLogin?: () => void }) {
  // Check for Kakao auth code in URL on mount
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      // Clear code from URL to prevent re-submission on refresh and clean up path
      window.history.replaceState({}, '', '/')

      kakaoAuth(code)
        .then((data) => {
          if (data?.token) {
            localStorage.setItem('token', data.token)
            onLogin && onLogin()
          }
        })
        .catch(() => alert('Kakao login failed'))
    }
  }, [onLogin])

  async function handleKakaoCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const code = (form.elements.namedItem('code') as HTMLInputElement).value
    try {
      const data = await kakaoAuth(code)
      if (data?.token) localStorage.setItem('token', data.token)
      onLogin && onLogin()
    } catch (err) {
      alert('인증 실패')
    }
  }

  function openKakaoSDK() {
    const w = window as any
    const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY

    if (!w.Kakao || !w.Kakao.Auth) {
      alert('Kakao SDK not found — check script load / SRI / adblock')
      return
    }

    if (!KAKAO_KEY) {
      alert('VITE_KAKAO_JS_KEY is missing')
      return
    }

    if (!w.Kakao.isInitialized()) {
      w.Kakao.init(KAKAO_KEY)
    }

    w.Kakao.Auth.authorize({
      redirectUri: `${window.location.origin}/auth/kakao`,
      scope: 'talk_calendar,talk_message',
    })
  }

  return (
    <div>
      <h2>Login</h2>
      <button onClick={openKakaoSDK}>Kakao 로그인 (SDK)</button>
      <button onClick={async () => {
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
      }} style={{ marginLeft: '10px' }}>
        Guest 로그인 (Dev)
      </button>
      <p>개발용: 인가 코드를 붙여넣어 테스트</p>
      <form onSubmit={handleKakaoCodeSubmit}>
        <input name="code" placeholder="kakao auth code" />
        <button type="submit">Submit</button>
      </form>
    </div>
  )
}
