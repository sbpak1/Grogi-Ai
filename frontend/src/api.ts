import axios from 'axios'
import { fetchEventSource } from '@microsoft/fetch-event-source'

const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

let API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || ''

// 🚀 실서버(grogi.store)인데 API 주소가 localhost로 잡혀있거나 비어있으면 
// 무조건 백엔드 실서버 주소(https://api.grogi.store)를 사용하도록 강제합니다.
if (!isLocal && (!API_BASE || API_BASE.includes('localhost'))) {
  API_BASE = 'https://api.grogi.store'
} else if (isLocal && !API_BASE) {
  API_BASE = 'http://localhost:3000'
}

const api = axios.create({ baseURL: API_BASE })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export async function kakaoAuth(code: string, redirectUri?: string) {
  const res = await api.post('/api/auth/kakao', { code, redirectUri })
  return res.data
}

export async function devLogin() {
  const res = await api.post('/api/auth/dev-login')
  return res.data
}

export async function getMe() {
  const res = await api.get('/api/auth/me')
  return res.data
}

export async function updateProfile(data: { nickname?: string; profileImage?: string; email?: string }) {
  const res = await api.patch('/api/auth/profile', data)
  return res.data
}

export async function updateSettings(settings: {
  fontSize?: 'small' | 'medium' | 'large';
  expertise?: 'career' | 'love' | 'finance' | 'self' | 'etc';
  responseStyle?: 'short' | 'long';
  privateMode?: boolean;
}) {
  const res = await api.patch('/api/auth/settings', settings)
  return res.data
}

export async function updateSessionPrivacy(sessionId: string, privateMode: boolean) {
  const res = await api.patch(`/api/sessions/${sessionId}/private`, { privateMode })
  return res.data
}

export async function createSession(privateMode = false, category = 'etc') {
  const res = await api.post('/api/sessions', { category, privateMode })
  return { ...res.data, session_id: res.data?.session_id || res.data?.id }
}

export async function getSessions() {
  const res = await api.get('/api/sessions')
  return res.data
}

