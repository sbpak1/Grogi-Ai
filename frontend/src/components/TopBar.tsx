import React, { useState, useEffect } from 'react'
import { updateProfile } from '../api'

interface TopBarProps {
    onLogout: () => void
    profile: {
        nickname?: string
        profileImage?: string
        email?: string
    } | null
    onProfileUpdate?: (updated: any) => void
}

export default function TopBar({ onLogout, profile, onProfileUpdate }: TopBarProps) {
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
        const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY
        const REDIRECT_URI = `${window.location.origin}/auth/kakao`

        if (!KAKAO_KEY) {
            alert('VITE_KAKAO_JS_KEY is missing')
            return
        }

        // Direct redirection to Kakao Auth URL (REST API method)
        const KAKAO_AUTH_URL = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=talk_message`

        window.location.href = KAKAO_AUTH_URL
    }

    const defaultAvatar = "https://lh3.googleusercontent.com/a/default-user=s64"

    return (
        <header className="topBar">
            <div className="brand">
                <span className="logoText">Grogi</span>
            </div>

            <div className="topBarActions">
                <div className="userProfile">
                    {isGuest ? (
                        <button className="avatarBtn" onClick={triggerLogin} title="로그인">
                            <img
                                src={defaultAvatar}
                                alt="guest"
                                style={{ borderRadius: '50%', width: '32px', height: '32px', filter: 'grayscale(100%)' }}
                            />
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
                            <button className="cameraIconBtn" onClick={() => {
                                if (!isEditing) setIsEditing(true);
                                else {
                                    const url = prompt('이미지 URL을 입력하세요', editProfileImage);
                                    if (url !== null) setEditProfileImage(url);
                                }
                            }}>
                                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 12m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5s5 2.24 5 5s-2.24 5-5 5z" />
                                </svg>
                            </button>
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
                            <button className="footerBtn single" onClick={() => {
                                setIsPopoverOpen(false)
                                onLogout()
                            }}>
                                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                                </svg>
                                <span>로그아웃</span>
                            </button>
                        )}
                    </div>

                    {!isEditing && (
                        <div className="popoverBottomLinks">
                            <span>개인정보처리방침</span>
                            <span>•</span>
                            <span>서비스 약관</span>
                        </div>
                    )}
                </div>
            )}
        </header>
    )
}
