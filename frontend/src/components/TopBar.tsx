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
        const w = window as any
        if (w.Kakao && !w.Kakao.isInitialized()) w.Kakao.init(KAKAO_KEY)

        if (w.Kakao) {
            w.Kakao.Auth.authorize({
                redirectUri: `${window.location.origin}/auth/kakao`,
            })
        } else {
            const redirect = `${window.location.origin}/auth/kakao`
            window.location.href = `https://kauth.kakao.com/oauth/authorize?client_id=${import.meta.env.VITE_KAKAO_CLIENT_ID}&redirect_uri=${redirect}&response_type=code`
        }
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
                        <button className="loginBtn" onClick={triggerLogin} title="로그인">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-15c-1.93 0-3.5 1.57-3.5 3.5S10.07 12 12 12s3.5-1.57 3.5-3.5S13.93 5 12 5zm0 5c-.83 0-1.5-.67-1.5-1.5S11.17 7 12 7s1.5.67 1.5 1.5S12.83 10 12 10zm0 3c-2.33 0-7 1.17-7 3.5V18h14v-1.5c0-2.33-4.67-3.5-7-3.5z" />
                            </svg>
                            <span style={{ marginLeft: '8px' }}>로그인</span>
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
