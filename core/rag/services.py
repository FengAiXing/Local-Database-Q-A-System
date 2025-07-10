# core/rag/services.py
from django.conf import settings
import os
import re
import time
import hashlib
import json
from typing import List, Dict, Any, Optional
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from core.rag.embedding import get_embeddings
from core.rag.reranker import get_reranker
from core.rag.legal_retriever import LegalRetriever
from core.rag.text_splitters import convert_cn_to_int

def get_rag_service(knowledge_base_name, user_id=None):
    """获取RAG服务实例"""
    # 从数据库查询知识库
    from knowledge_base.models import KnowledgeBase
    try:
        if user_id is not None:
            kb = KnowledgeBase.objects.get(name=knowledge_base_name, user_id=user_id)
            # print(f"按用户ID查询知识库: {knowledge_base_name}, 用户ID: {user_id}")
        else:
            kb = KnowledgeBase.objects.get(name=knowledge_base_name)
            print(f"未指定用户ID，按名称查询知识库: {knowledge_base_name}")
        
        # 获取配置信息
        rag_configs = getattr(settings, 'RAG_CONFIGS', {})
        embedding_config = rag_configs.get('embedding', {}).copy()
        
        # 根据知识库的嵌入类型选择嵌入配置
        if kb.embedding_type == 'local':
            # print(f"使用本地嵌入模型处理知识库: {kb.name} (用户ID: {kb.user.id})")
            embedding_config['provider'] = 'local_ollama'
            embedding_config['model_name'] = embedding_config.get('local_model', 'bge-m3')
            embedding_config['base_url'] = 'http://localhost:11434/api'
        else:
            print(f"使用远程嵌入模型处理知识库: {kb.name} (用户ID: {kb.user.id})")
            # 确保使用远程配置（默认）
            embedding_config['provider'] = 'siliconflow'
            if 'local_model' in embedding_config:
                del embedding_config['local_model']
        
        # 返回包含正确嵌入配置的RAG服务
        return RAGService(
            knowledge_base_name=kb.name,
            user_id=kb.user.id,  # 传递user_id
            chunk_size=kb.chunk_size,
            chunk_overlap=kb.chunk_overlap,
            merge_rows=kb.merge_rows,
            embedding_config=embedding_config
        )
    except KnowledgeBase.DoesNotExist:
        # 从配置文件获取默认设置
        rag_configs = getattr(settings, 'RAG_CONFIGS', {})
        return RAGService(
            knowledge_base_name=knowledge_base_name,
            user_id=user_id,  # 传递user_id参数
            chunk_size=rag_configs.get('database', {}).get('chunk_size', 512),
            chunk_overlap=rag_configs.get('database', {}).get('chunk_overlap', 50),
            merge_rows=rag_configs.get('database', {}).get('merge_rows', 2),
            embedding_config=rag_configs.get('embedding', {})
        )
        
# 创建检索缓存字典
retrieval_cache = {}
# 缓存过期时间（秒）
CACHE_EXPIRY = 3600

