from django.conf import settings
import os
import re
import hashlib
import pandas as pd
import json
import uuid
import asyncio
import threading
import time
from langchain_community.document_loaders import (
    PyPDFLoader,
    Docx2txtLoader,
    TextLoader,
    UnstructuredMarkdownLoader,
    CSVLoader,
    EverNoteLoader,
    UnstructuredEmailLoader,
    UnstructuredEPubLoader,
    UnstructuredHTMLLoader,
    UnstructuredODTLoader,
    UnstructuredPowerPointLoader,
)
from langchain_community.vectorstores import FAISS
from langchain.text_splitter import RecursiveCharacterTextSplitter
from core.utils import read_json_file, save_json_file, print_colorful, Fore
from core.rag.embedding import get_embeddings
from core.rag.text_splitters import ChineseRecursiveTextSplitter, split_by_chapter_section_article
from langchain_core.document_loaders.base import BaseLoader
from langchain_core.documents import Document

class EnhancedTextLoader(BaseLoader):
    """能够处理多种编码的文本加载器"""
    
    def __init__(self, file_path):
        """初始化加载器，无需指定编码"""
        self.file_path = file_path
        self.encodings = ['utf-8', 'gb18030', 'gbk', 'gb2312', 'latin-1']
    
    def load(self):
        """尝试使用多种编码加载文件"""
        for encoding in self.encodings:
            try:
                with open(self.file_path, 'r', encoding=encoding) as f:
                    text = f.read()
                
                metadata = {"source": self.file_path}
                return [Document(page_content=text, metadata=metadata)]
            except UnicodeDecodeError:
                continue
            except Exception as e:
                print_colorful(f"加载文件时出错 ({encoding}): {str(e)}", text_color=Fore.RED)
        
        # 如果所有编码都失败，尝试二进制模式读取
        try:
            with open(self.file_path, 'rb') as f:
                text = f.read().decode('utf-8', errors='replace')  # 使用replace模式处理无法识别的字符
            
            metadata = {"source": self.file_path}
            return [Document(page_content=text, metadata=metadata)]
        except Exception as e:
            print_colorful(f"二进制模式加载文件失败: {str(e)}", text_color=Fore.RED)
            raise RuntimeError(f"无法加载文件 {self.file_path}")

# 定义加载器映射
LOADER_MAPPING = {
    '.pdf': PyPDFLoader,
    '.docx': Docx2txtLoader,
    '.doc': Docx2txtLoader,
    '.txt': EnhancedTextLoader,  # 使用我们自定义的增强型加载器
    '.md': UnstructuredMarkdownLoader,
    '.csv': CSVLoader,
    '.enex': EverNoteLoader,
    '.eml': UnstructuredEmailLoader,
    '.epub': UnstructuredEPubLoader,
    '.html': UnstructuredHTMLLoader,
    '.odt': UnstructuredODTLoader,
    '.ppt': UnstructuredPowerPointLoader,
    '.pptx': UnstructuredPowerPointLoader,
}

# 正在处理的任务
processing_tasks = {}

def get_file_loader(file_path):
    """根据文件扩展名获取适当的加载器"""
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext in LOADER_MAPPING:
        return LOADER_MAPPING[ext]
    
    raise ValueError(f"不支持的文件类型: {ext}")

def precise_token_count(text: str, model: str = "text-embedding-ada-002") -> int:
    """
    使用 tiktoken 库计算文本的精确 token 数。
    """
    try:
        import tiktoken
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except ImportError:
        # 如果没有tiktoken库，使用简单估算方法
        return len(text.split())

def is_law_document(text: str) -> bool:
    """判断是否是法律文档"""
    return bool(re.search(r"第[一二三四五六七八九十百千万]+条", text))

