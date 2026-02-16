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
  const handleTestCalendar = async () => {
    try {
      const start = new Date(Date.now() + 3600000).toISOString(); // 1시간 뒤
      const end = new Date(Date.now() + 7200000).toISOString();   // 2시간 뒤

      // api.ts에서 createCalendarEvent를 import 해와야 함
      // 여기서는 동적 import나 직접 fetch를 쓰거나, api.ts에 추가한 함수를 써야 함.
      // 편의상 위에서 import 했다고 가정하고 작성하거나, window 객체 등을 이용.
      // 하지만 가장 깔끔한 건 api.ts에 추가한 함수를 쓰는 것.
      // (import 문을 상단에 추가해야 함)
      const { createCalendarEvent } = await import("./api");

      await createCalendarEvent({
        title: "Grogi 캘린더 테스트 📅",
        description: "이것은 테스트 일정입니다.",
        startAt: start,
        endAt: end
      });
      alert("성공! 카카오톡 캘린더를 확인해보세요.");
    } catch (err) {
      console.error(err);
      alert("실패! 콘솔 로그를 확인하세요.");
    }
  };

  const handleTestMessage = async () => {
    try {
      const { sendSelfMessage } = await import("./api");
      await sendSelfMessage("안녕하세요! Grogi에서 보낸 테스트 메시지입니다. 🦜");
      alert("성공! 카카오톡 나에게 보내기를 확인해보세요.");
    } catch (err) {
      console.error(err);
      alert("실패! 콘솔 로그를 확인하세요.");
    }
  };

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
        <div className="flex gap-2">
          <button
            onClick={handleTestCalendar}
            className="bg-yellow-400 text-black px-3 py-1 rounded text-sm font-bold hover:bg-yellow-500 transition-colors"
          >
            📅 캘린더
          </button>
          <button
            onClick={handleTestMessage}
            className="bg-yellow-400 text-black px-3 py-1 rounded text-sm font-bold hover:bg-yellow-500 transition-colors"
          >
            💬 메시지
          </button>
          <button onClick={handleLogout} className="logoutBtn">로그아웃</button>
        </div>
      </header>
      <main>
        <Chat />
      </main>
    </div>
  )
}
