import os
import json
import re
from typing import List, Dict, Any, Optional
from langchain_core.documents import Document

class LegalRetriever:
    """法律文档专用检索器"""

    def __init__(self, db_vector_path):
        self.index_dir = os.path.join(db_vector_path, "law_structure")
        os.makedirs(self.index_dir, exist_ok=True)
        self.law_indices = self._load_indices()

    def _load_indices(self) -> Dict:
        """加载所有法律结构索引并进行增强"""
        indices = {}

        if not os.path.exists(self.index_dir):
            return indices

        for file in os.listdir(self.index_dir):
            if file.endswith('.json'):
                try:
                    with open(os.path.join(self.index_dir, file), 'r', encoding='utf-8') as f:
                        structure = json.load(f)

                    # 进行数据增强：确保章节-条款关系完整
                    chapters = structure.get("chapters", {})
                    articles = structure.get("articles", {})

                    # 为每个条款确保章节归属
                    for art_id, article in articles.items():
                        chapter_num = article.get("chapter_num")
                        if chapter_num:
                            str_chapter_num = str(chapter_num)
                            if str_chapter_num in chapters:
                                if "articles" not in chapters[str_chapter_num]:
                                    chapters[str_chapter_num]["articles"] = []
                                if art_id not in chapters[str_chapter_num]["articles"]:
                                    chapters[str_chapter_num]["articles"].append(art_id)

                    structure["chapters"] = chapters

                    # 保存到索引
                    law_name = structure.get("law_name")
                    if law_name:
                        indices[law_name] = structure
                except Exception as e:
                    print(f"加载法律索引失败: {file}, 错误: {e}")

        return indices

    def retrieve_by_law_name(self, law_name: str) -> List[Document]:
        """通过法律名称检索文档"""
        docs = []

        # 模糊匹配法律名称
        matched_laws = []
        for name, structure in self.law_indices.items():
            if law_name in name:
                matched_laws.append(structure)

        # 构建文档
        for law in matched_laws:
            # 添加法律概览
            chapters_info = []
            for num, info in sorted(law["chapters"].items(), key=lambda x: int(x[0])):
                chapters_info.append(f"{num}. {info['full_title']}")

            docs.append(Document(
                page_content=f"《{law['law_name']}》包含以下章节:\n" + "\n".join(chapters_info),
                metadata={
                    "source": law["source"],
                    "law_name": law["law_name"],
                    "content_type": "law_overview"
                }
            ))

        return docs

    def retrieve_by_chapter(self, law_name: str, chapter_num: int) -> List[Document]:
        """检索特定章节的所有条款"""
        docs = []

        for name, structure in self.law_indices.items():
            if law_name in name or not law_name:  # 如果未指定法律名称，尝试所有法律
                chapters = structure.get("chapters", {})
                str_chapter_num = str(chapter_num)

                if str_chapter_num in chapters:
                    chapter_info = chapters[str_chapter_num]

                    # 创建章节概览
                    chapter_title = chapter_info.get("full_title", f"第{chapter_num}章")

                    # 重要：获取该章所有条款，并按顺序排列
                    article_nums = []
                    if "articles" in chapter_info:
                        article_nums = sorted([int(num) for num in chapter_info["articles"]])

                    if article_nums:
                        # 添加章节概述
                        overview = f"《{structure['law_name']}》{chapter_title}包含以下条款:\n"
                        overview += "、".join([f"第{num}条" for num in article_nums])

                        docs.append(Document(
                            page_content=overview,
                            metadata={
                                "source": structure["source"],
                                "law_name": structure["law_name"],
                                "chapter_num": chapter_num,
                                "content_type": "chapter_overview",
                                "score": 0.5  # 给予高得分确保排序靠前
                            }
                        ))

                        # 添加每个条款的完整内容
                        for art_num in article_nums:
                            str_art_num = str(art_num)
                            if str_art_num in structure["articles"]:
                                article = structure["articles"][str_art_num]
                                docs.append(Document(
                                    page_content=article["content"],
                                    metadata={
                                        "source": structure["source"],
                                        "law_name": structure["law_name"],
                                        "chapter_num": chapter_num,
                                        "article_num": art_num,
                                        "content_type": "article_content",
                                        "score": 0.95  # 给予较高得分但低于概述
                                    }
                                ))

        return docs

    def retrieve_by_article(self, law_name: str, article_num: int) -> List[Document]:
        """检索特定条款"""
        docs = []

        for name, structure in self.law_indices.items():
            if law_name in name:
                articles = structure.get("articles", {})
                article = articles.get(str(article_num))

                if article:
                    docs.append(Document(
                        page_content=article["content"],
                        metadata={
                            "source": structure["source"],
                            "law_name": structure["law_name"],
                            "article_num": article_num,
                            "chapter_num": article["chapter_num"],
                            "content_type": "article_content"
                        }
                    ))

        return docs

    def retrieve_by_query(self, query_info: Dict) -> List[Document]:
        """根据查询信息检索法律文档"""
        docs = []

        # 确定要检索的法律
        law_names = query_info.get("law_names", [])
        if not law_names:
            # 从查询文本中尝试提取法律名称
            text_match = re.search(r'([\u4e00-\u9fa5《》、]{4,}法)', query_info.get("original_query", ""))
            if text_match:
                law_names = [text_match.group(1)]
        
        # 严格限制只检索指定的法律
        if law_names:
            # 只检索指定名称的法律文档，使用更严格的匹配
            strict_matched_laws = []
            for name in law_names:
                for law_name, structure in self.law_indices.items():
                    # 只有当法律名称完全匹配或者是子字符串关系时才匹配
                    if name == law_name or name in law_name:
                        strict_matched_laws.append(structure)
                        print(f"严格匹配到法律: {law_name}")
            
            # 使用严格匹配的法律列表
            if strict_matched_laws:
                # 检查是否有章节引用
                if "chapter_refs" in query_info:
                    for chapter_ref in query_info["chapter_refs"]:
                        for law in strict_matched_laws:
                            law_name = law.get("law_name")
                            chapter_docs = self.retrieve_by_chapter(law_name, chapter_ref["num"])
                            docs.extend(chapter_docs)
                            print(f"从法律 '{law_name}' 章节 {chapter_ref['num']} 检索到 {len(chapter_docs)} 个文档")

                # 检查是否有条款引用
                elif "article_refs" in query_info:
                    for article_ref in query_info["article_refs"]:
                        for law in strict_matched_laws:
                            law_name = law.get("law_name")
                            article_docs = self.retrieve_by_article(law_name, article_ref["num"])
                            docs.extend(article_docs)
                            print(f"从法律 '{law_name}' 条款 {article_ref['num']} 检索到 {len(article_docs)} 个文档")

                # 如果只有法律名称
                else:
                    for law in strict_matched_laws:
                        law_name = law.get("law_name")
                        law_docs = self.retrieve_by_law_name(law_name)
                        docs.extend(law_docs)
                        print(f"从法律 '{law_name}' 检索到 {len(law_docs)} 个文档")
            else:
                print(f"警告: 未找到匹配的法律文档: {law_names}")
        else:
            # 如果没有指定法律名称，尝试根据条款或章节引用查找
            if "chapter_refs" in query_info:
                for chapter_ref in query_info["chapter_refs"]:
                    # 在所有法律中查找指定章节
                    for law_name, structure in self.law_indices.items():
                        chapter_docs = self.retrieve_by_chapter(law_name, chapter_ref["num"])
                        if chapter_docs:
                            docs.extend(chapter_docs)
                            print(f"从法律 '{law_name}' 章节 {chapter_ref['num']} 检索到 {len(chapter_docs)} 个文档")
                    
            elif "article_refs" in query_info:
                for article_ref in query_info["article_refs"]:
                    # 在所有法律中查找指定条款
                    for law_name, structure in self.law_indices.items():
                        article_docs = self.retrieve_by_article(law_name, article_ref["num"])
                        if article_docs:
                            docs.extend(article_docs)
                            print(f"从法律 '{law_name}' 条款 {article_ref['num']} 检索到 {len(article_docs)} 个文档")

        # 打印最终检索结果
        print(f"法律检索器共返回 {len(docs)} 个文档")
        
        # 确保每个文档都有正确的元数据标记
        for doc in docs:
            # 添加法律检索器标记
            doc.metadata["retriever_type"] = "legal"
            # 确保每个文档都有分数
            if "score" not in doc.metadata:
                doc.metadata["score"] = 0.9  # 法律检索器默认给予较高得分
        
        return docs