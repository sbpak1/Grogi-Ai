import axios from 'axios'
import { fetchEventSource } from '@microsoft/fetch-event-source'

const api = axios.create({ baseURL: '/' })

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

export function chatStream(payload: { sessionId?: string; message: string }, handlers: { onMessage: (chunk:string)=>void; onDone?: ()=>void; onError?: (err:any)=>void }){
  return fetchEventSource('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`
    },
    body: JSON.stringify(payload),
    onmessage(ev){
      if(ev.data === '[DONE]'){
        handlers.onDone && handlers.onDone()
      } else {
        handlers.onMessage(ev.data)
      }
    },
    onerror(err){
      handlers.onError && handlers.onError(err)
    }
  })
}
