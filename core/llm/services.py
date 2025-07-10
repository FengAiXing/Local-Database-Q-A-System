from django.conf import settings
import requests
import json
from openai import OpenAI
import re

def get_llm_service(model_name):
    """获取LLM服务实例"""
    # 先从数据库查询
    from model_manager.models import LLMModel
    try:
        model = LLMModel.objects.get(name=model_name, is_active=True)
        return LLMService(
            model_name=model.name,
            api_key=model.api_key,
            base_url=model.base_url,
            provider=model.provider
        )
    except LLMModel.DoesNotExist:
        print(f"错误: 模型 {model_name} 不存在或未激活")
        return None
    
    # 从设置文件获取配置-硬编码时
    # llm_configs = getattr(settings, 'LLM_CONFIGS', {})
    # if model_name in llm_configs:
    #     config = llm_configs[model_name]
    #     return LLMService(
    #         model_name=model_name,
    #         api_key=config.get('api_key', ''),
    #         base_url=config.get('base_url', ''),
    #         provider=config.get('provider', 'openai')
    #     )
    
    # return None

class LLMService:
    """LLM服务"""
    def __init__(self, model_name, api_key, base_url, provider='openai'):
        self.model_name = model_name
        self.api_key = api_key
        self.base_url = base_url
        self.provider = provider
        self.client = self._init_client()
    
    def _init_client(self):
        """初始化客户端"""
        try:
            # 对于OpenAI、Ollama和SiliconFlow，都使用OpenAI客户端
            if self.provider in ['openai', 'ollama', 'siliconflow']:
                return OpenAI(api_key=self.api_key, base_url=self.base_url, timeout=180.0)  # 增加超时时间到180秒
            return None
        except Exception as e:
            print(f"初始化LLM客户端出错: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def generate(self, messages, temperature=0.1, stream=False):
        """生成回复"""
        if not self.client:
            raise Exception(f"未初始化 {self.provider} 客户端")
        
        try:
            # 调试信息
            # print(f"API请求: 模型={self.model_name}, 提供商={self.provider}")
            # print(f"API密钥前缀: {self.api_key[:4]}***")
            
            # 检查是否是本地模型（Ollama或特定模型）
            is_local_model = self.provider == 'ollama' or 'deepseek-r1' in self.model_name or 'glm' in self.model_name
            
            # 构建响应
            if stream:
                # 流式生成
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    temperature=temperature,
                    stream=True,
                    timeout=180  # 增加超时时间
                )
                
                if is_local_model:
                    # 处理本地模型的流式输出
                    return self._handle_local_stream(response)
                else:
                    # 普通流式输出
                    return response
            else:
                # 非流式生成
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    temperature=temperature,
                    stream=False,
                    timeout=180  # 增加超时时间
                )
                
                if is_local_model:
                    # 处理本地模型的完整输出
                    # 检查输出中是否有思考过程标签
                    content = response.choices[0].message.content
                    think_content, answer_content = self._extract_thinking(content)
                    
                    # 将思考过程添加到响应中
                    result = response.model_dump()
                    if think_content:
                        result['thinking_process'] = think_content
                        result['choices'][0]['message']['content'] = answer_content
                    
                    return result
                else:
                    # 普通模型响应
                    return response.model_dump()
        except Exception as e:
            print(f"调用模型API错误: {str(e)}")
            # 获取更详细的错误信息
            import traceback
            traceback.print_exc()
            raise
    
    def _extract_thinking(self, content):
        """从内容中提取思考过程，支持<think>和markdown格式"""
        if not content:
            return None, content
        
        # 尝试提取<think>标签中的内容
        think_match = re.search(r'<think>(.*?)</think>', content, re.DOTALL)
        if think_match:
            think_content = think_match.group(1).strip()
            answer_content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
            return think_content, answer_content
        
        return None, content
    
    def _handle_local_stream(self, stream_response):
        """处理本地模型的流式输出，提取思考过程"""
        # 创建一个生成器，处理流式响应并提取思考过程
        def stream_processor():
            thinking_buffer = []
            answer_buffer = []
            in_thinking = False
            
            for chunk in stream_response:
                delta = chunk.choices[0].delta.content or ""
                
                if "<think>" in delta:
                    in_thinking = True
                    # 将<think>前的部分加入答案
                    pre_think = delta.split("<think>")[0]
                    if pre_think:
                        answer_buffer.append(pre_think)
                    # 将<think>后的部分加入思考
                    post_think = delta.split("<think>")[-1]
                    thinking_buffer.append(post_think)
                    
                    # 构建包含thinking字段的特殊块
                    yield {
                        "choices": [{
                            "delta": {"content": pre_think, "role": "assistant"},
                            "index": 0,
                            "thinking": True,
                            "thinking_content": post_think
                        }],
                        "object": "chat.completion.chunk"
                    }
                elif "</think>" in delta:
                    in_thinking = False
                    # 将</think>前的部分加入思考
                    pre_end = delta.split("</think>")[0]
                    thinking_buffer.append(pre_end)
                    # 将</think>后的部分加入答案
                    post_end = delta.split("</think>")[-1]
                    answer_buffer.append(post_end)
                    
                    # 构建thinking结束和answer开始的特殊块
                    yield {
                        "choices": [{
                            "delta": {"content": post_end, "role": "assistant"},
                            "index": 0,
                            "thinking": False,
                            "thinking_end": True,
                            "thinking_content": "".join(thinking_buffer)
                        }],
                        "object": "chat.completion.chunk"
                    }
                elif in_thinking:
                    thinking_buffer.append(delta)
                    # 构建thinking内容块
                    yield {
                        "choices": [{
                            "delta": {"content": "", "role": "assistant"},
                            "index": 0,
                            "thinking": True,
                            "thinking_content": delta
                        }],
                        "object": "chat.completion.chunk"
                    }
                else:
                    answer_buffer.append(delta)
                    # 构建普通内容块
                    yield {
                        "choices": [{
                            "delta": {"content": delta, "role": "assistant"},
                            "index": 0
                        }],
                        "object": "chat.completion.chunk"
                    }
            
            # 返回完整的思考过程和答案
            yield {
                "choices": [{
                    "delta": {"content": None, "role": None},
                    "index": 0,
                    "finish_reason": "stop",
                    "final_thinking": "".join(thinking_buffer),
                    "final_answer": "".join(answer_buffer)
                }],
                "object": "chat.completion.chunk"
            }
        
        return stream_processor()