export async function deleteSession(sessionId: string) {
  const res = await api.delete(`/api/sessions/${sessionId}`)
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

function isIntermediateToken(text: string) {
  const t = text.trim()
  if (!t) return true
  if (t === 'SAFE' || t === 'CRISIS') return true
  if (['career', 'love', 'finance', 'self', 'etc'].includes(t)) return true
  if (/^-?\d+$/.test(t)) return true
  return false
}

export function chatStream(
  payload: { sessionId?: string; session_id?: string; message: string; messageId?: string; images?: string[]; ocr_text?: string; pdfs?: Array<{ filename: string; content: string }>; privateMode?: boolean },
  handlers: {
    onMessage: (chunk: string) => void;
    onDone?: () => void;
    onError?: (err: any) => void;
    onMeta?: (text: string) => void;
    onScore?: (score: any) => void;
    onShareCard?: (card: any) => void;
    onCrisis?: (data: { message: string; hotlines: any[]; follow_up?: string }) => void;
  }
): AbortController {
  const token = localStorage.getItem('token')
  const normalizedPayload = {
    sessionId: payload.sessionId || payload.session_id,
    messageId: payload.messageId,
    message: payload.message,
    images: payload.images,
    ocr_text: payload.ocr_text,
    pdfs: payload.pdfs,
    privateMode: (payload as any).privateMode,
  }
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    handlers.onDone?.()
  }

  const abortController = new AbortController()

  fetchEventSource(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(normalizedPayload),
    signal: abortController.signal,
    async onopen(response) {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    },
    onmessage(ev) {
      if (ev.data === '[DONE]') {
        finish()
        return
      }

      const parsed = normalizeSseData(ev.data)

      if (ev.event === 'analysis_preview') {
        if (parsed && typeof parsed === 'object') {
          handlers.onMeta?.(JSON.stringify(parsed, null, 2))
          return
        }

        if (typeof parsed === 'string') {
          const t = parsed.trim()
          try {
            handlers.onMeta?.(JSON.stringify(JSON.parse(t), null, 2))
          } catch {
            handlers.onMeta?.(t)
          }
        }
        return
      }

      if (ev.event === 'crisis') {
        if (parsed && typeof parsed === 'object') {
          handlers.onCrisis?.(parsed as any)
        }
        finish()
        return
      }

      if (ev.event === 'error') {
        if (parsed && typeof parsed === 'object') {
          const errMsg =
            typeof (parsed as any).error === 'string'
              ? (parsed as any).error
              : typeof (parsed as any).message === 'string'
                ? (parsed as any).message
                : 'AI stream error'
          handlers.onError?.(new Error(errMsg))
        } else {
          handlers.onError?.(new Error(typeof parsed === 'string' ? parsed : 'AI stream error'))
        }
        finish()
        return
      }

      if (ev.event === 'score' && parsed && typeof parsed === 'object') {
        handlers.onScore?.(parsed)
        return
      }

      if (ev.event === 'share_card' && parsed && typeof parsed === 'object') {
        handlers.onShareCard?.(parsed)
        return
      }

      if (ev.event === 'token') {
        if (parsed && typeof parsed === 'object' && typeof (parsed as any).content === 'string') {
          if (!isIntermediateToken((parsed as any).content)) handlers.onMessage((parsed as any).content)
          return
        }
        if (typeof parsed === 'string' && !isIntermediateToken(parsed)) {
          handlers.onMessage(parsed)
        }
        return
      }

      if (typeof parsed === 'string') {
        if (!isIntermediateToken(parsed)) handlers.onMessage(parsed)
        return
      }

      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.content === 'string' && !isIntermediateToken(parsed.content)) {
          handlers.onMessage(parsed.content)
          return
        }

        if (
          typeof (parsed as any).total === 'number' &&
          ((parsed as any).scores || (parsed as any).breakdown)
        ) {
          handlers.onScore?.(parsed)
          return
        }

        if ((parsed as any).summary && (parsed as any).actions) {
          handlers.onShareCard?.(parsed)
          return
        }

        if (typeof (parsed as any).summary === 'string' && typeof (parsed as any).total === 'number') {
          // Old format fallback
          handlers.onMeta?.(`분석: ${(parsed as any).summary}`)
          return
        }


        if ((parsed as any).error) {
          const err = typeof (parsed as any).error === 'string' ? (parsed as any).error : JSON.stringify((parsed as any).error)
          handlers.onError?.(new Error(err))
          finish()
          return
        }

        if (
          typeof (parsed as any).code === 'string' &&
          (parsed as any).code.toUpperCase().includes('ERROR') &&
          typeof (parsed as any).message === 'string'
        ) {
          handlers.onError?.(new Error((parsed as any).message))
          finish()
          return
        }
      }
    },
    onerror(err) {
      // 치명적 에러로 간주하여 재시도 하지 않음
      if (abortController.signal.aborted) return
      handlers.onError?.(err)
      throw err // 이 라이브러리는 throw하면 재시도를 중단함
    },
    openWhenHidden: true, // 백그라운드 탭에서도 연결 유지 (재연결 방지)
    onclose() {
      if (!finished) {
        // [DONE] 전에 연결이 끊김 → 에러 처리 (탭 전환 중 브라우저가 끊은 경우 등)
        handlers.onError?.(new Error('연결이 끊어졌습니다. 다시 시도해주세요.'))
        finished = true
      }
      finish()
      // fetchEventSource는 onclose에서 throw하지 않으면 자동 재연결(=POST 재전송)함
      throw new Error('SSE closed')
    },
  })

  return abortController
}

// 카카오 나에게 메시지 보내기 테스트용
export async function sendSelfMessage(text: string) {
  const res = await api.post('/api/message/send', { text });
  return res.data;
}

export async function withdrawAccount() {
  const res = await api.delete('/api/auth/withdrawal');
  return res.data;
}
