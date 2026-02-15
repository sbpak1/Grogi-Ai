import axios from 'axios'
import { fetchEventSource } from '@microsoft/fetch-event-source'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3000'
const api = axios.create({ baseURL: API_BASE || '/' })

export async function kakaoAuth(code: string) {
  const res = await api.post('/api/auth/kakao', { code })
  return res.data
}

export async function createSession(category: string, level: string) {
  const res = await api.post('/api/sessions', { category, level })
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

function normalizeSseData(data: string) {
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

export function chatStream(payload: { sessionId?: string; message: string; images?: string[]; ocr_text?: string }, handlers: { onMessage: (chunk:string)=>void; onDone?: ()=>void; onError?: (err:any)=>void }){
  const token = localStorage.getItem('token')
  const url = `${API_BASE}/api/chat`

  return fetchEventSource(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload),
    async onopen(response) {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
    },
    onmessage(ev){
      if (ev.data === '[DONE]') {
        handlers.onDone && handlers.onDone()
        return
      }

      const parsed = normalizeSseData(ev.data)
      if (typeof parsed === 'string') {
        handlers.onMessage(parsed)
        return
      }

      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.content === 'string') {
          handlers.onMessage(parsed.content)
          return
        }
        if (parsed.error) {
          handlers.onError && handlers.onError(new Error(typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error)))
          return
        }
        // ignore non-text events (status/score/share_card/etc)
        return
      }
    },
    onerror(err){
      handlers.onError && handlers.onError(err)
      throw err
    }
  })
}