class RAGService:
    """RAG服务"""
    def __init__(self, knowledge_base_name, user_id=None, chunk_size=512, chunk_overlap=50, merge_rows=2, embedding_config=None):
        self.kb_name = knowledge_base_name
        self.user_id = user_id
        # 生成包含用户ID的索引名称
        self.index_name = f"user_{user_id}_{knowledge_base_name}" if user_id else knowledge_base_name
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.merge_rows = merge_rows
        
        # 获取配置信息
        rag_configs = getattr(settings, 'RAG_CONFIGS', {})
        self.db_vector_path = rag_configs.get('database', {}).get('db_vector_path', 
                                                              os.path.join(settings.MEDIA_ROOT, 'faiss_index'))
        
        # 使用传入的嵌入配置或默认配置
        self.embedding_config = embedding_config or rag_configs.get('embedding', {})
        
        # 初始化组件
        self.embeddings = get_embeddings(self.embedding_config)
        self.reranker = get_reranker(rag_configs.get('reranker', {}))
        self.retriever = self._init_retriever()
        self.legal_retriever = LegalRetriever(self.db_vector_path)
    
    def _init_retriever(self):
        """初始化检索器"""
        if not self.embeddings:
            print("无法初始化嵌入模型，检索器初始化失败")
            return None
            
        try:
            # 检查向量数据库文件是否存在 - 使用index_name而不是kb_name
            index_path = os.path.join(self.db_vector_path, f"{self.index_name}.faiss")
            if not os.path.exists(index_path):
                print(f"向量数据库文件不存在: {index_path}")
                
                # 尝试查找旧格式的文件（向后兼容）
                old_index_path = os.path.join(self.db_vector_path, f"{self.kb_name}.faiss")
                if os.path.exists(old_index_path):
                    print(f"找到旧格式向量数据库文件: {old_index_path}，将使用该文件")
                    # 继续使用旧文件名
                    index_name = self.kb_name
                else:
                    print(f"新旧格式向量数据库文件均不存在")
                    return None
            else:
                # 使用新格式文件名
                index_name = self.index_name
                
            # 加载向量数据库 - 使用正确的index_name
            faiss_vectorstore = FAISS.load_local(
                folder_path=self.db_vector_path,
                embeddings=self.embeddings,
                index_name=index_name,
                allow_dangerous_deserialization=True
            )
            
            # 设置检索参数
            rag_configs = getattr(settings, 'RAG_CONFIGS', {})
            faiss_params = rag_configs.get('database', {}).get('faiss_params', {})
            
            return faiss_vectorstore.as_retriever(
                search_type=faiss_params.get('search_type', 'similarity'),
                search_kwargs=faiss_params.get('search_kwargs', {'k': 5})
            )
        
        except Exception as e:
            print(f"初始化检索器出错: {e}")
            import traceback
            traceback.print_exc()
            return None
            
    def get_cache_key(self, query: str, timestamp: float = None) -> str:
        """生成一个包含查询、索引名称和时间戳的缓存键"""
        if timestamp is None:
            timestamp = time.time()
        # 使用index_name而不是kb_name，确保用户隔离
        combined = f"{query}:{self.index_name}:{timestamp}"
        return hashlib.md5(combined.encode('utf-8')).hexdigest()

    def is_legal_document_query(self, query: str) -> bool:
        """检测是否是法律文档相关查询"""
        law_patterns = [
            r'第[一二三四五六七八九十百千万]+章',
            r'第[一二三四五六七八九十百千万]+条',
            r'第[一二三四五六七八九十百千万]+款',
            r'第[一二三四五六七八九十百千万]+项'
        ]
        for pattern in law_patterns:
            if re.search(pattern, query):
                return True
        legal_keywords = ['法律', '条例', '规定', '法规', '实施细则', '条款']
        for keyword in legal_keywords:
            if keyword in query:
                return True
        return False

    def is_article_query(self, query: str) -> bool:
        """检测是否是单纯的条款查询，如'第二条'"""
        return bool(re.match(r'^第[一二三四五六七八九十百千万]+条$', query))

    def is_chapter_query(self, query: str) -> bool:
        """检测是否是查询特定章节的所有条款"""
        chapter_patterns = [
            r'第[一二三四五六七八九十百千万]+章有哪些条款',
            r'第[一二三四五六七八九十百千万]+章包含(哪些|什么)条款',
            r'第[一二三四五六七八九十百千万]+章的条款',
        ]
        for pattern in chapter_patterns:
            if re.search(pattern, query):
                return True
        return False

    def extract_chapter_num(self, query: str) -> int:
        """从查询中提取章节号"""
        match = re.search(r'第([一二三四五六七八九十百千万]+)章', query)
        if match:
            cn_num = match.group(1)
            return convert_cn_to_int(cn_num)
        return 0

    def extract_law_references(self, query: str) -> list:
        """提取查询中的法律引用"""
        references = []
        patterns = [
            (r'第([一二三四五六七八九十百千万]+)章', '章'),
            (r'第([一二三四五六七八九十百千万]+)条', '条'),
            (r'第([一二三四五六七八九十百千万]+)款', '款'),
            (r'第([一二三四五六七八九十百千万]+)项', '项')
        ]
        for pattern, type_name in patterns:
            matches = re.finditer(pattern, query)
            for match in matches:
                cn_num = match.group(1)
                references.append({
                    'text': match.group(0),
                    'type': type_name,
                    'position': match.span(),
                    'num': convert_cn_to_int(cn_num)
                })
        return references

    def parse_legal_query(self, query: str) -> dict:
        """
        解析法律查询以提取结构信息，包括法律名称、章节、条款、年份和会议信息
        """
        result = {"original_query": query}
        law_names = []
        law_pattern = r'《([^》]+法)》'
        for match in re.finditer(law_pattern, query):
            law_names.append(match.group(1))
        if law_names:
            result["law_names"] = law_names
        chapter_refs = []
        chapter_pattern = r'第([一二三四五六七八九十百千万]+)章'
        for match in re.finditer(chapter_pattern, query):
            cn_num = match.group(1)
            chapter_refs.append({
                "text": f"第{cn_num}章",
                "num": convert_cn_to_int(cn_num)
            })
        if chapter_refs:
            result["chapter_refs"] = chapter_refs
        article_refs = []
        article_pattern = r'第([一二三四五六七八九十百千万]+)条'
        for match in re.finditer(article_pattern, query):
            cn_num = match.group(1)
            article_refs.append({
                "text": f"第{cn_num}条",
                "num": convert_cn_to_int(cn_num)
            })
        if article_refs:
            result["article_refs"] = article_refs
        year_refs = re.findall(r'(\d{4}年)', query)
        if year_refs:
            result["year_refs"] = year_refs
        meeting_refs = re.findall(r'(第[一二三四五六七八九十]+届.*?会议)', query)
        if meeting_refs:
            result["meeting_refs"] = meeting_refs
        return result

    def filter_docs_by_metadata(self, docs: list, query_info: dict) -> list:
        """根据元数据过滤文档"""
        filtered = docs
        if "year_refs" in query_info:
            year_keywords = query_info["year_refs"]
            filtered = [doc for doc in filtered if any(
                year in doc.metadata.get("law_header", {}).get("adoption", {}).get("date", "")
                for year in year_keywords
            )]
            print("经过年份过滤后的文档数：", len(filtered))
        if "meeting_refs" in query_info:
            meeting_keywords = query_info["meeting_refs"]
            temp = []
            for doc in filtered:
                law_header = doc.metadata.get("law_header", {})
                adoption_meeting = law_header.get("adoption", {}).get("meeting", "")
                amendments = law_header.get("amendments", [])
                if any(meeting_kw in adoption_meeting for meeting_kw in meeting_keywords):
                    temp.append(doc)
                else:
                    for amendment in amendments:
                        if any(meeting_kw in amendment.get("meeting", "") for meeting_kw in meeting_keywords):
                            temp.append(doc)
                            break
            filtered = temp if temp else filtered
            print("经过会议信息过滤后的文档数：", len(filtered))
        if "law_names" in query_info and query_info["law_names"]:
            # 按指定的法律名称过滤
            law_names = query_info["law_names"]
            filtered = [doc for doc in filtered if any(
                law_name in doc.metadata.get("law_name", "") for law_name in law_names
            )]
            print(f"按法律名称过滤后的文档数: {len(filtered)}")
        return filtered

    def post_process_merge_retrieved_docs(self, docs: List[Document]) -> List[Document]:
        """
        将检索结果中同一母块（具有相同 parent_id）的子块合并为完整的母块。
        如果组内存在标记 is_mother 的文档，则优先返回母块。
        对于没有 parent_id 的文档，直接返回。
        """
        grouped = {}
        standalone = []
        for doc in docs:
            parent_id = doc.metadata.get("parent_id")
            if parent_id:
                if parent_id not in grouped:
                    grouped[parent_id] = []
                grouped[parent_id].append(doc)
            else:
                standalone.append(doc)
        merged_docs = []
        for pid, sub_docs in grouped.items():
            mother = next((d for d in sub_docs if d.metadata.get("is_mother")), None)
            if mother:
                merged_docs.append(mother)
            else:
                sub_docs.sort(key=lambda d: d.metadata.get("chunk_index", 0))
                merged_text = "".join(d.page_content for d in sub_docs)
                meta = sub_docs[0].metadata.copy()
                meta["merged"] = True
                meta["original_subchunks"] = len(sub_docs)
                merged_docs.append(Document(page_content=merged_text, metadata=meta))
        return standalone + merged_docs

    def fetch_exact_law_articles(self, query: str) -> List[Document]:
        """针对法律文档的精确检索"""
        if not self.retriever:
            return []
        if self.is_article_query(query):
            article_matches = re.findall(r'第([一二三四五六七八九十百千万]+)条', query)
            if article_matches:
                enhanced_query = f"中华人民共和国人口与计划生育法{query}完整内容"
                print(f"增强简单条款查询: {query} -> {enhanced_query}")
                query = enhanced_query
        
        query_info = self.parse_legal_query(query)
        legal_docs = self.legal_retriever.retrieve_by_query(query_info)
        if legal_docs:
            if re.search(r'第[一二三四五六七八九十百千万]+条', query):
                legal_docs = [doc for doc in legal_docs if doc.metadata.get("content_type") == "article_content"]
            for doc in legal_docs:
                doc.metadata["exact_match"] = True
                doc.metadata["score"] = 1.0
            return legal_docs
        
        if self.is_article_query(query):
            article_num_match = re.search(r'第([一二三四五六七八九十百千万]+)条', query)
            if article_num_match:
                cn_num = article_num_match.group(1)
                article_num = convert_cn_to_int(cn_num)
                retriever_config = {
                    "search_type": "similarity",
                    "search_kwargs": {"k": 20, "score_threshold": 0.05} # 降低阈值
                }
                try:
                    docs = self.retriever.invoke(query)
                    filtered_docs = []
                    for doc in docs:
                        if f"第{cn_num}条" in doc.page_content:
                            doc.metadata["exact_match"] = True
                            doc.metadata["score"] = 1.0
                            filtered_docs.append(doc)
                    if filtered_docs:
                        print(f"精确匹配找到 {len(filtered_docs)} 个包含'{query}'的文档")
                        return filtered_docs
                except Exception as e:
                    print(f"精确检索出错: {e}")
        
        references = self.extract_law_references(query)
        if not references:
            return []
        
        exact_docs = []
        for ref in references:
            exact_query = ref['text']
            try:
                docs = self.retriever.invoke(exact_query)
                filtered_docs = []
                for doc in docs:
                    if ref['text'] in doc.page_content:
                        doc.metadata["exact_match"] = True
                        doc.metadata["score"] = (doc.metadata.get("score", 0.5) + 0.5)
                        filtered_docs.append(doc)
                exact_docs.extend(filtered_docs)
            except Exception as e:
                print(f"精确检索出错: {e}")
        
        return exact_docs

    def retrieve(self, query: str, top_k=5, threshold=0.05, force_refresh=False, rewrite=True):
        """检索相关文档"""
        # print(f"RAG检索开始，查询：{query}，知识库：{self.kb_name}")
        
        if not self.retriever:
            print(f"错误：retriever 未初始化，可能是向量数据库不存在")
            return []
        
        cache_key = self.get_cache_key(query)
        if cache_key in retrieval_cache and not force_refresh:
            cache_data = retrieval_cache[cache_key]
            if time.time() - cache_data['timestamp'] < CACHE_EXPIRY:
                return cache_data['docs']
        
        all_docs = []
        
        # 处理章节条款查询
        if self.is_chapter_query(query):
            print("检测到章节条款查询，使用章节专用检索")
            chapter_num = self.extract_chapter_num(query)
            law_name = ""
            query_info = self.parse_legal_query(query)
            law_names = query_info.get("law_names", [])
            if law_names:
                law_name = law_names[0]
            
            chapter_docs = self.legal_retriever.retrieve_by_chapter(law_name, chapter_num)
            if chapter_docs:
                print(f"章节检索找到 {len(chapter_docs)} 个相关条款")
                retrieval_cache[cache_key] = {'docs': chapter_docs, 'timestamp': time.time()}
                return chapter_docs
        
        # 处理法律文档查询
        if self.is_legal_document_query(query):
            exact_docs = self.fetch_exact_law_articles(query)
            all_docs.extend(exact_docs)
            print(f"精确匹配找到 {len(exact_docs)} 个文档")
        
        # 处理简单条款查询
        if self.is_article_query(query) and len(all_docs) == 0:
            article_match = re.search(r'第([一二三四五六七八九十百千万]+)条', query)
            if article_match:
                cn_num = article_match.group(1)
                enhanced_queries = []
                
                # 根据查询情况构建增强查询
                query_info = self.parse_legal_query(query)
                law_names = query_info.get("law_names", [])
                
                # 如果查询中指定了法律名称，优先尝试
                if law_names:
                    for law_name in law_names:
                        enhanced_queries.append(f"{law_name}{query}")
                else:
                    # 默认扩展查询
                    enhanced_queries = [
                        f"中华人民共和国人口与计划生育法{query}",
                        f"人口与计划生育法{query}",
                        f"{query}人口与计划生育",
                        f"{query}内容"
                    ]
                
                for enhanced_query in enhanced_queries:
                    print(f"尝试扩展查询: {enhanced_query}")
                    try:
                        vector_docs = self.retriever.invoke(enhanced_query)
                        article_docs = [doc for doc in vector_docs if f"第{cn_num}条" in doc.page_content]
                        if article_docs:
                            for doc in article_docs:
                                doc.metadata["score"] = 1.0
                                doc.metadata["exact_match"] = True
                            all_docs.extend(article_docs)
                            print(f"使用扩展查询找到 {len(article_docs)} 个文档")
                            break
                    except Exception as e:
                        print(f"扩展查询出错: {e}")
        
        # 如果没有找到足够的文档，使用普通向量检索
        if len(all_docs) < top_k:
            remaining = top_k - len(all_docs)
            try:
                print(f"执行向量检索...")
                vector_docs = self.retriever.invoke(query)
                # print(f"向量检索找到 {len(vector_docs)} 个文档")
                
                # 打印前三个结果的内容与分数
                # for i, doc in enumerate(vector_docs[:3]):
                #     score = doc.metadata.get("score", "未知")
                #     print(f"文档 {i+1} 内容: {doc.page_content[:50]}... 分数: {score}")
                
                if all_docs:
                    existing_contents = {doc.page_content for doc in all_docs}
                    vector_docs = [doc for doc in vector_docs if doc.page_content not in existing_contents]
                
                # 确保所有文档都有分数
                for doc in vector_docs:
                    if "score" not in doc.metadata:
                        doc.metadata["score"] = 0.5
                
                all_docs.extend(vector_docs)
            except Exception as e:
                print(f"向量检索出错: {e}")
                import traceback
                traceback.print_exc()
        
        # 应用法律名称等元数据过滤
        query_info = self.parse_legal_query(query)
        all_docs = self.filter_docs_by_metadata(all_docs, query_info)
        
        # 过滤条款查询中的章节列表
        if re.search(r'第[一二三四五六七八九十百千万]+条', query):
            all_docs = [d for d in all_docs if d.metadata.get("content_type") != "article_list"]
        
        # 使用重排序器
        if self.reranker and len(all_docs) > 0:
            try:
                docs_content = [d.page_content for d in all_docs]
                scores = self.reranker.compute_score([[query, kn] for kn in docs_content])
                scores = scores if isinstance(scores, list) else [scores]
                for d, score in zip(all_docs, scores):
                    if 'exact_match' in d.metadata and d.metadata.get('exact_match', False):
                        d.metadata["score"] = max(score, d.metadata.get("score", 0))
                    else:
                        d.metadata["score"] = score
                all_docs = sorted(all_docs, key=lambda x: x.metadata.get("score", 0), reverse=True)
                all_docs = all_docs[:top_k]
                if threshold > 0:
                    all_docs = [d for d in all_docs if d.metadata.get("score", 0) >= threshold]
            except Exception as e:
                print(f"重排序出错: {e}")
                # 确保至少返回一些文档
                all_docs = all_docs[:top_k]
        
        # 合并子块
        all_docs = self.post_process_merge_retrieved_docs(all_docs)
        
        # 如果仍然没有找到文档，可能需要降低阈值再试一次
        if not all_docs:
            print("未找到文档，尝试降低阈值并重新检索...")
            try:
                vector_docs = self.retriever.invoke(query)
                # 不做过滤，直接返回前几个结果
                if vector_docs:
                    print(f"降低阈值后找到 {len(vector_docs)} 个文档")
                    for doc in vector_docs:
                        if "score" not in doc.metadata:
                            doc.metadata["score"] = 0.3  # 设置一个默认分数
                    all_docs = vector_docs[:top_k]
            except Exception as e:
                print(f"最终尝试检索出错: {e}")
        
        # 缓存结果
        if all_docs:
            # print(f"最终找到 {len(all_docs)} 个文档")
            retrieval_cache[cache_key] = {'docs': all_docs, 'timestamp': time.time()}
            if len(retrieval_cache) > 100:
                oldest_key = min(retrieval_cache.keys(), key=lambda k: retrieval_cache[k]['timestamp'])
                del retrieval_cache[oldest_key]
        else:
            print("最终未找到相关文档")
        
        return all_docs

    def create_prompt(self, question: str, docs: list) -> str:
        """创建提示词"""
        if not docs:
            return (
                "### 系统指令 ###\n"
                "你是一个严格遵循指令的知识库问答助手。对于以下问题，知识库中没有找到任何相关信息。"
                "你必须首先明确告知用户'未在知识库中找到相关内容'，使用这个精确的词语。"
                "然后，你可以基于你的常识提供一个可能的回答，但必须在回答前明确标注'以下是我的推测，不基于知识库内容，仅供参考:'。"
                "你必须遵循这个格式，不得省略这些提示语。\n\n"
                f"### 用户问题 ###\n{question}"
            )

        # 预处理文档，合并相同法条但不同部分的内容
        processed_docs = self._merge_same_articles(docs)

        # 按法律名称和章节分组
        grouped_docs = {}
        for doc in processed_docs:
            law_name = doc.metadata.get("law_name", "未知法律")
            chapter = doc.metadata.get("chapter_title",
                                doc.metadata.get("chapter", "未分章内容"))

            group_key = f"{law_name} - {chapter}"
            if group_key not in grouped_docs:
                grouped_docs[group_key] = []
            grouped_docs[group_key].append(doc)

        info = []
        
        # 处理每个分组
        for group_key, chapter_docs in grouped_docs.items():
            chapter_info = [f"【{group_key}】:"]
            
            # 对文档按法条号排序（如果有的话）
            sorted_docs = sorted(chapter_docs, 
                            key=lambda d: d.metadata.get("article_num", 999999))
            
            for doc in sorted_docs:
                # 从元数据获取关键信息
                law_name = doc.metadata.get("law_name", "未知法律")
                article_num = doc.metadata.get("article_num")
                article = doc.metadata.get("article", "")
                title = doc.metadata.get("article_title", doc.metadata.get("title", ""))
                content = re.sub(r"\n+", "\n", doc.page_content.strip())
                source = doc.metadata.get("source", "未知来源")
                score = doc.metadata.get("score", 0)

                doc_info = []
                # 格式化内容显示，优先显示法律名称+条款
                if article:
                    # 如果是法律条款，清晰标示法律名称和条款号
                    doc_info.append(f"{law_name} {article}：{content}")
                elif title and title not in content:
                    doc_info.append(f"{title}：{content}")
                else:
                    # 对于无明显标题的法律文本，尝试提取条款号
                    article_match = re.search(r'第([一二三四五六七八九十百千]+)条', content)
                    if article_match:
                        article_text = f"第{article_match.group(1)}条"
                        doc_info.append(f"{law_name} {article_text}：{content}")
                    else:
                        doc_info.append(content)
                
                chapter_info.append("\n".join(doc_info))

            info.append("\n".join(chapter_info))

        # 提取问题中的法律引用
        references = self.extract_law_references(question)
        specific_refs = [ref['text'] for ref in references]

        # 构建最终提示词
        prompt = "\n\n".join(info)
        
        # 检测是否是选择题
        is_choice_question = bool(re.search(r'[A-D]\.', question)) 
        
        # 构建通用格式化回答指导
        prompt += f"\n\n### 用户问题 ###\n{question}\n\n"
        prompt += """
    ### 回答要求 ###
    请根据上述知识库内容回答问题。你必须严格按照以下格式规范回答:

    1. 首先使用加粗文本直接给出答案:
    - 如果是选择题，格式为"**答案是X**"（其中X为正确选项字母）
    - 如果是问答题，格式为"**答案：...**"
    
    2. 然后换行并加粗显示"**理由：**"，接着简洁地解释理由

    3. 最后换行并加粗显示"**引用法条：**"

    4. 再换行列出相关法条，格式为"《法律名称》**第X条**：内容"
    - 如有多个法条，每个法条必须单独一行显示
    - 同一条法条的多个部分必须合并在一起展示，不要重复法条编号
    - 如果一个法条有多个分段，按照原文分段显示，但只在开始处标注一次条款号
    - 段落之间要有明确的换行

    例如，正确的法条引用格式为：
    《某法》**第X条**：第一段内容...
    第二段内容...
    第三段内容...

    《某法》**第Y条**：相关内容...

    注意事项：
    - 确保整个回答格式清晰，避免任何内容重复
    - 答案部分要简洁明确
    - 所有标题（答案、理由、引用法条）必须加粗显示
    - 法条中的"第X条"部分也要加粗显示，但仅在各条开始处显示一次
    - 不同部分之间必须换行分隔
    - 不要在回答中使用多余的格式标记如"###"
    """

        # 如果知识库内容不足以回答问题，添加指示
        prompt += """
    如果知识库内容不足以回答问题，请明确说明"**知识库中未找到相关信息**"，然后可以基于你的一般知识给出可能的答案，
    但必须明确标注"**以下是我的推测，仅供参考：**"，并按照上述格式规范排版回答。
    """
        
        return prompt

    def _merge_same_articles(self, docs):
        """合并相同法条但不同部分的内容"""
        # 按照法律名称和条款号分组
        article_groups = {}
        
        for doc in docs:
            law_name = doc.metadata.get("law_name", "未知法律")
            article_num = doc.metadata.get("article_num")
            
            if not article_num:
                # 如果没有条款号，尝试从内容中提取
                content = doc.page_content
                article_match = re.search(r'第([一二三四五六七八九十百千]+)条', content)
                if article_match:
                    article_num = self.convert_cn_to_int(article_match.group(1))
            
            # 跳过无法识别条款号的文档
            if not article_num:
                continue
                
            key = f"{law_name}_{article_num}"
            
            if key not in article_groups:
                article_groups[key] = []
            
            article_groups[key].append(doc)
        
        # 处理每个组，合并内容
        from langchain_core.documents import Document
        merged_docs = []
        
        # 首先添加所有没有参与合并的文档
        for doc in docs:
            law_name = doc.metadata.get("law_name", "未知法律")
            article_num = doc.metadata.get("article_num")
            
            if not article_num:
                # 没有条款号的文档直接添加
                merged_docs.append(doc)
        
        # 再处理需要合并的文档
        for key, group_docs in article_groups.items():
            if len(group_docs) <= 1:
                # 只有一个文档，不需要合并
                merged_docs.extend(group_docs)
                continue
            
            # 按相关度排序
            sorted_docs = sorted(group_docs, 
                            key=lambda d: d.metadata.get("score", 0),
                            reverse=True)
            
            # 准备合并
            combined_content = []
            meta = sorted_docs[0].metadata.copy()  # 使用相关度最高的文档的元数据
            
            for d in sorted_docs:
                content = d.page_content.strip()
                # 移除可能的法条号前缀以避免重复
                content = re.sub(r'^《.*?》\s*第[一二三四五六七八九十百千]+条[：:]\s*', '', content)
                # 添加到合并内容
                if content not in "".join(combined_content):  # 避免完全重复的内容
                    combined_content.append(content)
            
            # 创建新的合并文档
            merged_content = "\n\n".join(combined_content)
            merged_doc = Document(
                page_content=merged_content,
                metadata=meta
            )
            
            merged_docs.append(merged_doc)
        
        return merged_docs