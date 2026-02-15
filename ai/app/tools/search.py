from langchain_community.tools import DuckDuckGoSearchRun

def get_search_tool():
    """
    AG-10: DuckDuckGo 무료 검색 도구 (API Key 불필요)
    """
    return DuckDuckGoSearchRun()

def get_statistics_search(category: str, keyword: str):
    """
    AG-11: 통계 정보 특화 검색
    """
    query = f"{category} {keyword} 통계 데이터 취업 고용노동부 통계청"
    # 실제로는 search_web을 래핑하여 특정 출처를 강조하는 쿼리로 변환
    return query
