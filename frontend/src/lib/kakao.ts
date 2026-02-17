const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY
const REDIRECT_URI = `${window.location.origin}/auth/kakao`

export function getKakaoAuthUrl(): string {
  return `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=profile_nickname,profile_image,talk_message`
}

export function redirectToKakaoLogin(): boolean {
  if (!KAKAO_KEY) {
    alert('로그인 설정(API Key)이 누락되었습니다.')
    return false
  }
  window.location.href = getKakaoAuthUrl()
  return true
}
