import React, { useRef, useState, useEffect } from 'react'
import { chatStream, createSession } from '../api'

type MessageItem = { role: 'user' | 'assistant' | 'system'; content: string }

export default function Chat() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [streaming, setStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [analysisPreview, setAnalysisPreview] = useState<string | null>(null)
  const [attachedImages, setAttachedImages] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatWindowRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  function scrollToBottom() {
    setTimeout(() => {
      chatWindowRef.current?.scrollTo(0, chatWindowRef.current.scrollHeight)
    }, 50)
  }

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const text = input.trim()
    if (!text && attachedImages.length === 0) return
    if (streaming) return

    setStreaming(true)
    setAnalysisPreview(null)

    // 유저 메시지 추가
    const userContent = attachedImages.length > 0
      ? `[이미지 ${attachedImages.length}장] ${text || '(이미지 분석 요청)'}`
      : text

    setMessages((prev) => [...prev, { role: 'user', content: userContent }])

    const currentImages = [...attachedImages]
    setInput('')
    setAttachedImages([])
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
          message: text || (currentImages.length > 0 ? '이미지 분석해줘' : ''),
          images: currentImages.length > 0 ? currentImages : undefined,
        },
        {
          onMessage(chunk) {
            setAnalysisPreview(null)
            try {
              const parsed = JSON.parse(chunk)
              const content = parsed.content ?? ''
              if (content) {
                setMessages((prev) => {
                  const copy = [...prev]
                  const last = copy[copy.length - 1]
                  if (last && last.role === 'assistant') {
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
                if (last && last.role === 'assistant') {
                  copy[copy.length - 1] = { ...last, content: last.content + chunk }
                }
                return copy
              })
              scrollToBottom()
            }
          },
          onScore(score) {
            const summary = typeof score?.summary === 'string' ? score.summary.trim() : ''
            if (summary) {
              setMessages((prev) => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                if (last && last.role === 'assistant' && !last.content.trim()) {
                  copy[copy.length - 1] = { ...last, content: summary }
                }
                return copy
              })
              scrollToBottom()
            }
          },
          onMeta(text) {
            setAnalysisPreview(text)
            scrollToBottom()
          },
          onDone() {
            setAnalysisPreview(null)
            setStreaming(false)
          },
          onError(err) {
            setAnalysisPreview(null)
            setStreaming(false)
            const raw = err instanceof Error ? err.message : String(err ?? '')
            const userMessage = raw.includes('Incorrect API key')
              ? 'AI 서버 API 키가 유효하지 않습니다. ai/.env 의 OPENAI_API_KEY를 확인하세요.'
              : `연결 오류: ${raw || '알 수 없는 오류'}`
            setMessages((prev) => [...prev, { role: 'system', content: userMessage }])
          },
        },
      )
    } catch (err) {
      setStreaming(false)
      setMessages((prev) => [...prev, { role: 'system', content: '전송 실패' }])
    }
  }

  const processFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1]
        setAttachedImages((prev) => [...prev, base64])
      }
      reader.readAsDataURL(file)
    })
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      processFiles(e.clipboardData.files)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index))
  }

  function handleNewChat() {
    setSessionId(null)
    setMessages([])
  }

  return (
    <div className="chatPanel" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <div className="chatHeader">
        <h2>상담</h2>
        <div style={{ marginLeft: 'auto' }} />
        <button onClick={handleNewChat} className="newChatBtn">새 상담</button>
      </div>

      <div className="chatWindow" ref={chatWindowRef}>
        {messages.length === 0 && (
          <div className="emptyChat">고민을 말해보세요. Grogi가 들어줄게요.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <span className="msgRole">{m.role === 'user' ? '나' : m.role === 'assistant' ? 'Grogi' : '시스템'}</span>
            <span className="msgContent">{m.content}</span>
          </div>
        ))}
        {analysisPreview && streaming && (
          <div className="msg msg-system">
            <span className="msgRole">분석</span>
            <span className="msgContent" style={{ fontFamily: 'monospace' }}>{analysisPreview}</span>
          </div>
        )}
        {streaming && <div className="msg msg-system">응답 중...</div>}
      </div>

      <form onSubmit={handleSend} className="chatForm">
        {attachedImages.length > 0 && (
          <div className="imagePreviewList">
            {attachedImages.map((img, i) => (
              <div key={i} className="previewItem">
                <img src={`data:image/jpeg;base64,${img}`} alt="preview" />
                <button type="button" className="removeImgBtn" onClick={() => removeImage(i)}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="chatInputWrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="메시지를 입력하거나 이미지를 붙여넣으세요..."
            disabled={streaming}
            rows={1}
          />
          <div className="btnGroup">
            <input
              type="file"
              accept="image/*"
              multiple
              ref={fileInputRef}
              onChange={(e) => e.target.files && processFiles(e.target.files)}
              style={{ display: 'none' }}
            />
            <button type="button" className="iconBtn" onClick={() => fileInputRef.current?.click()} disabled={streaming}>
              📷
            </button>
            <button type="submit" className="submitBtn" disabled={streaming || (!input.trim() && attachedImages.length === 0)}>
              전송
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
