import React from 'react'

interface LegalModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    content: React.ReactNode
}

export function LegalModal({ isOpen, onClose, title, content }: LegalModalProps) {
    if (!isOpen) return null

    return (
        <div className="modalOverlay" onClick={onClose}>
            <div className="modalContent legalModal" onClick={(e) => e.stopPropagation()}>
                <div className="modalHeader">
                    <h3>{title}</h3>
                    <button className="closeBtn" onClick={onClose}>×</button>
                </div>
                <div className="modalBody legalBody">
                    {content}
                </div>
            </div>
        </div>
    )
}

export const PrivacyContent = () => (
    <>
        <p>그로기 AI(이하 '회사')는 사용자의 개인정보를 소중히 다루며, 관련 법령을 준수합니다.</p>

        <h4>1. 수집하는 개인정보 항목</h4>
        <p>카카오 로그인을 통해 다음의 정보를 제공받습니다:</p>
        <ul>
            <li>필수 항목: 이메일, 닉네임, 프로필 사진</li>
        </ul>

        <h4>2. 수집 및 이용 목적</h4>
        <ul>
            <li>서비스 이용자 식별 및 회원 관리</li>
            <li>개인화된 프로필 설정</li>
            <li>AI 답변 품질 향상 및 서비스 최적화 (익명화된 데이터 활용)</li>
        </ul>

        <h4>3. 보유 및 이용 기간</h4>
        <p>회원은 언제든지 탈퇴할 수 있으며, 탈퇴 시 또는 서비스 종료 시 수집된 정보는 지체 없이 파기됩니다.</p>

        <h4>4. 대화 데이터의 처리</h4>
        <p>사용자와 그로기 AI 간의 대화 내역은 서비스 기능 제공을 위해 저장됩니다. 해당 데이터는 개인을 식별할 수 없는 형태로 통계적 분석이나 AI 학습 보조 데이터로 활용될 수 있으며, 외부 제3자에게 유출되지 않도록 엄격히 관리됩니다.</p>
    </>
)

export const TermsContent = () => (
    <>
        <p>본 약관은 그로기 AI 서비스(이하 '서비스') 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정합니다.</p>

        <h4>1. 서비스의 목적 및 성격</h4>
        <p>'그로기 AI'는 사용자에게 이성적이고 냉철한 피드백(일명 '팩트 폭격')을 제공하여 객관적인 시각을 돕는 엔터테인먼트형 상담 보조 서비스입니다.</p>

        <h4>2. 서비스 이용 주의사항 (면책 조항)</h4>
        <ul>
            <li>본 AI는 사용자의 감정 케어(공감)보다 논리적 분석을 우선시하며, 답변의 어조가 공격적이거나 냉소적일 수 있습니다.</li>
            <li>사용자는 서비스 가입 및 이용 시 이러한 서비스의 특성을 충분히 이해하고 동의한 것으로 간주합니다.</li>
            <li>AI의 답변은 절대적인 해결책이 아니며, 참고용일 뿐입니다. 서비스 이용 중 발생하는 심리적 충격이나 사용자의 판단 결과에 대해 회사는 법적 책임을 지지 않습니다.</li>
        </ul>

        <h4>3. 금지 행위</h4>
        <p>이용자는 다음 행위를 해서는 안 됩니다:</p>
        <ul>
            <li>시스템에 과도한 부하를 주거나 비정상적인 방법으로 이용하는 행위</li>
            <li>타인을 비방하거나 불필요한 혐오 표현을 유도하는 행위</li>
            <li>불법적인 정보를 생성하거나 유포할 목적으로 서비스를 이용하는 행위</li>
        </ul>

        <h4>4. 서비스의 중단 및 변경</h4>
        <p>회사는 운영상, 기술상의 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있습니다.</p>
    </>
)
