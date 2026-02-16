import asyncio
from app.agent.graph import build_graph, AgentState
from app.tools.search import get_search_tool
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv
import os

load_dotenv(override=True)

async def debug_search():
    user_msg = "여자 친구가 두쫀쿠 안 사줬다고 시간을 갖자고 하네"
    llm_mini = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
    
    extract_prompt = ChatPromptTemplate.from_messages([
        ("system", """사용자 메시지에서 검색이 필요한 키워드를 추출해.
- 모르는 단어, 브랜드명, 제품명, 유행어, 사건 등 검색해야 이해할 수 있는 것만.
- 일상 대화에서 누구나 아는 단어는 제외.
- 검색할 게 없으면 "NONE"이라고만 답해.
- 검색할 게 있으면 검색 쿼리 하나만 짧게 답해. (예: "두쫀쿠 과자")"""),
        ("user", "{input}")
    ])
    extract_chain = extract_prompt | llm_mini | StrOutputParser()
    search_query = extract_chain.invoke({"input": user_msg}).strip()
    print(f"Extracted Query: {search_query}")
    
    if search_query and search_query.upper() != "NONE":
        search_tool = get_search_tool()
        try:
            results = search_tool.invoke({"query": search_query})
            print(f"Search Results: {results}")
        except Exception as e:
            print(f"Search Error: {e}")
    else:
        print("No search query extracted.")

if __name__ == "__main__":
    asyncio.run(debug_search())
