import React, { useEffect, useState } from 'react'
import { getSessions } from '../api'

interface SidebarProps {
    onSelectSession: (id: string) => void
    onNewChat: () => void
    isCollapsed: boolean
    onToggle: () => void
    onOpenSettings: () => void
    currentSessionId: string | null
    sessions: any[]
    isNextSessionPrivate: boolean
    isCurrentSessionPrivate: boolean
}

export default function Sidebar({
    onSelectSession,
    onNewChat,
    isCollapsed,
    onToggle,
    onOpenSettings,
    currentSessionId,
    sessions,
    isNextSessionPrivate,
    isCurrentSessionPrivate
}: SidebarProps) {

    const currentSession = sessions.find(s => s.id === currentSessionId);
    // 1. 현재 선택된 세션이 DB 세션이면 그 속성을 따름
    // 2. DB에 없는 대화 중이라면(프라이빗 세션 등) App에서 넘겨준 현재 상태를 따름
    // 3. 아무 세션도 선택되지 않았다면 새 프라이빗 세션 시작 대기 중인지 확인
    const isPrivate = currentSession
        ? currentSession.privateMode
        : (currentSessionId ? isCurrentSessionPrivate : isNextSessionPrivate);

    return (
        <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            <div className="sidebarTop">
                <button className="iconBtn hamburger" onClick={onToggle}>
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
                    </svg>
                </button>
            </div>

            <button className="newChatFab" onClick={onNewChat} title="새 채팅">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                {!isCollapsed && <span>새 채팅</span>}
            </button>

            <div className="historySection">
                {!isCollapsed && <h3 className="sectionTitle">최근 대화</h3>}
                <div className="sessionList">
                    {sessions.map((s) => (
                        <button
                            key={s.id}
                            className={`sessionItem ${currentSessionId === s.id ? 'active' : ''}`}
                            onClick={() => onSelectSession(s.id)}
                            title={s.title || '새 대화'}
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18">
                                <path fill="currentColor" d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h18v8zM5 10h2v2H5v-2zm0 3h2v1H5v-1zm12-3h2v2h-2v-2zm0 3h2v1h-2v-1zM9 10h6v2H9v-2zm0 3h6v1H9v-1z" />
                            </svg>
                            {!isCollapsed && (
                                <span className="sessionTitle">
                                    {s.title ? (s.title.length > 20 ? s.title.substring(0, 20) + '...' : s.title) : '새 대화'}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="sidebarBottom">
                {isPrivate && (
                    <div className="private-badge-wrapper" style={isCollapsed ? { padding: '0', display: 'flex', justifyContent: 'center' } : {}}>
                        <div className="private-badge" style={isCollapsed ? { padding: '6px', borderRadius: '50%' } : {}}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            {!isCollapsed && <span>Private</span>}
                        </div>
                    </div>
                )}
                <button className="sidebarIconBtn" onClick={onOpenSettings} title="설정">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                    </svg>
                    {!isCollapsed && <span>설정</span>}
                </button>
                <button className="sidebarIconBtn" title="도움말">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path fill="currentColor" d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" />
                    </svg>
                    {!isCollapsed && <span>도움말</span>}
                </button>
            </div>
        </aside>
    )
}
