import React, { useState } from 'react'
import Chat from './pages/Chat'
import Login from './pages/Login'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '')

  function handleLogin() {
    setToken(localStorage.getItem('token') || '')
  }

  function handleLogout() {
    localStorage.removeItem('token')
    setToken('')
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

  // 로그인 된 상태 → 바로 채팅
  return (
    <div className="app singleChat">
      <header>
        <h1>Grogi</h1>
        <button onClick={handleLogout} className="logoutBtn">로그아웃</button>
      </header>
      <main>
        <Chat />
      </main>
    </div>
  )
}
