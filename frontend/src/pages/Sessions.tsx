import React, { useEffect, useState } from 'react'
import { getSessions } from '../api'

export default function Sessions({ onOpen }: { onOpen?: (id: string) => void }) {
  const [sessions, setSessions] = useState<any[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const data = await getSessions()
        if (Array.isArray(data)) setSessions(data)
      } catch {
        // ignore
      }
    })()
  }, [])

  return (
    <div>
      <h2>상담 기록</h2>
      {sessions.length === 0 && <p>상담 기록이 없습니다.</p>}
      {sessions.map((s) => (
        <div key={s.id} className="sessionItem">
          <span>{new Date(s.createdAt).toLocaleDateString()}</span>
          <button onClick={() => onOpen?.(s.id)}>열기</button>
        </div>
      ))}
    </div>
  )
}
