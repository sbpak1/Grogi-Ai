import React, { useState, useEffect } from 'react'
import { updateProfile, withdrawAccount } from '../api'
import { redirectToKakaoLogin } from '../lib/kakao'



interface TopBarProps {
    onLogout: () => void
    profile: {
        nickname?: string
        profileImage?: string
        email?: string
    } | null
    onProfileUpdate?: (updated: { nickname?: string; profileImage?: string; email?: string }) => void
    onHome?: () => void
    onOpenPrivacy?: () => void
    onOpenTerms?: () => void
}

export default function TopBar({ onLogout, profile, onProfileUpdate, onHome, onOpenPrivacy, onOpenTerms }: TopBarProps) {
    const [isPopoverOpen, setIsPopoverOpen] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [editNickname, setEditNickname] = useState('')
    const [editEmail, setEditEmail] = useState('')
    const [editProfileImage, setEditProfileImage] = useState('')

    const isGuest = !localStorage.getItem('token') || !profile

    useEffect(() => {
        if (profile) {
            setEditNickname(profile.nickname || '')
            setEditEmail(profile.email || '')
            setEditProfileImage(profile.profileImage || '')
        }
    }, [profile])

    async function handleSave() {
        try {
            const updated = await updateProfile({
                nickname: editNickname,
                email: editEmail,
                profileImage: editProfileImage
            })
            if (onProfileUpdate) onProfileUpdate(updated)
            setIsEditing(false)
        } catch (err) {
            alert('업데이트 실패')
        }
    }

    function triggerLogin() {
        redirectToKakaoLogin()
    }

    async function handleWithdraw() {
        if (!window.confirm('정말로 탈퇴하시겠습니까? 관련 데이터가 모두 삭제되며 복구할 수 없습니다.')) return
        try {
            await withdrawAccount()
            alert('탈퇴 처리가 완료되었습니다.')
            onLogout()
        } catch (err) {
            alert('탈퇴 처리 중 오류가 발생했습니다.')
        }
    }

    const defaultAvatar = "https://lh3.googleusercontent.com/a/default-user=s64"

    return (
        <header className="topBar">
            <div className="brand" onClick={onHome}>
                <img src="/logo.png" alt="Grogi Logo" />
                <span className="logoText">
                    <span className="logo-main">GROGI</span> <span className="logo-ai">AI</span>
                </span>
            </div>

            <div className="topBarActions">
                <div className="userProfile">
                    {isGuest ? (
                        <button className="avatarBtn" onClick={triggerLogin} title="로그인">
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: '#333',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#999'
                            }}>
                                <svg viewBox="0 0 24 24" width="20" height="20">
                                    <path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                                </svg>
                            </div>
                        </button>
                    ) : (
                        <button className="avatarBtn" onClick={() => setIsPopoverOpen(!isPopoverOpen)} title="프로필">
                            <img
                                src={profile?.profileImage || defaultAvatar}
                                alt="user"
                                style={{ borderRadius: '50%', width: '32px', height: '32px' }}
                            />
                        </button>
                    )}
                </div>
            </div>

            {isPopoverOpen && profile && (
                <div className="profilePopover">
                    <div className="popoverHeader">
                        {isEditing ? (
                            <input
                                className="editInput email"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                placeholder="이메일 입력"
                            />
                        ) : (
                            <span className="popoverEmail">{profile.email || "이메일 정보 없음"}</span>
                        )}
                        <button className="popoverClose" onClick={() => { setIsPopoverOpen(false); setIsEditing(false); }}>×</button>
                    </div>

                    <div className="popoverMain">
                        <div className="largeAvatarWrapper">
                            <img
                                src={isEditing ? editProfileImage || defaultAvatar : profile.profileImage || defaultAvatar}
                                alt="large avatar"
                                className="largeAvatar"
                            />
                        </div>

                        {isEditing ? (
                            <div className="editFields">
                                <input
                                    className="editInput nickname"
                                    value={editNickname}
                                    onChange={(e) => setEditNickname(e.target.value)}
                                    placeholder="닉네임 입력"
                                />
                            </div>
                        ) : (
                            <h2 className="greetingText">안녕하세요, {profile.nickname || "사용자"}님.</h2>
                        )}
                    </div>

                    <div className="popoverFooter">
                        {isEditing ? (
                            <div className="editActions">
                                <button className="footerBtn cancel" onClick={() => setIsEditing(false)}>
                                    <span>취소</span>
                                </button>
                                <button className="footerBtn save" onClick={handleSave}>
                                    <span>저장</span>
                                </button>
                            </div>
                        ) : (
                            <div className="popoverFooterActions">
                                <button className="footerBtn single" onClick={() => {
                                    setIsPopoverOpen(false)
                                    onLogout()
                                }}>
                                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                                    </svg>
                                    <span>로그아웃</span>
                                </button>
                                <button className="withdrawalBtn" onClick={handleWithdraw}>
                                    회원 탈퇴
                                </button>
                            </div>
                        )}
                    </div>

                    {!isEditing && (
                        <div className="popoverBottomLinks">
                            <span onClick={onOpenPrivacy}>개인정보처리방침</span>
                            <span>•</span>
                            <span onClick={onOpenTerms}>서비스 약관</span>
                        </div>
                    )}
                </div>
            )}
        </header>
    )
}
