import React, { useRef, useState, useEffect, useCallback } from 'react'
import { chatStream, createSession, getChatHistory } from '../api'
import { redirectToKakaoLogin } from '../lib/kakao'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
const nomalImg = "/nomal.png"
const angryImg = "/angry.png"
const angelImg = "/angel.png"

type MessageItem = { role: 'user' | 'assistant' | 'system'; content: string }

interface ChatProps {
  sessionId: string | null
  onSessionStarted: (id: string) => void
  isPrivateRequested?: boolean
}

export default function Chat({ sessionId, onSessionStarted, isPrivateRequested = false }: ChatProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [streaming, setStreaming] = useState(false)
  const [analysisPreview, setAnalysisPreview] = useState<string | null>(null)
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [attachedPdfs, setAttachedPdfs] = useState<Array<{ name: string; base64: string }>>([])
  const justStartedRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatWindowRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 컴포넌트 언마운트 시 SSE 연결 정리
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const [thinkingImgIdx, setThinkingImgIdx] = useState(0)
  const [currentIdleImg, setCurrentIdleImg] = useState(nomalImg)
  const thinkingImgs = [nomalImg, angryImg, angelImg]

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (streaming) {
      interval = setInterval(() => {
        setThinkingImgIdx((prev) => (prev + 1) % thinkingImgs.length)
      }, 300)
    } else {
      setThinkingImgIdx(0)
    }
    return () => clearInterval(interval)
  }, [streaming])

  // Idle state random expression animation
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (messages.length === 0 && !streaming) {
      interval = setInterval(() => {
        const otherImgs = [nomalImg, angryImg, angelImg];
        const randomImg = otherImgs[Math.floor(Math.random() * otherImgs.length)];
        setCurrentIdleImg(randomImg);
      }, 3000)
    } else {
      setCurrentIdleImg(nomalImg)
    }
    return () => clearInterval(interval)
  }, [messages.length, streaming])

  // 세션 ID 변경 시 히스토리 로드
  useEffect(() => {
    if (sessionId) {
      // 새로 시작된 세션인 경우 히스토리 로드를 건너뜀 (이미 optimistic하게 메시지가 채워짐)
      if (justStartedRef.current) {
        justStartedRef.current = false
        return
      }
      loadHistory(sessionId)
    } else {
      setMessages([])
    }
  }, [sessionId])

  async function loadHistory(id: string) {
    try {
      const history = await getChatHistory(id)
      const messageList = Array.isArray(history) ? history : (history.messages || [])
      setMessages(messageList.map((m: { role: 'user' | 'assistant' | 'system'; content: string }) => ({
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
      redirectToKakaoLogin()
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
        const data = await createSession(isPrivateRequested)
        currentSessionId = data.session_id
        justStartedRef.current = true // 플래그 설정
        onSessionStarted(currentSessionId!)
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
      scrollToBottom()

      // 이전 스트림이 있으면 중단
      abortRef.current?.abort()

      abortRef.current = chatStream(
        {
          session_id: currentSessionId!,
          message: text || (currentImages.length > 0 || currentPdfs.length > 0 ? '파일 분석해줘' : ''),
          images: currentImages.length > 0 ? currentImages : undefined,
          pdfs: currentPdfs.length > 0 ? currentPdfs.map(p => ({ filename: p.name, content: p.base64 })) : undefined,
          privateMode: isPrivateRequested, // SSE 요청에도 프라이빗 여부 전달 (새 세션 생성 대비)
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
            const hotlines = data.hotlines?.map((h: string | { name: string; number: string; desc: string }) =>
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
            // 첫 메시지거나 세션이 시작된 경우 사이드바 갱신 유도 (currentSessionId 사용으로 클로저 문제 해결)
            if (currentSessionId) {
              onSessionStarted(currentSessionId)
            }
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

  const processFiles = async (files: FileList) => {
    const fileArray = Array.from(files)

    // Helper: File to Base64
    const fileToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve((e.target?.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })
    }

    // Process Images
    const imageFiles = fileArray.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length > 0) {
      const base64s = await Promise.all(imageFiles.map(fileToBase64))
      const uniqueInBatch = Array.from(new Set(base64s))
      const duplicates = uniqueInBatch.filter(b => attachedImages.includes(b))
      const trulyNew = uniqueInBatch.filter(b => !attachedImages.includes(b))

      if (duplicates.length > 0 || uniqueInBatch.length < base64s.length) {
        alert('이미 추가된 이미지가 포함되어 있습니다.')
      }
      if (trulyNew.length > 0) {
        setAttachedImages(prev => [...prev, ...trulyNew.filter(b => !prev.includes(b))])
      }
    }

    // Process PDFs
    const pdfFiles = fileArray.filter(f => f.type === 'application/pdf')
    if (pdfFiles.length > 0) {
      const pdfResults = await Promise.all(pdfFiles.map(async (f) => ({
        name: f.name,
        base64: await fileToBase64(f)
      })))

      const existingB64s = attachedPdfs.map(p => p.base64)
      const uniqueInBatch = pdfResults.filter((v, i, a) => a.findIndex(t => t.base64 === v.base64) === i)
      const duplicates = uniqueInBatch.filter(p => existingB64s.includes(p.base64))
      const trulyNew = uniqueInBatch.filter(p => !existingB64s.includes(p.base64))

      if (duplicates.length > 0 || uniqueInBatch.length < pdfResults.length) {
        alert('이미 추가된 PDF 파일이 포함되어 있습니다.')
      }
      if (trulyNew.length > 0) {
        setAttachedPdfs(prev => {
          const prevB64s = prev.map(p => p.base64)
          return [...prev, ...trulyNew.filter(p => !prevB64s.includes(p.base64))]
        })
      }
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      processFiles(e.clipboardData.files)
    }
  }

  const renderInputForm = () => (
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
              if (e.nativeEvent.isComposing) return
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
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
          </button>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            hidden
            onChange={(e) => {
              if (e.target.files) {
                processFiles(e.target.files)
                e.target.value = ''
              }
            }}
          />
        </div>

        <div className="rightActions">
          <button type="submit" className="roundBtn" disabled={streaming || (!input.trim() && attachedImages.length === 0)} title="전송">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          </button>
        </div>
      </div>
      <p className="emptyStateDisclaimer">
        그로기는 공감 대신 이성적인 판단으로 해결책을 제시해주는 AI입니다. 너무 상처 받지 않으시길 바랍니다.
      </p>
    </form>
  )

  return (
    <>
      <div className="chatWindowScroll" ref={chatWindowRef}>

        {messages.length === 0 && !streaming && (
          <div className="emptyState">
            <div className="speechBubble">
              <span>고민이 있으면 얘기해</span>
              <span>해결책 줄게</span>
            </div>
            <img
              className="characterImg"
              src={currentIdleImg}
              alt="Grogi"
              onMouseEnter={() => {
                const rand = Math.random() < 0.5 ? angryImg : angelImg;
                setCurrentIdleImg(rand);
              }}
              onMouseLeave={() => {
                setCurrentIdleImg(nomalImg);
              }}
            />
            <div className="inputArea emptyStateInput">
              {renderInputForm()}
            </div>
          </div>
        )}

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
        {streaming && (
          <div className="msg msg-assistant">
            <div className="msgIcon"></div>
            <div className="msgContent">
              <img src={thinkingImgs[thinkingImgIdx]} alt="thinking" className="thinkingIcon" />
            </div>
          </div>
        )}
      </div>

      {(messages.length > 0 || streaming) && (
        <div className="inputArea">
          {renderInputForm()}
        </div>
      )}
    </>
  )
}