def recursive_split_document(doc, max_tokens=8192, overlap=5, parent_id=None, chunk_index=0, total_chunks=None):
    """
    递归分割超过token限制的文档
    
    参数:
      doc: 要分割的Document对象
      max_tokens: 最大token数，默认为8192
      overlap: 重叠token数
      parent_id: 父文档的ID（用于子文档关联）
      chunk_index: 当前块的索引
      total_chunks: 总块数（若已知）
    
    返回:
      分割后的Document对象列表
    """
    from langchain_core.documents import Document
    import hashlib
    
    # 估算token数量
    chinese_chars = sum(1 for c in doc.page_content if '\u4e00' <= c <= '\u9fff')
    total_chars = len(doc.page_content)
    english_chars = total_chars - chinese_chars
    tokens = chinese_chars + english_chars / 4
    token_count = int(tokens)
    
    # 如果内容已经小于限制，直接返回
    if token_count <= max_tokens:
        # 如果是子文档，添加父文档ID和索引信息
        if parent_id:
            doc.metadata["parent_id"] = parent_id
            doc.metadata["chunk_index"] = chunk_index
            doc.metadata["total_chunks"] = total_chunks or 1
            doc.metadata["is_split"] = True
        else:
            doc.metadata["is_split"] = False
        return [doc]
    
    # 生成唯一的父ID（如果没有提供）
    if not parent_id:
        parent_id = hashlib.md5(doc.page_content.encode("utf-8")).hexdigest()
    
    # 分割策略：先按句号，然后按逗号，最后按空格
    splits = []
    
    # 按句号分割
    text = doc.page_content
    sentences = re.split(r'([。！？!?.])', text)
    sentence_chunks = []
    for i in range(0, len(sentences), 2):
        if i + 1 < len(sentences):
            sentence_chunks.append(sentences[i] + sentences[i+1])
        else:
            sentence_chunks.append(sentences[i])
    
    # 如果句子级分割仍有超大块，按逗号分割
    final_chunks = []
    for chunk in sentence_chunks:
        chinese_chars = sum(1 for c in chunk if '\u4e00' <= c <= '\u9fff')
        total_chars = len(chunk)
        english_chars = total_chars - chinese_chars
        tokens = chinese_chars + english_chars / 4
        chunk_tokens = int(tokens)
        
        if chunk_tokens <= max_tokens:
            final_chunks.append(chunk)
        else:
            # 按逗号分割大句子
            subclauses = re.split(r'([，,;；])', chunk)
            for j in range(0, len(subclauses), 2):
                if j + 1 < len(subclauses):
                    final_chunks.append(subclauses[j] + subclauses[j+1])
                else:
                    final_chunks.append(subclauses[j])
    
    # 合并过小的块并确保不超过限制
    merged_chunks = []
    current_chunk = ""
    for chunk in final_chunks:
        if not current_chunk:
            current_chunk = chunk
            continue
            
        # 尝试合并
        combined = current_chunk + chunk
        chinese_chars = sum(1 for c in combined if '\u4e00' <= c <= '\u9fff')
        total_chars = len(combined)
        english_chars = total_chars - chinese_chars
        tokens = chinese_chars + english_chars / 4
        combined_tokens = int(tokens)
        
        if combined_tokens <= max_tokens:
            current_chunk = combined
        else:
            merged_chunks.append(current_chunk)
            current_chunk = chunk
    
    # 添加最后一个块
    if current_chunk:
        merged_chunks.append(current_chunk)
    
    # 创建最终的文档对象
    total_chunks_count = len(merged_chunks)
    split_docs = []
    
    for idx, chunk_text in enumerate(merged_chunks):
        # 创建子文档
        new_meta = doc.metadata.copy()
        new_meta["parent_id"] = parent_id
        new_meta["chunk_index"] = idx
        new_meta["total_chunks"] = total_chunks_count
        new_meta["is_split"] = True
        
        # 添加章节和条款信息（如果存在）
        if "chapter_num" in doc.metadata:
            new_meta["chapter_num"] = doc.metadata["chapter_num"]
        if "article_num" in doc.metadata:
            new_meta["article_num"] = doc.metadata["article_num"]
        if "section_num" in doc.metadata:
            new_meta["section_num"] = doc.metadata["section_num"]
        
        split_docs.append(Document(page_content=chunk_text, metadata=new_meta))
    
    # 检查是否存在需要进一步分割的块
    final_docs = []
    for doc in split_docs:
        chinese_chars = sum(1 for c in doc.page_content if '\u4e00' <= c <= '\u9fff')
        total_chars = len(doc.page_content)
        english_chars = total_chars - chinese_chars
        tokens = chinese_chars + english_chars / 4
        doc_tokens = int(tokens)
        
        if doc_tokens > max_tokens:
            # 需要进一步分割
            subdocs = recursive_split_document(
                doc, 
                max_tokens, 
                overlap, 
                parent_id=parent_id, 
                chunk_index=doc.metadata["chunk_index"],
                total_chunks=total_chunks_count
            )
            final_docs.extend(subdocs)
        else:
            final_docs.append(doc)
    
    return final_docs

