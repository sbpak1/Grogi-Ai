import React from 'react'
import { kakaoAuth } from '../api'

export default function Login({ onLogin }: { onLogin?: () => void }) {
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
    // If Kakao JS SDK is loaded on page, call authorize. Designer will integrate
    if ((window as any).Kakao && (window as any).Kakao.Auth) {
      ; (window as any).Kakao.Auth.authorize()
      return
    }
    alert('Kakao SDK not found — paste auth code below for now')
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
