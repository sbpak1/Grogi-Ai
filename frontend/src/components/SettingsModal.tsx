import React from 'react'
import { updateSettings } from '../api'

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
    onStartPrivateChat?: () => void
    settings: {
        fontSize: 'small' | 'medium' | 'large'
        tGauge: 'mild' | 'spicy' | 'hell'
        expertise: string
        responseStyle: 'short' | 'long'
        privateMode: boolean
    }
    onUpdate: (newSettings: Partial<SettingsModalProps['settings']>) => void
}

export default function SettingsModal({ isOpen, onClose, onStartPrivateChat, settings, onUpdate }: SettingsModalProps) {
    if (!isOpen) return null

    async function handleSettingChange(key: string, value: string | boolean) {
        try {
            const updated = await updateSettings({ [key]: value })
            onUpdate(updated)
        } catch (err) {
            alert('설정 저장 실패')
        }
    }

    return (
        <div className="modalOverlay" onClick={onClose} style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
        }}>
            <div className="modalContent" onClick={(e) => e.stopPropagation()} style={{
                backgroundColor: '#1e1e1e',
                border: '1px solid #333',
                borderRadius: '16px',
                padding: '24px',
                width: '400px',
                maxWidth: '90%',
                color: '#eee',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}>
                <div className="modalHeader" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>설정</h2>
                    <button onClick={onClose} style={{
                        background: 'none',
                        border: 'none',
                        color: '#888',
                        fontSize: '1.5rem',
                        cursor: 'pointer'
                    }}>×</button>
                </div>

                <div className="settingItem" style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '12px', color: '#888', fontSize: '0.875rem' }}>글꼴 크기</label>
                    <div className="toggleGroup" style={{ display: 'flex', gap: '8px' }}>
                        {['small', 'medium', 'large'].map((size) => (
                            <button
                                key={size}
                                onClick={() => handleSettingChange('fontSize', size)}
                                style={{
                                    flex: 1,
                                    padding: '8px',
                                    borderRadius: '8px',
                                    border: '1px solid #333',
                                    backgroundColor: settings.fontSize === size ? '#333' : 'transparent',
                                    color: settings.fontSize === size ? '#fff' : '#888',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {size === 'small' ? '작게' : size === 'medium' ? '중간' : '크게'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="settingItem" style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '12px', color: '#888', fontSize: '0.875rem' }}>AI 매운맛 (T-Gauge)</label>
                    <div className="toggleGroup" style={{ display: 'flex', gap: '8px' }}>
                        {['mild', 'spicy', 'hell'].map((level) => (
                            <button
                                key={level}
                                onClick={() => handleSettingChange('tGauge', level)}
                                style={{
                                    flex: 1,
                                    padding: '8px',
                                    borderRadius: '8px',
                                    border: '1px solid #333',
                                    backgroundColor: settings.tGauge === level ? '#333' : 'transparent',
                                    color: settings.tGauge === level ? '#fff' : '#888',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem'
                                }}
                            >
                                {level === 'mild' ? '순한맛' : level === 'spicy' ? '매운맛' : '지옥맛'}
                            </button>
                        ))}
                    </div>
                    <div className="settingItem" style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.875rem' }}>보안 (Security)</label>
                        <button
                            onClick={() => {
                                onStartPrivateChat?.();
                                onClose();
                            }}
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '12px',
                                backgroundColor: 'rgba(255, 77, 77, 0.15)',
                                color: '#ff5c5c',
                                border: '1px solid rgba(255, 77, 77, 0.2)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                fontSize: '0.9rem',
                                fontWeight: '600'
                            }}
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            기록되지 않는 비밀 채팅 시작
                        </button>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#007AFF',
                            color: '#fff',
                            fontWeight: 'bold',
                            marginTop: '8px',
                            cursor: 'pointer'
                        }}
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    )
}
