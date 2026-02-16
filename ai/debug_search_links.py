import asyncio
import sys
from app.tools.search import get_search_tool

async def debug_search_links():
    search_tool = get_search_tool()
    results = search_tool.invoke({"query": "자연어 처리 감성 분석 논문"})
    print("--- Search Tool Raw Output ---")
    print(results)
    
    # Check if 'link' is present in the output
    if "link" in str(results):
        print("\n✅ Success: Links are present in the search results.")
    else:
        print("\n❌ Failure: No links found in search results. LLM might not be getting URLs.")

if __name__ == "__main__":
    asyncio.run(debug_search_links())
