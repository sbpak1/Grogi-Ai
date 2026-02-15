import axios from 'axios'
import { fetchEventSource } from '@microsoft/fetch-event-source'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3000'
const api = axios.create({ baseURL: API_BASE })

// 요청마다 토큰 자동 첨부
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export async function kakaoAuth(code: string) {
  const res = await api.post('/api/auth/kakao', { code })
  return res.data
}

export async function createSession() {
  const res = await api.post('/api/sessions')
  return res.data
}

export async function getSessions() {
  const res = await api.get('/api/sessions')
  return res.data
}

export async function getChatHistory(sessionId: string) {
  const res = await api.get(`/api/chat/${sessionId}`)
  return res.data
}

export async function postShare(messageId: string) {
  const res = await api.post('/api/share', { message_id: messageId })
  return res.data
}

export function chatStream(
  payload: { session_id: string; message: string; images?: string[]; ocr_text?: string },
  handlers: { onMessage: (chunk: string) => void; onDone?: () => void; onError?: (err: any) => void }
) {
  const token = localStorage.getItem('token')

  return fetchEventSource(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    async onopen(response) {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    },
    onmessage(ev) {
      if (ev.data === '[DONE]') {
        handlers.onDone?.()
      } else {
        handlers.onMessage(ev.data)
      }
    },
    onerror(err) {
      handlers.onError?.(err)
      throw err
    },
  })
}
