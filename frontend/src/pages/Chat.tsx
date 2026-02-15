import React, { useEffect, useRef, useState } from 'react'
import Tesseract from 'tesseract.js'
import { chatStream, getChatHistory } from '../api'

type ImagePayload = { base64: string; ocr: string }

export default function Chat({ sessionId }: { sessionId: string }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<string[]>([])
  const [streaming, setStreaming] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMessages([])
    ;(async () => {
      try {
        const data = await getChatHistory(sessionId)
        if (Array.isArray(data?.messages)) {
          setMessages(data.messages.map((m: any) => `${m.role || 'msg'}: ${m.content || m.text || ''}`))
        }
      } catch {
        // ignore history load error in simple mode
      }
    })()
  }, [sessionId])

  function append(msg: string) {
    setMessages((prev) => [...prev, msg])
  }

  async function handleSend(e: React.FormEvent | null, imageData?: ImagePayload) {
    if (e) e.preventDefault()
    if (!input && !imageData) return

    setStreaming(true)
    const userLabel = imageData ? `[Image] ${input || '(image only)'}` : input
    append(`You: ${userLabel}`)
    append('Grogi: ')

    chatStream(
      {
        sessionId,
        message: input || (imageData ? '이미지 분석해줘' : ''),
        images: imageData ? [imageData.base64] : undefined,
        ocr_text: imageData ? imageData.ocr : undefined,
      },
      {
        onMessage(chunk) {
          setMessages((prev) => {
            if (prev.length === 0) return [`Grogi: ${chunk}`]
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last.startsWith('Grogi: ')) {
              copy[copy.length - 1] = last + chunk
              return copy
            }
            copy.push(`Grogi: ${chunk}`)
            return copy
          })
        },
        onDone() {
          setStreaming(false)
        },
        onError() {
          setStreaming(false)
          append('System: stream error')
        },
      },
    )

    setInput('')
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
        const {
          data: { text },
        } = await Tesseract.recognize(file, 'kor+eng')
        await handleSend(null, { base64, ocr: text || '' })
        setOcrLoading(false)
      }
      reader.readAsDataURL(file)
    } catch {
      setOcrLoading(false)
      append('System: OCR processing failed')
    }
  }

  return (
    <div className="chatPanel">
      <h2>Chat #{sessionId}</h2>
      <div className="chatWindow">
        {messages.map((m, i) => (
          <div key={i} className="msg">
            {m}
          </div>
        ))}
        {streaming && <div className="msg">...streaming...</div>}
        {ocrLoading && <div className="msg">...OCR analyzing...</div>}
      </div>
      <form onSubmit={(e) => handleSend(e)} className="chatForm">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요"
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
          Image
        </button>
        <button type="submit" disabled={streaming || ocrLoading}>
          Send
        </button>
      </form>
    </div>
  )
}
