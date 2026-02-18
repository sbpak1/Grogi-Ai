import React, { useEffect, useState } from 'react'
import { getSessions, deleteSession } from '../api'

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
    onSessionDeleted: (id: string) => void
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
    isCurrentSessionPrivate,
    onSessionDeleted
}: SidebarProps) {
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const currentSession = sessions.find(s => s.id === currentSessionId);
    const isPrivate = currentSession
        ? currentSession.privateMode
        : (currentSessionId ? isCurrentSessionPrivate : isNextSessionPrivate);

    const handleDeleteClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeletingId(id);
    };

    const confirmDelete = async () => {
        if (!deletingId) return;
        try {
            await deleteSession(deletingId);
            onSessionDeleted(deletingId);
            setDeletingId(null);
        } catch (err) {
            console.error('Failed to delete session', err);
            alert('세션 삭제에 실패했습니다.');
        }
    };

    return (
        <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            {deletingId && (
                <div className="delete-modal-overlay">
                    <div className="delete-modal">
                        <p className="delete-modal-text">
                            '<strong>{sessions.find(s => s.id === deletingId)?.title || '새 대화'}</strong>'을
                            삭제하시겠습니까? 삭제한 대화내용을 복구시킬 수 없습니다.
                        </p>
                        <div className="delete-modal-actions">
                            <button className="confirm-btn" onClick={confirmDelete}>YES</button>
                            <button className="cancel-btn" onClick={() => setDeletingId(null)}>NO</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="sidebarTop">
                <button className="iconBtn hamburger" onClick={onToggle}>
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
                    </svg>
                </button>
            </div>

            <button className="newChatFab" onClick={onNewChat} title="새 채팅">
                <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
                {!isCollapsed && <span>새 채팅</span>}
            </button>

            {!isCollapsed && (
                <div className="historySection">
                    <h3 className="sectionTitle">최근 대화</h3>
                    <div className="sessionList">
                        {sessions.map((s) => (
                            <div key={s.id} className={`sessionItemWrapper ${currentSessionId === s.id ? 'active' : ''}`}>
                                <button
                                    className="sessionItem"
                                    onClick={() => onSelectSession(s.id)}
                                    title={s.title || '새 대화'}
                                >
                                    <svg viewBox="0 0 24 24" width="18" height="18">
                                        <path fill="currentColor" d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h18v8zM5 10h2v2H5v-2zm0 3h2v1H5v-1zm12-3h2v2h-2v-2zm0 3h2v1h-2v-1zM9 10h6v2H9v-2zm0 3h6v1H9v-1z" />
                                    </svg>
                                    <span className="sessionTitle">
                                        {s.title ? (s.title.length > 20 ? s.title.substring(0, 20) + '...' : s.title) : '새 대화'}
                                    </span>
                                </button>
                                <button
                                    className="sessionDeleteBtn"
                                    onClick={(e) => handleDeleteClick(e, s.id)}
                                    title="삭제"
                                >
                                    <svg viewBox="0 0 24 24" width="14" height="14">
                                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="sidebarBottom">
                {!isCollapsed && isPrivate && (
                    <div className="private-badge-wrapper">
                        <div className="private-badge">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <span>Private</span>
                        </div>
                    </div>
                )}
                <button className="sidebarIconBtn" onClick={onOpenSettings} title="설정">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                    </svg>
                    {!isCollapsed && <span>설정</span>}
                </button>
            </div>
        </aside>
    )
}
