import React, { useRef, useState, useEffect } from 'react'
import { chatStream, createSession, getChatHistory } from '../api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

type MessageItem = { role: 'user' | 'assistant' | 'system'; content: string }

interface ChatProps {
  sessionId: string | null
  onSessionStarted: (id: string) => void
}

export default function Chat({ sessionId, onSessionStarted }: ChatProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [streaming, setStreaming] = useState(false)
  const [analysisPreview, setAnalysisPreview] = useState<string | null>(null)
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [attachedPdfs, setAttachedPdfs] = useState<Array<{ name: string; base64: string }>>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatWindowRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 세션 ID 변경 시 히스토리 로드
  useEffect(() => {
    if (sessionId) {
      loadHistory(sessionId)
    } else {
      setMessages([])
    }
  }, [sessionId])

  async function loadHistory(id: string) {
    try {
      const history = await getChatHistory(id)
      setMessages(history.map((m: any) => ({
        role: m.role,
        content: m.content
      })))
      scrollToBottom()
    } catch (err) {
      console.error('Failed to load history', err)
    }
  }

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
    if (!text && attachedImages.length === 0 && attachedPdfs.length === 0) return
    if (streaming) return

    const token = localStorage.getItem('token')
    if (!token) {
      // Trigger same login redirect as TopBar
      const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY
      const REDIRECT_URI = `${window.location.origin}/auth/kakao`
      if (!KAKAO_KEY) {
        alert('로그인이 필요합니다. (API키 누락)')
        return
      }
      window.location.href = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=talk_message`
      return
    }

    setStreaming(true)
    setAnalysisPreview(null)

    // 유저 메시지 추가
    const parts: string[] = []
    if (attachedImages.length > 0) parts.push(`[이미지 ${attachedImages.length}장]`)
    if (attachedPdfs.length > 0) parts.push(`[문서: ${attachedPdfs.map(p => p.name).join(', ')}]`)
    const userContent = parts.length > 0
      ? `${parts.join(' ')} ${text || '(파일 분석 요청)'}`
      : text

    setMessages((prev) => [...prev, { role: 'user', content: userContent }])

    const currentImages = [...attachedImages]
    const currentPdfs = [...attachedPdfs]
    setInput('')
    setAttachedImages([])
    setAttachedPdfs([])
    scrollToBottom()

    try {
      let currentSessionId = sessionId
      if (!currentSessionId) {
        const data = await createSession()
        currentSessionId = data.session_id
        onSessionStarted(currentSessionId!)
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
      scrollToBottom()

      chatStream(
        {
          session_id: currentSessionId!,
          message: text || (currentImages.length > 0 || currentPdfs.length > 0 ? '파일 분석해줘' : ''),
          images: currentImages.length > 0 ? currentImages : undefined,
          pdfs: currentPdfs.length > 0 ? currentPdfs.map(p => ({ filename: p.name, content: p.base64 })) : undefined,
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
          onCrisis(data) {
            const hotlines = data.hotlines?.map((h: any) =>
              typeof h === 'string' ? h : `${h.name}: ${h.number} (${h.desc})`
            ).join('\n') || ''
            const followUp = data.follow_up ? `\n\n${data.follow_up}` : ''
            const crisisMsg = `${data.message}\n\n${hotlines}${followUp}`
            setMessages((prev) => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = { ...last, content: crisisMsg }
              }
              return copy
            })
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
              ? 'API 키 오류'
              : `연결 오류: ${raw}`
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
      const reader = new FileReader()
      if (file.type.startsWith('image/')) {
        reader.onload = (e) => {
          const base64 = (e.target?.result as string).split(',')[1]
          setAttachedImages((prev) => [...prev, base64])
        }
        reader.readAsDataURL(file)
      } else if (file.type === 'application/pdf') {
        reader.onload = (e) => {
          const base64 = (e.target?.result as string).split(',')[1]
          setAttachedPdfs((prev) => [...prev, { name: file.name, base64 }])
        }
        reader.readAsDataURL(file)
      }
    })
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      processFiles(e.clipboardData.files)
    }
  }

  return (
    <>
      <div className="chatWindowScroll" ref={chatWindowRef}>

        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <div className="msgIcon">
              {/* Emoji removed */}
            </div>
            <div className="msgContent">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
                }}
              >
                {m.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {analysisPreview && streaming && (
          <div className="msg msg-system">
            <div className="msgContent" style={{ fontFamily: 'monospace', fontSize: '12px' }}>{analysisPreview}</div>
          </div>
        )}
        {streaming && <div className="msg msg-system">응답 중...</div>}
      </div>

      <div className="inputArea">
        <form onSubmit={handleSend} className="chatInputBox" onPaste={handlePaste} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.dataTransfer.files && processFiles(e.dataTransfer.files) }}>
          {(attachedImages.length > 0 || attachedPdfs.length > 0) && (
            <div className="previewBar">
              {attachedImages.map((img, i) => (
                <div key={i} className="previewThumb">
                  <img src={`data:image/jpeg;base64,${img}`} alt="preview" />
                  <button type="button" className="removeBtn" onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
              {attachedPdfs.map((pdf, i) => (
                <div key={i} className="previewThumb pdfThumb">
                  <div style={{ background: '#444', height: '100%', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>PDF</div>
                  <button type="button" className="removeBtn" onClick={() => setAttachedPdfs(prev => prev.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
            </div>
          )}

          <div className="inputRow">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="여기에 도움말 입력"
              rows={1}
            />
          </div>

          <div className="inputActions">
            <div className="leftActions">
              <button type="button" className="roundBtn" onClick={() => fileInputRef.current?.click()} title="이미지 업로드">
                <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4.86 8.86l-3 3.87L9 13.14 6 17h12l-3.86-5.14z" /></svg>
              </button>
              <input type="file" multiple ref={fileInputRef} hidden onChange={(e) => e.target.files && processFiles(e.target.files)} />
            </div>

            <div className="rightActions">
              <button type="submit" className="roundBtn" disabled={streaming || (!input.trim() && attachedImages.length === 0)} title="전송">
                <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}
