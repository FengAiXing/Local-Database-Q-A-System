# core/rag/embedding.py
from openai import OpenAI
from typing import List
import time
import re
from langchain_core.embeddings import Embeddings
import subprocess
import json
import httpx
import numpy as np

def get_embeddings(embedding_cfg: dict):
    """获取嵌入模型"""
    provider = embedding_cfg.get('provider', '')
    model_name = embedding_cfg.get('model_name', '')
    
    print(f"初始化嵌入模型: {model_name}")
    
    if not provider or not model_name:
        print("错误: 嵌入配置缺少provider或model_name")
        return None
    
    try:
        if provider == 'local_ollama':
            # print(f"使用本地Ollama API进行嵌入")
            embeddings = OllamaEmbedding(
                model_name=model_name,
                base_url=embedding_cfg.get('base_url', 'http://localhost:11434/api'),
            )
            
            # 测试嵌入功能
            try:
                test_result = embeddings.embed_query("测试嵌入功能")
                print(f"嵌入测试成功，向量维度: {len(test_result)}")
            except Exception as e:
                print(f"本地嵌入测试失败: {e}")
            
            return embeddings
        elif provider in ['openai', 'siliconflow', 'ollama']:
            print(f"使用 {provider} API 进行嵌入")
            embeddings = OpenAIEmbedding(
                model_name=model_name,
                api_key=embedding_cfg.get('api_key', ''),
                base_url=embedding_cfg.get('base_url', ''),
                provider=provider
            )
            
            # 测试嵌入功能
            try:
                test_result = embeddings.embed_query("测试嵌入功能")
                print(f"嵌入测试成功，向量维度: {len(test_result)}")
            except Exception as e:
                print(f"嵌入测试失败: {e}")
            
            return embeddings
    except Exception as e:
        print(f"初始化嵌入模型失败: {e}")
        import traceback
        traceback.print_exc()
    
    return None

class OllamaEmbedding(Embeddings):
    """本地Ollama API嵌入模型"""
    def __init__(self, model_name: str, base_url: str = "http://localhost:11434/api"):
        self.model_name = model_name
        self.base_url = base_url
        self.client = httpx.Client(timeout=120.0)  # 设置较长的超时时间
        self.max_token_limit = 8192  # 本地模型通常可以处理更长的文本
        self.request_count = 0
    
    def clear_text(self, text: str) -> str:
        """清理文本，移除不必要的内容"""
        return text.strip()
    
    def _get_chunk_size(self, text: str) -> int:
        """估算文本的token数量"""
        # 粗略估算：中文约1字符=1token，英文约4字符=1token
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        total_chars = len(text)
        english_chars = total_chars - chinese_chars
        
        # 估算token数量
        tokens = chinese_chars + english_chars / 4
        return int(tokens)
    
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """嵌入多个文档"""
        embeddings = []
        for i, text in enumerate(texts):
            try:
                # 检查文本长度
                token_estimate = self._get_chunk_size(text)
                if token_estimate > self.max_token_limit:
                    print(f"警告: 文本可能超过token限制 (估计: {token_estimate}), 可能导致截断")
                
                # 调用Ollama API
                response = self.client.post(
                    f"{self.base_url}/embeddings",
                    json={"model": self.model_name, "prompt": self.clear_text(text)}
                )
                
                # 只记录第一次HTTP请求
                if i == 0:
                    print(f'HTTP Request: POST {self.base_url}/embeddings "{response.status_code} {response.reason_phrase}"')
                
                response.raise_for_status()
                result = response.json()
                
                if "embedding" in result:
                    embeddings.append(result["embedding"])
                else:
                    raise ValueError(f"API返回中没有找到embedding字段: {result}")
                
            except Exception as e:
                print(f"嵌入文档时出错: {e}")
                import traceback
                traceback.print_exc()
                # 出错时返回零向量（避免整个过程失败）
                if embeddings and len(embeddings) > 0:
                    # 使用第一个向量的维度作为零向量的维度
                    embeddings.append([0.0] * len(embeddings[0]))
                else:
                    # 如果还没有成功的向量，使用默认维度（如768或1024）
                    embeddings.append([0.0] * 1024)
        
        return embeddings
    
    def embed_query(self, text: str) -> List[float]:
        """嵌入单个查询"""
        try:
            # 调用Ollama API
            response = self.client.post(
                f"{self.base_url}/embeddings",
                json={"model": self.model_name, "prompt": self.clear_text(text)}
            )
            
            # 记录HTTP请求
            # print(f'HTTP Request: POST {self.base_url}/embeddings "{response.status_code} {response.reason_phrase}"')
            
            response.raise_for_status()
            result = response.json()
            
            if "embedding" in result:
                return result["embedding"]
            else:
                raise ValueError(f"API返回中没有找到embedding字段: {result}")
                
        except Exception as e:
            print(f"嵌入查询时出错: {e}")
            import traceback
            traceback.print_exc()
            # 出错时返回零向量
            return [0.0] * 1024  # 使用默认维度