def sliding_window_split(doc, limit: int = 8192, overlap: int = 0, model: str = "text-embedding-ada-002"):
    """
    对一个文档块使用滑动窗口拆分：
      - 每个子块最多 limit 个 token，
      - 每个子块与前一个子块有 overlap 个 token 的重叠，
      - 并在 metadata 中保留 parent_article_id、chunk_index、total_chunks 等信息。
    """
    from langchain_core.documents import Document
    import hashlib
    from math import ceil
    try:
        import tiktoken
        encoding = tiktoken.encoding_for_model(model)
        tokens = encoding.encode(doc.page_content)
        total_tokens = len(tokens)
        if total_tokens <= limit:
            doc.metadata["is_split"] = False
            return [doc]
        step = limit - overlap
        num_chunks = ceil((total_tokens - overlap) / step)
        parent_article_id = hashlib.md5(doc.page_content.encode("utf-8")).hexdigest()
        chunks = []
        for idx, start in enumerate(range(0, total_tokens, step)):
            chunk_tokens = tokens[start: start + limit]
            chunk_text = encoding.decode(chunk_tokens)
            new_meta = doc.metadata.copy()
            new_meta["is_split"] = True
            new_meta["parent_id"] = parent_article_id
            new_meta["chunk_index"] = idx
            new_meta["total_chunks"] = num_chunks
            chunks.append(Document(page_content=chunk_text, metadata=new_meta))
        return chunks
    except ImportError:
        # 如果没有tiktoken库，使用简单文本拆分
        words = doc.page_content.split()
        total_words = len(words)
        if total_words <= limit:
            doc.metadata["is_split"] = False
            return [doc]
        step = limit - overlap
        num_chunks = ceil((total_words - overlap) / step)
        parent_article_id = hashlib.md5(doc.page_content.encode("utf-8")).hexdigest()
        chunks = []
        for idx, start in enumerate(range(0, total_words, step)):
            chunk_words = words[start: start + limit]
            chunk_text = " ".join(chunk_words)
            new_meta = doc.metadata.copy()
            new_meta["is_split"] = True
            new_meta["parent_id"] = parent_article_id
            new_meta["chunk_index"] = idx
            new_meta["total_chunks"] = num_chunks
            chunks.append(Document(page_content=chunk_text, metadata=new_meta))
        return chunks

def ensure_chunk_limit(doc, limit: int = 8192, model: str = "text-embedding-ada-002", overlap: int = 0):
    """
    如果文档块的 token 数超过 limit，则采用滑动窗口拆分规则，
    保留前一块的最后 overlap 个 token，使得下一个块以这 overlap 个 token 开始。
    如果文档块 token 数不超过 limit，则直接返回原块。
    """
    current_count = precise_token_count(doc.page_content, model)
    if current_count <= limit:
        doc.metadata["is_split"] = False
        return [doc]
    else:
        # 使用递归分块代替滑动窗口
        return recursive_split_document(doc, limit, overlap)

def build_law_structure(law_docs, law_title, source):
    """构建法律结构数据"""
    structure = {
        "law_name": law_title,
        "source": source,
        "chapters": {},
        "articles": {}
    }
    for doc in law_docs:
        meta = doc.metadata
        chapter_num = meta.get("chapter_num")
        article_num = meta.get("article_num")
        if chapter_num and article_num:
            ch_str = str(chapter_num)
            art_str = str(article_num)
            structure["articles"][art_str] = {
                "chapter_num": chapter_num,
                "content": doc.page_content
            }
            if ch_str not in structure["chapters"]:
                structure["chapters"][ch_str] = {
                    "full_title": meta.get("chapter_title", f"第{ch_str}章"),
                    "articles": []
                }
            if article_num not in structure["chapters"][ch_str]["articles"]:
                structure["chapters"][ch_str]["articles"].append(article_num)
    for ch in structure["chapters"]:
        structure["chapters"][ch]["articles"].sort()
    return structure

