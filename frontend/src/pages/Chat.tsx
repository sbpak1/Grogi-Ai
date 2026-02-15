import React, { useRef, useState } from 'react'
import Tesseract from 'tesseract.js'
import { chatStream, createSession } from '../api'

type MessageItem = { role: 'user' | 'assistant' | 'system'; content: string }
type ImagePayload = { base64: string; ocr: string }

export default function Chat() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [streaming, setStreaming] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [tGauge, setTGauge] = useState(0)
  const [realityScore, setRealityScore] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatWindowRef = useRef<HTMLDivElement>(null)

  function scrollToBottom() {
    setTimeout(() => {
      chatWindowRef.current?.scrollTo(0, chatWindowRef.current.scrollHeight)
    }, 50)
  }

  async function handleSend(e: React.FormEvent | null, imageData?: ImagePayload) {
    if (e) e.preventDefault()
    const text = input.trim()
    if (!text && !imageData) return

    setStreaming(true)

    // 유저 메시지 추가
    const userContent = imageData ? `[이미지] ${text || '(이미지 분석)'}` : text
    setMessages((prev) => [...prev, { role: 'user', content: userContent }])
    setInput('')
    scrollToBottom()

    try {
      // 세션 없으면 자동 생성
      let currentSessionId = sessionId
      if (!currentSessionId) {
        const data = await createSession()
        currentSessionId = data.session_id
        setSessionId(currentSessionId)
      }

      // AI 응답 자리 미리 추가
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
      scrollToBottom()

      chatStream(
        {
          session_id: currentSessionId!,
          message: text || (imageData ? '이미지 분석해줘' : ''),
          images: imageData ? [imageData.base64] : undefined,
          ocr_text: imageData ? imageData.ocr : undefined,
        },
        {
          onMessage(chunk) {
            try {
              const parsed = JSON.parse(chunk)
              const content = parsed.content ?? ''
              if (content) {
                setMessages((prev) => {
                  const copy = [...prev]
                  const last = copy[copy.length - 1]
                  if (last.role === 'assistant') {
                    copy[copy.length - 1] = { ...last, content: last.content + content }
                  }
                  return copy
                })
                scrollToBottom()
              }
            } catch {
              // plain text
              setMessages((prev) => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last.role === 'assistant') {
                  copy[copy.length - 1] = { ...last, content: last.content + chunk }
                }
                return copy
              })
              scrollToBottom()
            }
          },
          onTGauge(val) {
            setTGauge(val)
          },
          onScore(score) {
            setRealityScore(score)
          },
          onDone() {
            setStreaming(false)
          },
          onError(err) {
            setStreaming(false)
            const raw = err instanceof Error ? err.message : String(err ?? '')
            const userMessage = raw.includes('Incorrect API key')
              ? 'AI 서버 API 키가 유효하지 않습니다. ai/.env 의 OPENAI_API_KEY를 확인하세요.'
              : `연결 오류: ${raw || '알 수 없는 오류'}`
            setMessages((prev) => [...prev, { role: 'system', content: userMessage }])
          },
        },
      )
    } catch {
      setStreaming(false)
      setMessages((prev) => [...prev, { role: 'system', content: '세션 생성에 실패했습니다.' }])
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setOcrLoading(true)
    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const raw = event.target?.result as string
        const base64 = raw.split(',')[1]
        const { data: { text } } = await Tesseract.recognize(file, 'kor+eng')
        await handleSend(null, { base64, ocr: text || '' })
        setOcrLoading(false)
      }
      reader.readAsDataURL(file)
    } catch {
      setOcrLoading(false)
      setMessages((prev) => [...prev, { role: 'system', content: 'OCR 처리 실패' }])
    }
  }

  function handleNewChat() {
    setSessionId(null)
    setMessages([])
  }

  return (
    <div className="chatPanel">
      <div className="chatHeader">
        <h2>상담</h2>
        <div style={{ marginLeft: 'auto', marginRight: '10px', fontSize: '0.9rem' }}>
          🔥 T-Gauge: <b>{tGauge}%</b>
        </div>
        <button onClick={handleNewChat} className="newChatBtn">새 상담</button>
      </div>
      <div className="chatWindow" ref={chatWindowRef}>
        {messages.length === 0 && (
          <div className="emptyChat">고민을 말해보세요. Grogi가 들어줄게요.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <span className="msgRole">{m.role === 'user' ? '나' : m.role === 'assistant' ? 'Grogi' : '시스템'}</span>
            <span className="msgContent" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
          </div>
        ))}
        {realityScore && (
          <div className="msg msg-system">
            📊 <b>현실회피지수: {realityScore.total}점</b>
          </div>
        )}
        {streaming && <div className="msg msg-system">응답 중...</div>}
        {ocrLoading && <div className="msg msg-system">이미지 분석 중...</div>}
      </div>
      <form onSubmit={(e) => handleSend(e)} className="chatForm">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="고민을 입력하세요..."
          disabled={streaming || ocrLoading}
        />
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={streaming || ocrLoading}>
          이미지
        </button>
        <button type="submit" disabled={streaming || ocrLoading}>
          전송
        </button>
      </form>
    </div>
  )
}
