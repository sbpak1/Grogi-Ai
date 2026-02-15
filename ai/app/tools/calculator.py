from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
import os

class RealityScore(BaseModel):
    goal_realism: int = Field(..., ge=0, le=20, description="목표의 비현실성 (10=보통, 20=완전허황, 0=매우현실적)")
    effort_specificity: int = Field(..., ge=0, le=20, description="노력의 추상성 (10=보통, 20=구름잡는소리, 0=나노단위계획)")
    external_blame: int = Field(..., ge=0, le=20, description="남탓/환경탓 비중 (10=보통, 20=전적인남탓, 0=내탓인정)")
    info_seeking: int = Field(..., ge=0, le=20, description="정보 부족/무지 (10=보통, 20=아예모름, 0=전문가수준)")
    time_urgency: int = Field(..., ge=0, le=20, description="안일함/나태함 (10=보통, 20=천하태평, 0=지금당장)")
    total: int = Field(..., description="총점 (높을수록 현실 회피가 심함)")
    summary: str = Field(..., description="점수에 대한 팩폭 평가")

def calculate_reality_score_logic(user_message: str, ai_response: str) -> dict:
    """
    AG-12: LLM 기반 현실회피지수 산출 (High Score = High Avoidance)
    """
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    
    parser = JsonOutputParser(pydantic_object=RealityScore)
    
    # 채점 기준 가이드라인
    scoring_rubric = """
    [채점 가이드라인 - 기준점 10점]
    모든 항목은 '10점(평균)'에서 시작하여, 사용자의 발언 내용에 따라 가감점하십시오.
    점수가 높을수록 '현실을 회피하고 상태가 나쁨(Bad)'을 의미합니다.

    1. 목표의 비현실성 (Goal Realism)
       - (+5~10): "로또 당첨", "유튜브로 월 1억" 등 허황된 꿈, 근거 없는 자신감
       - (0): "돈 많이 벌고 싶다" 정도의 막연한 희망
       - (-5~10): "월 100만원 저축", "자격증 취득" 등 실현 가능한 목표

    2. 노력의 추상성 (Effort Specificity)
       - (+5~10): "열심히 하겠다", "최선을 다하겠다" (구체성 Zero)
       - (0): "운동 좀 해야지"
       - (-5~10): "매일 아침 6시 기상", "하루 30분 단어 암기" (숫자가 포함된 계획)

    3. 남탓/환경탓 (External Blame)
       - (+5~10): "사회가 썩었다", "부모님 때문에 망했다", "운이 없었다"
       - (0): 상황에 대한 단순 불만
       - (-5~10): "내가 게을렀다", "내 판단 미스였다" (명확한 자기 책임 인정)

    4. 정보 부족/무지 (Info Seeking)
       - (+5~10): "어떻게든 되겠지", "잘 모르지만 일단 고" (근거 없는 낙관)
       - (0): "알아보는 중이다"
       - (-5~10): 객관적 수치, 통계, 구체적인 방법론을 언급함

    5. 안일함/나태함 (Time Urgency)
       - (+5~10): "내일부터", "언젠가", "아직 젊으니까"
       - (0): "이제 해야지"
       - (-5~10): "지금 당장", "오늘부터 바로", 위기감을 느끼고 행동함
    """

    prompt = ChatPromptTemplate.from_messages([
        ("system", """사용자의 입력과 AI의 팩폭 내용을 바탕으로 '현실 회피 지수'를 정밀하게 채점하세요.
{scoring_rubric}

[중요 채점 규칙]
1. **10점**을 기준으로 하되, **1점 단위**로 세밀하게 가감점하십시오. (예: 13점, 8점, 17점)
2. 딱 떨어지는 점수(0, 10, 20)보다는, 사용자의 미묘한 뉘앙스(망설임, 단어 선택, 문장 길이 등)를 반영하여 **중간 점수**를 적극적으로 부여하십시오.
3. 예를 들어, 완전히 허황되지는 않지만 조금 모호하다면 13점, 꽤 구체적이지만 살짝 비현실적이라면 7점 같은 식입니다.

반드시 위 기준에 맞춰 JSON 형식으로 응답하세요:
{format_instructions}"""),
        ("user", "사용자 입력: {user_input}\nAI 분석 내용: {ai_response}")
    ])
    
    chain = prompt | llm | parser
    
    try:
        score_data = chain.invoke({
            "user_input": user_message,
            "ai_response": ai_response,
            "scoring_rubric": scoring_rubric,
            "format_instructions": parser.get_format_instructions()
        })
        
        # breakdown 구조
        breakdown = {
            "goal_realism": score_data["goal_realism"],
            "effort_specificity": score_data["effort_specificity"],
            "external_blame": score_data["external_blame"],
            "info_seeking": score_data["info_seeking"],
            "time_urgency": score_data["time_urgency"]
        }
        
        return {
            "total": sum(breakdown.values()),
            "breakdown": breakdown,
            "summary": score_data["summary"]
        }
    except Exception as e:
        return {
            "total": 50,
            "breakdown": {
                "goal_realism": 10, "effort_specificity": 10, "external_blame": 10,
                "info_seeking": 10, "time_urgency": 10
            },
            "summary": "분석 오류로 기본 점수를 부여합니다."
        }
