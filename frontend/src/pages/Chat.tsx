import React, { useRef, useState, useEffect, useCallback } from 'react'
import { chatStream, createSession, getChatHistory } from '../api'
import { redirectToKakaoLogin } from '../lib/kakao'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import nomalImg from "../assets/nomal.png"
import angryImg from "../assets/angry.png"
import angelImg from "../assets/angel.png"
import fireImg from "../assets/fire.png"

type MessageItem = { role: 'user' | 'assistant' | 'system'; content: string }

interface FireParticle {
  id: number
  left: number
  delay: number
  duration: number
  size: number
}

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
  const [loadingHistory, setLoadingHistory] = useState(!!sessionId)
  const [fireParticles, setFireParticles] = useState<FireParticle[]>([])
  const justStartedRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatWindowRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isSendingRef = useRef(false) // 중복 전송 방지용 Ref

  // 이미지 프리로드 (메모리 캐싱)
  useEffect(() => {
    [nomalImg, angryImg, angelImg].forEach(src => {
      const img = new Image()
      img.src = src
    })
  }, [])

  // 컴포넌트 언마운트 시 SSE 연결 정리
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      isSendingRef.current = false
    }
  }, [])

  const [thinkingImgIdx, setThinkingImgIdx] = useState(0)
  const [currentIdleImg, setCurrentIdleImg] = useState(nomalImg)
  const thinkingImgs = [nomalImg, angryImg, angelImg]
  let nextFireParticleId = useRef(0)

  const handleCharacterClick = () => {
    const newParticles: FireParticle[] = []
    const particleCount = 8 + Math.floor(Math.random() * 5) // 8-12 particles per click

    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: nextFireParticleId.current++,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 3 + Math.random() * 2,
        size: 30 + Math.random() * 70
      })
    }

    setFireParticles(prev => [...prev, ...newParticles])

    // Cleanup particles after they finish animating (max duration 5.5s)
    setTimeout(() => {
      setFireParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)))
    }, 6000)
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (streaming) {
      interval = setInterval(() => {
        setThinkingImgIdx((prev) => (prev + 1) % thinkingImgs.length)
      }, 300)
    } else {
      setThinkingImgIdx(0)
      isSendingRef.current = false // 스트리밍이 끝나면 락 해제 (안전장치)
    }
    return () => clearInterval(interval)
  }, [streaming])

  // Idle state random expression animation
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (messages.length === 0 && !streaming && !loadingHistory) {
      interval = setInterval(() => {
        const allImgs = [nomalImg, angryImg, angelImg];
        setCurrentIdleImg(prev => {
          const others = allImgs.filter(img => img !== prev)
          return others[Math.floor(Math.random() * others.length)]
        })
      }, 3000)
    } else {
      setCurrentIdleImg(nomalImg)
    }
    return () => clearInterval(interval)
  }, [messages.length, streaming])

  // 세션 ID 변경 시 히스토리 로드
  useEffect(() => {
    if (sessionId) {
      // 방금 내가 만든 세션이면 스트림 유지 (abort 하면 안 됨!)
      if (justStartedRef.current) {
        justStartedRef.current = false
        return
      }
      // 다른 세션으로 전환 시에만 진행 중인 스트림 정리
      abortRef.current?.abort()
      isSendingRef.current = false
      setStreaming(false)
      loadHistory(sessionId)
    } else {
      abortRef.current?.abort()
      isSendingRef.current = false
      setStreaming(false)
      setMessages([])
    }
  }, [sessionId])

  async function loadHistory(id: string) {
    setLoadingHistory(true)
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
    } finally {
      setLoadingHistory(false)
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

    // 동기적 중복 방지 체크
    if (isSendingRef.current) return
    if (streaming) return

    const text = input.trim()
    if (!text && attachedImages.length === 0 && attachedPdfs.length === 0) return

    // 게스트 메시지 카운트 체크
    const token = localStorage.getItem('token')
    if (!token) {
      const currentCount = parseInt(localStorage.getItem('guest_msg_count') || '0', 10)
      if (currentCount >= 5) {
        if (confirm('무료 사용량을 초과했습니다. 로그인 하시겠습니까?')) {
          redirectToKakaoLogin()
        }
        return
      }
      localStorage.setItem('guest_msg_count', (currentCount + 1).toString())
    }

    isSendingRef.current = true // 즉시 잠금
    setStreaming(true)
    setAnalysisPreview(null)

    // 알림 권한 요청 (최초 1회, 사용자가 허용/거부하면 다시 묻지 않음)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

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
        const token = localStorage.getItem('token')
        if (token) {
          const data = await createSession(isPrivateRequested)
          currentSessionId = data.session_id
        } else {
          // 비로그인 상태: 세션 생성 API 생략하고 로컬 UUID 사용
          currentSessionId = self.crypto.randomUUID()
        }
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
          messageId: self.crypto.randomUUID(),
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
            // 다른 탭에 있을 때 브라우저 알림 + 인앱 토스트
            if (document.visibilityState === 'hidden') {
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('🔥 그로기 답변 완료', {
                  body: '답변이 준비됐어. 확인해봐.',
                  icon: nomalImg,
                })
              }
              // 돌아왔을 때 토스트 표시
              const showToast = () => {
                setToast('그로기가 답변을 완료했어요!')
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
                toastTimerRef.current = setTimeout(() => setToast(null), 4000)
                document.removeEventListener('visibilitychange', showToast)
              }
              document.addEventListener('visibilitychange', showToast)
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
      isSendingRef.current = false
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
          placeholder="Grogi와 대화하기"
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
      {/* 인앱 토스트 알림 */}
      {toast && (
        <div className="toast-notification" onClick={() => setToast(null)}>
          <span className="toast-icon">🔥</span>
          <span>{toast}</span>
        </div>
      )}
      <div className="chatWindowScroll" ref={chatWindowRef}>

        {messages.length === 0 && !streaming && !loadingHistory && (
          <div className="emptyState">
            <div className="speechBubble">
              <span>고민이 있으면 얘기해</span>
              <span>해결책 줄게</span>
            </div>
            <img
              className="characterImg"
              src={currentIdleImg}
              alt="Grogi"
              onClick={handleCharacterClick}
              onMouseEnter={() => {
                const rand = Math.random() < 0.5 ? angryImg : angelImg;
                setCurrentIdleImg(rand);
              }}
              onMouseLeave={() => {
                setCurrentIdleImg(nomalImg);
              }}
            />
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

      <div className="inputArea">
        {renderInputForm()}
      </div>

      {/* Global Fire Particles */}
      {fireParticles.map((particle) => (
        <img
          key={particle.id}
          src={fireImg}
          alt="fire"
          className="fireParticle"
          style={{
            left: `${particle.left}%`,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.duration}s`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
          }}
        />
      ))}
    </>
  )
}