class OpenAIEmbedding(Embeddings):
    """OpenAI API嵌入模型"""
    def __init__(self, model_name: str, api_key: str, base_url: str, provider: str = 'openai') -> None:
        self.model_name = model_name
        self.provider = provider
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        
        # 根据模型名称设置不同的参数
        if 'bge-m3' in model_name.lower():
            # BGE-M3模型支持8192 tokens
            self.max_token_limit = 8192
            self.max_batch_size = 16   # 保守的批处理大小
        else:
            # 其他模型的默认参数
            self.max_token_limit = 450  # 降低到450以确保安全
            self.max_batch_size = 16    # 降低到16，低于API限制的32
        
        self.request_count = 0
    
    def clear_text(self, text: str) -> str:
        """清理文本，移除不必要的内容"""
        return text.strip()
    
    def _get_chunk_size(self, text: str) -> int:
        """估算文本的token数量"""
        # 粗略估算：中文约1字符=1token，英文约4字符=1token
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        total_chars = len(text)
        english_chars = total_chars - chinese_chars
        
        # 估算token数量
        tokens = chinese_chars + english_chars / 4
        return int(tokens)
    
    def _split_text_by_token_limit(self, text: str, max_tokens: int = 8192) -> List[str]:
        """按token限制分割文本"""
        if self._get_chunk_size(text) <= max_tokens:
            return [text]
            
        # 按标点符号分割
        parts = []
        current_part = ""
        
        # 先按句号分割
        sentences = re.split(r'([。！？!?.])', text)
        for i in range(0, len(sentences), 2):
            sentence = sentences[i]
            punctuation = sentences[i+1] if i+1 < len(sentences) else ""
            current_sentence = sentence + punctuation
            
            if self._get_chunk_size(current_part + current_sentence) <= max_tokens:
                current_part += current_sentence
            else:
                if current_part:
                    parts.append(current_part)
                current_part = current_sentence
        
        if current_part:
            parts.append(current_part)
            
        # 如果某个部分仍然超过限制，继续分割
        result = []
        for part in parts:
            if self._get_chunk_size(part) <= max_tokens:
                result.append(part)
            else:
                # 按逗号分割
                subparts = []
                current_subpart = ""
                subsentences = re.split(r'([，,;；])', part)
                for i in range(0, len(subsentences), 2):
                    subsentence = subsentences[i]
                    subpunctuation = subsentences[i+1] if i+1 < len(subsentences) else ""
                    current_subsentence = subsentence + subpunctuation
                    
                    if self._get_chunk_size(current_subpart + current_subsentence) <= max_tokens:
                        current_subpart += current_subsentence
                    else:
                        if current_subpart:
                            subparts.append(current_subpart)
                        current_subpart = current_subsentence
                
                if current_subpart:
                    subparts.append(current_subpart)
                
                result.extend(subparts)
        
        # 最后检查，确保所有部分都不超过限制
        final_result = []
        for part in result:
            if self._get_chunk_size(part) <= max_tokens:
                final_result.append(part)
            else:
                # 简单地按字符数量截断
                chars_per_token = len(part) / self._get_chunk_size(part)
                max_chars = int(max_tokens * chars_per_token * 0.9)  # 留10%的余量
                
                for i in range(0, len(part), max_chars):
                    final_result.append(part[i:i+max_chars])
        
        return final_result

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """嵌入多个文档"""
        import numpy as np
        
        # 记录当前HTTP请求
        http_request_shown = False
        
        # 首先处理所有文本，确保它们都在token限制内
        processed_texts = []
        for text in texts:
            if self._get_chunk_size(text) > self.max_token_limit:
                # 如果文本超过token限制，分割它
                chunks = self._split_text_by_token_limit(self.clear_text(text), self.max_token_limit)
                processed_texts.extend(chunks)
            else:
                processed_texts.append(self.clear_text(text))
        
        # 再次检查每个块的大小
        final_processed_texts = []
        for text in processed_texts:
            if self._get_chunk_size(text) > self.max_token_limit:
                # 如果还是超过，使用更保守的分割
                smaller_chunks = self._split_text_by_token_limit(text, int(self.max_token_limit * 0.8))
                final_processed_texts.extend(smaller_chunks)
            else:
                final_processed_texts.append(text)
        
        # 准备批次，确保每个批次大小不超过最大批处理大小
        batches = []
        for i in range(0, len(final_processed_texts), self.max_batch_size):
            batches.append(final_processed_texts[i:i + self.max_batch_size])
        
        all_embeddings = []
        
        # 处理每个批次
        for batch_idx, batch in enumerate(batches):
            max_retry_times = 10
            retry_count = 0
            _sleep_time = 1
            
            while retry_count < max_retry_times:
                try:
                    # 发送请求
                    response = self.client.embeddings.create(
                        input=batch, 
                        model=self.model_name, 
                        encoding_format="float"
                    )
                    
                    # 只记录第一次请求
                    if not http_request_shown:
                        # print(f'HTTP Request: POST {self.client.base_url}/embeddings "HTTP/1.1 200 OK"')
                        http_request_shown = True
                    
                    # 提取嵌入
                    batch_embeddings = [r.embedding for r in response.data]
                    all_embeddings.extend(batch_embeddings)
                    break
                    
                except Exception as e:
                    # 记录错误
                    if "input must have less than 512 tokens" in str(e):
                        # Token限制错误
                        if not http_request_shown:
                            # print(f'HTTP Request: POST {self.client.base_url}/embeddings "HTTP/1.1 413 Request Entity Too Large"')
                            http_request_shown = True
                        
                        print(f"警告：输入超过{self.max_token_limit}个tokens限制，尝试进一步分割文本")
                        
                        # 进一步减少批次大小和token限制
                        new_max_tokens = int(self.max_token_limit * 0.7)  # 更激进的减少
                        sub_batches = []
                        
                        for text in batch:
                            sub_chunks = self._split_text_by_token_limit(text, new_max_tokens)
                            sub_batches.extend(sub_chunks)
                        
                        # 将大批次分成更小的批次
                        sub_batch_size = max(1, self.max_batch_size // 2)  # 最小批次大小为1
                        mini_batches = []
                        
                        for i in range(0, len(sub_batches), sub_batch_size):
                            mini_batches.append(sub_batches[i:i + sub_batch_size])
                        
                        # 处理每个小批次
                        for mini_batch in mini_batches:
                            try:
                                mini_response = self.client.embeddings.create(
                                    input=mini_batch, 
                                    model=self.model_name, 
                                    encoding_format="float"
                                )
                                mini_embeddings = [r.embedding for r in mini_response.data]
                                all_embeddings.extend(mini_embeddings)
                            except Exception as mini_e:
                                # 如果还有错误，使用零向量
                                print(f"警告：处理小批次时出错：{str(mini_e)}")
                                # 添加零向量
                                if all_embeddings:
                                    dim = len(all_embeddings[0])
                                    for _ in range(len(mini_batch)):
                                        all_embeddings.append([0.0] * dim)
                                else:
                                    # 默认维度
                                    for _ in range(len(mini_batch)):
                                        all_embeddings.append([0.0] * 1024)
                        
                        # 已经处理完这个批次
                        break
                        
                    elif "maximum allowed batch size" in str(e):
                        # 批处理大小错误
                        if not http_request_shown:
                            # print(f'HTTP Request: POST {self.client.base_url}/embeddings "HTTP/1.1 413 Request Entity Too Large"')
                            http_request_shown = True
                        
                        print(f"警告：批处理大小超出限制，尝试减小批次")
                        
                        # 将批次分成两半
                        half_size = len(batch) // 2
                        first_half = batch[:half_size]
                        second_half = batch[half_size:]
                        
                        # 处理第一半
                        try:
                            resp1 = self.client.embeddings.create(
                                input=first_half, 
                                model=self.model_name, 
                                encoding_format="float"
                            )
                            emb1 = [r.embedding for r in resp1.data]
                            all_embeddings.extend(emb1)
                        except Exception as e1:
                            print(f"警告：处理第一半批次时出错：{str(e1)}")
                            # 添加零向量
                            if all_embeddings:
                                dim = len(all_embeddings[0])
                                for _ in range(len(first_half)):
                                    all_embeddings.append([0.0] * dim)
                            else:
                                # 默认维度
                                for _ in range(len(first_half)):
                                    all_embeddings.append([0.0] * 1024)
                        
                        # 处理第二半
                        try:
                            resp2 = self.client.embeddings.create(
                                input=second_half, 
                                model=self.model_name, 
                                encoding_format="float"
                            )
                            emb2 = [r.embedding for r in resp2.data]
                            all_embeddings.extend(emb2)
                        except Exception as e2:
                            print(f"警告：处理第二半批次时出错：{str(e2)}")
                            # 添加零向量
                            if all_embeddings:
                                dim = len(all_embeddings[0])
                                for _ in range(len(second_half)):
                                    all_embeddings.append([0.0] * dim)
                            else:
                                # 默认维度
                                for _ in range(len(second_half)):
                                    all_embeddings.append([0.0] * 1024)
                        
                        # 已经处理完这个批次
                        break
                    
                    else:
                        # 其他错误，重试
                        retry_count += 1
                        _sleep_time *= 1.5
                        print(f"速度限制, 稍后重试[{retry_count}/{max_retry_times}]")
                        time.sleep(_sleep_time)
                        
                        # 如果最后一次重试仍然失败
                        if retry_count == max_retry_times:
                            print(f"错误：达到最大重试次数，使用零向量")
                            # 添加零向量
                            if all_embeddings:
                                dim = len(all_embeddings[0])
                                for _ in range(len(batch)):
                                    all_embeddings.append([0.0] * dim)
                            else:
                                # 默认维度
                                for _ in range(len(batch)):
                                    all_embeddings.append([0.0] * 1024)
        
        # 确保返回的嵌入数量与原始文本数量一致
        if len(all_embeddings) != len(texts):
            # 如果嵌入数量不匹配，需要重新映射
            # 这种情况是因为我们可能分割了某些文本
            original_to_processed = {}
            processed_idx = 0
            
            for i, text in enumerate(texts):
                if self._get_chunk_size(text) > self.max_token_limit:
                    # 对于被分割的文本，记录它对应的所有分割块
                    chunks = self._split_text_by_token_limit(self.clear_text(text), self.max_token_limit)
                    chunk_indices = list(range(processed_idx, processed_idx + len(chunks)))
                    original_to_processed[i] = chunk_indices
                    processed_idx += len(chunks)
                else:
                    # 对于未分割的文本，直接记录
                    original_to_processed[i] = [processed_idx]
                    processed_idx += 1
            
            # 创建最终的嵌入列表
            final_embeddings = []
            
            for i in range(len(texts)):
                if i in original_to_processed:
                    # 获取原始文本对应的所有分割块的索引
                    indices = original_to_processed[i]
                    
                    if len(indices) == 1:
                        # 如果只有一个块，直接使用
                        if indices[0] < len(all_embeddings):
                            final_embeddings.append(all_embeddings[indices[0]])
                        else:
                            # 防止索引越界
                            print(f"警告：索引 {indices[0]} 超出嵌入列表范围 {len(all_embeddings)}")
                            if all_embeddings:
                                final_embeddings.append([0.0] * len(all_embeddings[0]))
                            else:
                                final_embeddings.append([0.0] * 1024)
                    else:
                        # 如果有多个块，取平均值
                        valid_indices = [idx for idx in indices if idx < len(all_embeddings)]
                        
                        if valid_indices:
                            # 计算平均嵌入
                            avg_embedding = np.mean([all_embeddings[idx] for idx in valid_indices], axis=0).tolist()
                            final_embeddings.append(avg_embedding)
                        else:
                            # 没有有效索引
                            print(f"警告：没有有效的嵌入索引")
                            if all_embeddings:
                                final_embeddings.append([0.0] * len(all_embeddings[0]))
                            else:
                                final_embeddings.append([0.0] * 1024)
            
            return final_embeddings
        
        return all_embeddings

    def embed_query(self, text: str) -> List[float]:
        """嵌入单个查询"""
        text = self.clear_text(text)
        
        # 如果文本可能太长，也进行分割
        if self._get_chunk_size(text) > self.max_token_limit:
            chunks = self._split_text_by_token_limit(text, self.max_token_limit)
            if len(chunks) > 1:
                # 多个块，分别嵌入，然后取平均值
                embeddings = []
                for chunk in chunks:
                    try:
                        response = self.client.embeddings.create(
                            input=[chunk], model=self.model_name, encoding_format="float"
                        )
                        embeddings.append(response.data[0].embedding)
                        
                        # 记录HTTP请求
                        # print(f'HTTP Request: POST {self.client.base_url}/embeddings "HTTP/1.1 200 OK"')
                    except Exception as e:
                        print(f"警告：嵌入查询分块时出错: {e}")
                        # 如果已经有一些成功的嵌入，使用零向量填充
                        if embeddings:
                            embeddings.append([0.0] * len(embeddings[0]))
                        else:
                            # 如果没有成功的嵌入，返回默认零向量
                            return [0.0] * 1024
                
                if not embeddings:
                    return [0.0] * 1024
                
                # 计算平均嵌入
                import numpy as np
                combined = np.mean(embeddings, axis=0).tolist()
                return combined
        
        # 一般情况，直接嵌入
        try:
            response = self.client.embeddings.create(
                input=[text], model=self.model_name, encoding_format="float"
            )
            
            # 记录HTTP请求
            # print(f'HTTP Request: POST {self.client.base_url}/embeddings "HTTP/1.1 200 OK"')
            
            return response.data[0].embedding
        except Exception as e:
            print(f"嵌入查询时出错: {e}")
            # 出错时返回零向量
            return [0.0] * 1024  # 使用默认维度