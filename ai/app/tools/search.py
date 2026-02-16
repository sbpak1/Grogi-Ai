from langchain_community.tools import DuckDuckGoSearchResults
from langchain_community.utilities import DuckDuckGoSearchAPIWrapper

def get_search_tool():
    """
    AG-10: DuckDuckGo 무료 검색 도구 (링크 포함)
    """
    wrapper = DuckDuckGoSearchAPIWrapper(region="kr-kr", time="d", max_results=5)
    return DuckDuckGoSearchResults(api_wrapper=wrapper)

def get_statistics_search(category: str, keyword: str):
    """
    AG-11: 통계 정보 특화 검색
    """
    query = f"{category} {keyword} 통계 데이터 취업 고용노동부 통계청"
    # 실제로는 search_web을 래핑하여 특정 출처를 강조하는 쿼리로 변환
    return query
