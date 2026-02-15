import os
from tavily import TavilyClient
from langchain_community.tools.tavily_search import TavilySearchResults

def get_search_tool():
    """
    AG-10: Tavily 검색 도구
    """
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        # 키가 없을 경우 결과가 비어있는 더미 도구 반환 또는 예외 처리
        return None
    
    return TavilySearchResults(
        api_key=api_key,
        max_results=5,
        search_depth="advanced"
    )

def get_statistics_search(category: str, keyword: str):
    """
    AG-11: 통계 정보 특화 검색
    """
    query = f"{category} {keyword} 통계 데이터 취업 고용노동부 통계청"
    # 실제로는 search_web을 래핑하여 특정 출처를 강조하는 쿼리로 변환
    return query
