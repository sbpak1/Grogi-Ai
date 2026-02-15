import React, { useEffect, useState } from 'react'
import { chatStream, getChatHistory } from '../api'

export default function Chat({ sessionId }: { sessionId: string }){
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<string[]>([])
  const [streaming, setStreaming] = useState(false)

  useEffect(()=>{
    (async ()=>{
      try{
        const data = await getChatHistory(sessionId)
        if(Array.isArray(data?.messages)) setMessages(data.messages.map((m:any)=>m.text || JSON.stringify(m)))
      }catch(e){/* ignore */}
    })()
  },[sessionId])

  function append(msg:string){ setMessages(m => [...m, msg]) }

  function handleSend(e: React.FormEvent){
    e.preventDefault()
    if(!input) return
    setStreaming(true)
    append(`You: ${input}`)
    chatStream({ sessionId, message: input }, {
      onMessage(chunk){ append(chunk) },
      onDone(){ setStreaming(false) },
      onError(err){ setStreaming(false); append('Stream error') }
    })
    setInput('')
  }

  return (
    <div>
      <h2>Chat — {sessionId}</h2>
      <div className="chatWindow">
        {messages.map((m,i)=>(<div key={i} className="msg">{m}</div>))}
        {streaming && <div className="msg">...streaming...</div>}
      </div>
      <form onSubmit={handleSend}>
        <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask something" />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