def process_tabular_file(file_path, merge_rows=2):
   """处理表格文件(CSV, Excel)"""
   from langchain_core.documents import Document
   docs = []
   try:
       # 根据文件类型读取数据
       if file_path.endswith('.csv'):
           df = pd.read_csv(file_path)
       else:
           df = pd.read_excel(file_path)
       
       # 获取列名
       columns = list(df.columns)
       
       # 处理每个合并行块
       for i in range(0, len(df), merge_rows):
           chunk = df.iloc[i:i+merge_rows]
           
           # 创建表格内容
           table_content = []
           for _, row in chunk.iterrows():
               row_data = []
               for col in columns:
                   row_data.append(f"{col}: {row[col]}")
               table_content.append(" | ".join(row_data))
           
           # 创建文档
           doc_content = "\n".join(table_content)
           metadata = {
               "source": os.path.basename(file_path),
               "row_start": i,
               "row_end": min(i + merge_rows, len(df)),
               "columns": columns
           }
           
           docs.append(Document(page_content=doc_content, metadata=metadata))
           
   except Exception as e:
       print_colorful(f"处理表格文件失败: {str(e)}", text_color=Fore.RED)
       raise
   
   return docs

def get_hash_of_file(path):
   """获取文件的MD5哈希值"""
   with open(path, "rb") as f:
       readable_hash = hashlib.md5(f.read()).hexdigest()
   return readable_hash

def merge_article_blocks(documents):
    """合并相同条款的文档块"""
    from collections import defaultdict
    grouped = defaultdict(list)
    for doc in documents:
        key = doc.metadata.get("article_num")
        grouped[key].append(doc)
    merged_docs = []
    for key, docs in grouped.items():
        if key is None or len(docs) == 1:
            merged_docs.extend(docs)
        else:
            merged_text = "\n".join(doc.page_content for doc in docs)
            merged_metadata = docs[0].metadata.copy()
            merged_metadata["merged_blocks_count"] = len(docs)
            from langchain_core.documents import Document
            merged_docs.append(Document(page_content=merged_text, metadata=merged_metadata))
    return merged_docs

def update_progress(task_id, kb_name, status, message, progress, total):
    """更新处理进度，并存储在settings中"""
    if task_id is None:
        return
        
    group_name = f'kb_{kb_name}_{task_id}'
    
    # 修复进度和总数为0的情况
    if total <= 0:
        total = 1
    if progress < 0:
        progress = 0
    
    # 确保进度不超过总数
    if progress > total:
        # print(f"警告：进度值 {progress} 超过了总数 {total}，将被截断")
        progress = total
    
    # 如果是完成状态，确保进度值等于总数
    if status == 'completed':
        progress = total
    
    data = {
        'status': status,
        'message': message,
        'progress': progress,
        'total': total,
        'task_id': task_id,
        'timestamp': time.time()
    }
    
    # 存储任务状态
    settings.PROCESSING_TASKS[group_name] = data
    
    # 添加简单的日志输出
    # print(f"更新任务状态: {group_name} = {status}, {progress}/{total}, {message}")

def check_task_cancelled(task_id, kb_name):
    """检查任务是否被取消"""
    if task_id is None:
        return False
        
    group_name = f'kb_{kb_name}_{task_id}'
    task_status = settings.PROCESSING_TASKS.get(group_name, {})
    return task_status.get('status') == 'cancelled'

def process_documents(knowledge_base, force_create=False, progress_callback=None, task_id=None):
    """处理知识库文档"""
    # 生成任务ID (如果未提供)
    if task_id is None:
        task_id = str(uuid.uuid4())
    
    kb_name = str(knowledge_base.id)
    user_id = knowledge_base.user.id  # 获取用户ID
    group_name = f'kb_{kb_name}_{task_id}'
    
    # 初始化任务状态
    settings.PROCESSING_TASKS[group_name] = {
        'status': 'initializing',
        'message': '正在初始化...',
        'progress': 0,
        'total': 0,
        'task_id': task_id
    }
    
    # 发送初始状态
    update_progress(task_id, kb_name, 'initializing', '正在初始化...', 0, 0)
    
    # 获取配置
    rag_configs = getattr(settings, 'RAG_CONFIGS', {})
    db_docs_path = os.path.join(settings.MEDIA_ROOT, 'documents')
    hash_file_path = os.path.join(db_docs_path, 'hash_file.json')
    db_vector_path = os.path.join(settings.MEDIA_ROOT, 'faiss_index')
    
    # 创建目录
    os.makedirs(db_docs_path, exist_ok=True)
    os.makedirs(db_vector_path, exist_ok=True)
    
    # 读取哈希数据
    hash_data = read_json_file(hash_file_path)
    
    # 生成包含用户ID的键名，确保不同用户的知识库不会相互干扰
    user_kb_key = f"user_{user_id}_{knowledge_base.name}"
    kb_hash_list = hash_data.get(user_kb_key, [])
    
    # 获取文档列表
    documents = knowledge_base.documents.filter(processed=False) if not force_create else knowledge_base.documents.all()
    file_paths = [doc.file.path for doc in documents]
    
    # 过滤已处理文件（除非强制重新创建）
    if not force_create:
        filtered_file_paths = []
        for file_path in file_paths:
            file_hash = get_hash_of_file(file_path)
            if file_hash not in kb_hash_list:
                filtered_file_paths.append(file_path)
                kb_hash_list.append(file_hash)
        file_paths = filtered_file_paths
    else:
        # 强制重新创建时更新所有文件哈希
        kb_hash_list = [get_hash_of_file(file_path) for file_path in file_paths]
    
    # 更新哈希数据 - 使用含用户ID的键名
    hash_data[user_kb_key] = list(set(kb_hash_list))
    save_json_file(hash_data, hash_file_path)
    
    # 更新任务状态
    update_progress(task_id, kb_name, 'processing', '正在分析文档...', 0, len(file_paths))
    
    # 处理文档
    all_docs = []
    failed_docs = {}
    
    # 创建文本分割器
    chinese_splitter = ChineseRecursiveTextSplitter(
        keep_separator=True,
        is_separator_regex=True,
        chunk_size=knowledge_base.chunk_size,
        chunk_overlap=knowledge_base.chunk_overlap,
    )
    
    # 配置嵌入模型
    embedding_config = rag_configs.get('embedding', {}).copy()
    
    # 根据知识库的嵌入类型修改嵌入配置
    if knowledge_base.embedding_type == 'local':
        print(f"使用本地嵌入模型处理知识库文档...")
        embedding_config['provider'] = 'local_ollama'
        embedding_config['model_name'] = embedding_config.get('local_model', 'bge-m3')
        embedding_config['base_url'] = 'http://localhost:11434/api'
        max_token_limit = 8192  # 本地模型支持8192 tokens
    else:
        print(f"使用远程嵌入模型处理知识库文档...")
        # 确保使用远程配置
        embedding_config['provider'] = 'siliconflow'
        if 'local_model' in embedding_config:
            del embedding_config['local_model']
        max_token_limit = 8192  # 远程模型也支持8192 tokens
    
    # 逐个加载和分割文档
    total_files = len(file_paths)
    total_chunks = 0
    processed_chunks = 0

    # 第一次扫描获取总块数
    for idx, file_path in enumerate(file_paths):
        # 检查是否被取消
        if check_task_cancelled(task_id, kb_name):
            return {'task_cancelled': True}

        try:
            # 获取加载器
            loader_class = get_file_loader(file_path)
            
            # 特殊处理CSV文件
            if file_path.lower().endswith(('.csv', '.xlsx', '.xls')):
                # 估计每个文件生成5个块用于进度显示
                total_chunks += 5
            else:
                # 加载文档
                loader = loader_class(file_path)
                raw_docs = loader.load()
                
                # 检查是否是法律文档
                content = "".join([d.page_content for d in raw_docs]).strip()
                if is_law_document(content):
                    # 法律文档估计生成更多块
                    total_chunks += 15
                else:
                    # 普通文档估计生成的块数
                    total_chunks += 10
        except Exception as e:
            total_chunks += 1  # 即使文件加载失败也计入总数
            print_colorful(f"估计总块数时出错: {str(e)}", text_color=Fore.RED)

    # 更新总块数
    update_progress(task_id, kb_name, 'processing', '开始处理文档...', 0, total_chunks)
    
    # 逐个处理文档
    for idx, file_path in enumerate(file_paths):
        # 检查是否被取消
        if check_task_cancelled(task_id, kb_name):
            return {'task_cancelled': True}
            
        try:
            print_colorful(f"处理文件: {os.path.basename(file_path)}", text_color=Fore.CYAN)
            update_progress(task_id, kb_name, 'processing', f'处理文件: {os.path.basename(file_path)}', processed_chunks, total_chunks)
            
            # 获取加载器
            loader_class = get_file_loader(file_path)
            
            # 特殊处理CSV文件
            if file_path.lower().endswith(('.csv', '.xlsx', '.xls')):
                docs = process_tabular_file(file_path, knowledge_base.merge_rows)
                
                # 更新进度
                processed_chunks += len(docs)
                update_progress(task_id, kb_name, 'processing', f'处理表格文件: {os.path.basename(file_path)}', processed_chunks, total_chunks)
            else:
                # 加载文档
                loader = loader_class(file_path)
                raw_docs = loader.load()
                
                # 检查是否是法律文档
                content = "".join([d.page_content for d in raw_docs]).strip()
                if is_law_document(content):
                    # 法律文档特殊处理
                    print_colorful(f"检测到法律文档: {os.path.basename(file_path)}", text_color=Fore.GREEN)
                    update_progress(task_id, kb_name, 'processing', f'检测到法律文档: {os.path.basename(file_path)}', processed_chunks, total_chunks)
                    
                    # 提取法律名称
                    law_title_match = re.search(r'^([\u4e00-\u9fa5《》、]{4,}法)', content)
                    law_title = law_title_match.group(1) if law_title_match else "未知法律"
                    
                    # 使用法律专用分割器
                    law_docs = split_by_chapter_section_article(
                        content, 
                        source=os.path.basename(file_path),
                        include_overview=True
                    )
                    
                    # 更新进度
                    chunk_step = len(law_docs) / 10  # 每10%更新一次
                    chunk_threshold = chunk_step
                    
                    # 构建法律结构
                    if law_docs:
                        law_structure = build_law_structure(
                            law_docs, 
                            law_title, 
                            os.path.basename(file_path)
                        )
                        
                        # 保存法律结构
                        law_structure_dir = os.path.join(db_vector_path, "law_structure")
                        os.makedirs(law_structure_dir, exist_ok=True)
                        law_structure_path = os.path.join(law_structure_dir, f"{law_title}.json")
                        with open(law_structure_path, "w", encoding="utf-8") as f:
                            json.dump(law_structure, f, ensure_ascii=False, indent=2)
                        
                        # 处理条文块，按照旧文档中的分块规则处理
                        refined_docs = []
                        for i, doc in enumerate(law_docs):
                            # 检查是否被取消
                            if check_task_cancelled(task_id, kb_name):
                                return {'task_cancelled': True}
                                
                            # 确保每个文档块都有law_name字段
                            if "law_name" not in doc.metadata:
                                doc.metadata["law_name"] = law_title
                            
                            # 对于条文块，直接保留完整内容（确保检索返回完整条文）
                            if doc.metadata.get("content_type") == "article_content":
                                # 只有超过token限制才需要分割
                                tokens = precise_token_count(doc.page_content)
                                if tokens > max_token_limit:
                                    print_colorful(
                                        f"文件 {os.path.basename(file_path)} 条文块 token 数 {tokens} 超过{max_token_limit}，进行递归分块",
                                        text_color=Fore.YELLOW
                                    )
                                    split_chunks = recursive_split_document(doc, max_token_limit, overlap=10)
                                    refined_docs.extend(split_chunks)
                                else:
                                    refined_docs.append(doc)
                            else:
                                # 对于非条文块，检查是否需要进一步分割
                                tokens = precise_token_count(doc.page_content)
                                if tokens > max_token_limit:
                                    print_colorful(
                                        f"文件 {os.path.basename(file_path)} 非条文块 token 数 {tokens} 超过{max_token_limit}，进行递归分块",
                                        text_color=Fore.YELLOW
                                    )
                                    split_chunks = recursive_split_document(doc, max_token_limit, overlap=10)
                                    refined_docs.extend(split_chunks)
                                else:
                                    refined_docs.append(doc)
                            
                            # 更新进度
                            if i >= chunk_threshold:
                                processed_chunks += 1
                                chunk_threshold += chunk_step
                                update_progress(task_id, kb_name, 'processing', 
                                               f'处理法律文档: {os.path.basename(file_path)}', 
                                               processed_chunks, total_chunks)
                        
                        # 合并相同条款的文档块
                        docs = merge_article_blocks(refined_docs)
                        print_colorful(
                            f"文件 {os.path.basename(file_path)} 使用法律分块方式处理，共生成 {len(docs)} 个块",
                            text_color=Fore.GREEN
                        )
                    else:
                        # 法律分块失败，使用普通分块方式
                        print_colorful(f"文件 {os.path.basename(file_path)} 法律分块失败，使用普通分块", text_color=Fore.YELLOW)
                        update_progress(task_id, kb_name, 'processing', f'法律分块失败，使用普通分块: {os.path.basename(file_path)}', processed_chunks, total_chunks)
                        docs = chinese_splitter.split_documents(raw_docs)
                else:
                    # 非法律文档使用中文递归分割器
                    docs = chinese_splitter.split_documents(raw_docs)
                    
                    # 检查是否有块超过限制
                    final_docs = []
                    chunk_step = len(docs) / 10  # 每10%更新一次
                    chunk_threshold = chunk_step
                    
                    for i, doc in enumerate(docs):
                        # 检查是否被取消
                        if check_task_cancelled(task_id, kb_name):
                            return {'task_cancelled': True}
                            
                        tokens = precise_token_count(doc.page_content)
                        if tokens > max_token_limit:
                            print_colorful(
                                f"文件 {os.path.basename(file_path)} 普通块 token 数 {tokens} 超过{max_token_limit}，进行递归分块",
                                text_color=Fore.YELLOW
                            )
                            split_chunks = recursive_split_document(doc, max_token_limit, overlap=10)
                            final_docs.extend(split_chunks)
                        else:
                            final_docs.append(doc)
                        
                        # 更新进度
                        if i >= chunk_threshold:
                            processed_chunks += 1
                            chunk_threshold += chunk_step
                            update_progress(task_id, kb_name, 'processing', 
                                           f'处理文档: {os.path.basename(file_path)}', 
                                           processed_chunks, total_chunks)
                    
                    docs = final_docs
                    
                    print_colorful(
                        f"文件 {os.path.basename(file_path)} 使用普通切分方式处理，共生成 {len(docs)} 个块",
                        text_color=Fore.GREEN
                    )
            
            # 设置元数据
            for doc in docs:
                doc.metadata["source"] = os.path.basename(file_path)
            
            all_docs.extend(docs)
            print_colorful(f"成功处理 {len(docs)} 个文档块", text_color=Fore.GREEN)
            
            # 更新处理进度
            if progress_callback:
                progress_callback((idx + 1) / total_files)
            
        except Exception as e:
            print_colorful(f"处理文件 {os.path.basename(file_path)} 失败: {str(e)}", text_color=Fore.RED)
            update_progress(task_id, kb_name, 'error', f'处理文件 {os.path.basename(file_path)} 失败: {str(e)}', processed_chunks, total_chunks)
            import traceback
            traceback.print_exc()
            failed_docs[file_path] = str(e)
    
    # 创建或更新向量数据库
    if all_docs:
        try:
            update_progress(task_id, kb_name, 'embedding', '正在创建向量数据库...', processed_chunks, total_chunks)
            
            # 获取嵌入模型
            embeddings = get_embeddings(embedding_config)
            if not embeddings:
                error_msg = "无法初始化嵌入模型"
                update_progress(task_id, kb_name, 'error', error_msg, processed_chunks, total_chunks)
                raise ValueError(error_msg)
            
            # 生成包含用户ID的索引名称
            index_name = f"user_{user_id}_{knowledge_base.name}"
            
            # 检查是否存在现有向量数据库 - 使用新的索引名称
            existing_index = os.path.join(db_vector_path, f"{index_name}.faiss")
            
            # 显示嵌入进度
            total_embeddings = len(all_docs)
            batch_size = 5  # 每批次处理的文档数
            
            if os.path.exists(existing_index) and not force_create:
                # 加载现有数据库并添加新文档 - 使用新的索引名称
                print(f"加载现有向量数据库: {existing_index}")
                update_progress(task_id, kb_name, 'embedding', '加载现有向量数据库...', processed_chunks, total_chunks)
                
                vectorstore = FAISS.load_local(
                    folder_path=db_vector_path,
                    embeddings=embeddings,
                    index_name=index_name,
                    allow_dangerous_deserialization=True
                )
                
                # 分批处理嵌入以更新进度
                for i in range(0, total_embeddings, batch_size):
                    # 检查是否被取消
                    if check_task_cancelled(task_id, kb_name):
                        return {'task_cancelled': True}
                        
                    batch = all_docs[i:i+batch_size]
                    batch_size_actual = len(batch)
                    
                    # 计算当前进度，确保不超过总数
                    current_progress = min(processed_chunks + i, total_chunks)
                    
                    update_progress(task_id, kb_name, 'embedding', 
                                    f'正在生成向量 ({i+1}-{min(i+batch_size_actual, total_embeddings)}/{total_embeddings})...', 
                                    current_progress, total_chunks)
                    
                    # 创建批次向量
                    batch_vectorstore = FAISS.from_documents(batch, embeddings)
                    
                    # 合并到主向量存储
                    vectorstore.merge_from(batch_vectorstore)
                
                # 保存更新后的向量数据库 - 使用新的索引名称
                vectorstore.save_local(db_vector_path, index_name)
                
                print_colorful(f"成功将 {len(all_docs)} 个新文档添加到向量数据库", text_color=Fore.GREEN)
                update_progress(task_id, kb_name, 'completed', f'完成! 成功处理 {len(all_docs)} 个文档块', total_chunks, total_chunks)
            else:
                # 创建新的向量数据库 - 使用新的索引名称
                print(f"创建包含 {len(all_docs)} 个文档的新向量数据库...")
                update_progress(task_id, kb_name, 'embedding', f'创建包含 {len(all_docs)} 个文档的新向量数据库...', processed_chunks, total_chunks)
                
                # 分批处理嵌入以更新进度
                batch_vectors = []
                
                for i in range(0, total_embeddings, batch_size):
                    # 检查是否被取消
                    if check_task_cancelled(task_id, kb_name):
                        return {'task_cancelled': True}
                        
                    batch = all_docs[i:i+batch_size]
                    batch_size_actual = len(batch)
                    
                    update_progress(task_id, kb_name, 'embedding', 
                                   f'正在生成向量 ({i+1}-{min(i+batch_size_actual, total_embeddings)}/{total_embeddings})...', 
                                   processed_chunks + i, total_chunks)
                    
                    # 创建批次向量
                    batch_vectorstore = FAISS.from_documents(batch, embeddings)
                    batch_vectors.append(batch_vectorstore)
                
                # 合并所有批次向量
                if batch_vectors:
                    vectorstore = batch_vectors[0]
                    for vs in batch_vectors[1:]:
                        vectorstore.merge_from(vs)
                    
                    # 保存向量数据库 - 使用新的索引名称
                    vectorstore.save_local(db_vector_path, index_name)
                
                print_colorful(f"成功创建包含 {len(all_docs)} 个文档的新向量数据库", text_color=Fore.GREEN)
                update_progress(task_id, kb_name, 'completed', f'完成! 成功处理 {len(all_docs)} 个文档块', total_chunks, total_chunks)
            
            # 更新文档处理状态
            for doc in documents:
                doc.processed = True
                doc.save()
                
            # 发送最终完成消息
            if task_id:
                time.sleep(1)  # 等待1秒确保之前的消息已经发送
                
                # 再次发送完成消息以确保前端更新
                final_message = f'完成! 成功处理 {len(all_docs) if all_docs else 0} 个文档块'
                update_progress(task_id, kb_name, 'completed', final_message, 
                              total_chunks, total_chunks)
                
        except Exception as e:
            print_colorful(f"创建向量数据库失败: {str(e)}", text_color=Fore.RED)
            update_progress(task_id, kb_name, 'error', f'创建向量数据库失败: {str(e)}', processed_chunks, total_chunks)
            import traceback
            traceback.print_exc()
            for file_path in file_paths:
                if file_path not in failed_docs:
                    failed_docs[file_path] = f"向量数据库创建失败: {str(e)}"
    else:
        update_progress(task_id, kb_name, 'completed', '没有需要处理的新文档', total_chunks, total_chunks)
        
        # 发送最终完成消息
        if task_id:
            time.sleep(1)  # 等待1秒确保之前的消息已经发送
            
            # 再次发送完成消息以确保前端更新
            update_progress(task_id, kb_name, 'completed', '没有需要处理的新文档', 
                          total_chunks, total_chunks)
    
    return failed_docs