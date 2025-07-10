# chat/views.py (完整代码)

from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from .models import ChatHistory, ChatMessage
from .serializers import ChatHistorySerializer, ChatMessageSerializer, ChatInputSerializer
from core.llm.services import get_llm_service
from core.rag.services import get_rag_service
from model_manager.models import SystemPrompt
import json
import os
from django.conf import settings
from uuid import uuid4
import tempfile
from core.file_processor import process_file_content  # 新添加的文件处理器导入

def get_default_model():
    """获取默认激活的模型名称"""
    from model_manager.models import LLMModel
    try:
        # 确保只获取激活的模型
        model = LLMModel.objects.filter(is_active=True).first()
        if model:
            return model.name
        return None
    except Exception as e:
        print(f"获取默认模型出错: {str(e)}")
        return None
    
class ChatMessageView(APIView):
    """处理聊天消息"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        # 验证请求数据
        serializer = ChatInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        # 获取请求参数
        message = serializer.validated_data['message']
        history_id = serializer.validated_data.get('history_id')
        default_model = get_default_model()
        if not default_model:
            return Response(
                {'error': '没有可用的模型，请在管理界面添加并激活至少一个模型'},
                status=status.HTTP_400_BAD_REQUEST
            )
        model_name = serializer.validated_data.get('model', default_model)

        # 验证模型是否存在且激活
        from model_manager.models import LLMModel
        try:
            model = LLMModel.objects.get(name=model_name, is_active=True)
        except LLMModel.DoesNotExist:
            return Response(
                {'error': f'模型 {model_name} 不存在或未激活，请选择其他模型'},
                status=status.HTTP_400_BAD_REQUEST
            )
        use_rag = serializer.validated_data.get('use_rag', False)
        knowledge_base = serializer.validated_data.get('knowledge_base', '')
        system_prompt_id = serializer.validated_data.get('system_prompt_id')
        
        # 获取或创建聊天历史
        if history_id:
            chat_history = get_object_or_404(ChatHistory, id=history_id, user=request.user)
        else:
            # 创建新的聊天历史记录
            chat_history = ChatHistory.objects.create(
                user=request.user,
                title=message[:20] + ('...' if len(message) > 20 else ''),
                config={
                    'model': model_name,
                    'use_rag': use_rag,
                    'knowledge_base': knowledge_base,
                    'system_prompt_id': system_prompt_id
                }
            )
        
        # 创建用户消息
        user_message = ChatMessage.objects.create(
            chat_history=chat_history,
            role='user',
            content=message,
            raw_input=message
        )
        
        # 准备消息历史
        messages = []
        
        # 如果指定了系统提示词，添加到消息开头
        if system_prompt_id:
            try:
                system_prompt = SystemPrompt.objects.get(id=system_prompt_id)
                messages.append({
                    'role': 'system',
                    'content': system_prompt.content
                })
            except SystemPrompt.DoesNotExist:
                pass
        
        # 添加聊天历史
        for msg in chat_history.messages.all().order_by('created_at'):
            if msg.id != user_message.id:  # 排除刚刚添加的消息
                messages.append({
                    'role': msg.role,
                    'content': msg.content
                })
        
        # 使用RAG处理
        related_docs = None
        rag_prompt = None
        if use_rag and knowledge_base:
            try:
                print(f"开始进行RAG处理: 知识库={knowledge_base}, 查询={message[:50]}...")
                
                # 先检查知识库是否存在
                from knowledge_base.models import KnowledgeBase
                try:
                    kb = KnowledgeBase.objects.get(name=knowledge_base, user=request.user)
                    print(f"找到知识库: {kb.name}, ID: {kb.id}, 用户: {kb.user.username}, 文档数: {kb.documents.count()}")
                except KnowledgeBase.DoesNotExist:
                    print(f"错误: 知识库 '{knowledge_base}' 不存在")
                    no_kb_prompt = (
                        f"### 系统指令 ###\n"
                        f"你是一个严格遵循指令的知识库问答助手。用户请求使用名为'{knowledge_base}'的知识库，但该知识库不存在或用户无权访问。"
                        f"你必须首先明确告知用户'找不到指定的知识库或您无权访问'，使用这个精确的词语。"
                        f"然后，你可以基于你的常识提供一个可能的回答，但必须在回答前明确标注'以下是我的推测，不基于知识库内容，仅供参考:'。"
                        f"你必须遵循这个格式，不得省略这些提示语。\n\n"
                        f"### 用户问题 ###\n{message}"
                    )
                    # 记录没有找到知识库的情况
                    user_message.raw_input = no_kb_prompt
                    user_message.save()
                    
                    # 添加提示词消息
                    messages.append({
                        'role': 'user', 
                        'content': no_kb_prompt
                    })
                    # 跳过后续RAG处理
                    raise ValueError(f"找不到指定的知识库 '{knowledge_base}' 或用户无权访问")
                
                rag_service = get_rag_service(knowledge_base, request.user.id)
                print(f"RAG服务初始化成功，开始检索...")
                
                # 使用retrieve方法从知识库中获取相关文档
                docs = rag_service.retrieve(message)
                
                if docs:
                    print(f"RAG检索成功: 找到 {len(docs)} 个相关文档")
                    related_docs = [{'content': doc.page_content, 'metadata': doc.metadata} for doc in docs]
                    
                    # 简单打印前两个文档的内容
                    for i, doc in enumerate(docs[:2]):
                        print(f"文档 {i+1} 内容片段: {doc.page_content[:100]}...")
                    
                    user_message.related_docs = related_docs
                    
                    # 创建RAG提示词
                    rag_prompt = rag_service.create_prompt(message, docs)
                    user_message.rag_prompt = rag_prompt
                    user_message.save()
                    
                    print(f"生成RAG提示词成功，长度: {len(rag_prompt)}")
                    
                    # 如果有消息历史，则只替换最后一条消息的内容
                    if messages:
                        print(f"替换最后一条消息内容为RAG提示词")
                        messages[-1]['content'] = rag_prompt
                    else:
                        print(f"添加新消息，内容为RAG提示词")
                        messages.append({
                            'role': 'user', 
                            'content': rag_prompt
                        })
                else:
                    print(f"RAG未能找到相关文档，使用特殊提示处理")
                    # 特殊处理无检索结果的情况
                    no_results_prompt = (
                        f"### 系统指令 ###\n"
                        f"你是一个严格遵循指令的知识库问答助手。对于以下问题，知识库中没有找到任何相关信息。"
                        f"你必须首先明确告知用户'未在知识库中找到相关内容'，使用这个精确的词语。"
                        f"然后，你可以基于你的常识提供一个可能的回答，但必须在回答前明确标注'以下是我的推测，不基于知识库内容，仅供参考:'。"
                        f"你必须遵循这个格式，不得省略这些提示语。\n\n"
                        f"### 用户问题 ###\n{message}"
                    )
                    
                    # 记录没有找到文档的情况
                    user_message.related_docs = []
                    user_message.rag_prompt = no_results_prompt
                    user_message.save()
                    
                    # 如果有消息历史，只替换最后一条消息的内容
                    if messages:
                        print(f"替换最后一条消息内容为无结果提示词")
                        messages[-1]['content'] = no_results_prompt
                    else:
                        print(f"添加新消息，内容为无结果提示词")
                        messages.append({
                            'role': 'user', 
                            'content': no_results_prompt
                        })
            except Exception as e:
                print(f"RAG处理错误: {str(e)}")
                import traceback
                traceback.print_exc()
                
                # 添加原始用户消息
                messages.append({
                    'role': 'user',
                    'content': message
                })
        else:
            # 没有使用RAG，直接添加原始用户消息
            messages.append({
                'role': 'user',
                'content': message
            })
        
        # 获取LLM服务
        llm_service = get_llm_service(model_name)
        if not llm_service:
            return Response(
                {'error': f'无法初始化模型 {model_name}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # 生成回复
        try:
            # 调试信息
            # print(f"API请求: 模型={model_name}, 提供商={llm_service.provider}")
            # print(f"API密钥前缀: {llm_service.api_key[:4]}***")
            
            response = llm_service.generate(messages)
            assistant_message = response['choices'][0]['message']['content']
            thinking_process = response.get('thinking_process')
            
            # 打印完整的回复内容和思考过程
            print(f"\n=== 生成的回复（长度: {len(assistant_message)}）===\n{assistant_message}\n")
            if thinking_process:
                print(f"\n=== 思考过程（长度: {len(thinking_process)}）===\n{thinking_process}\n")
            
            # 保存助手回复
            ChatMessage.objects.create(
                chat_history=chat_history,
                role='assistant',
                content=assistant_message,
                thinking_process=thinking_process
            )
            
            return Response({
                'message': assistant_message,
                'history_id': chat_history.id,
                'related_docs': related_docs,
                'thinking_process': thinking_process
            })
            
        except Exception as e:
            print(f"生成回复时出错: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response(
                {'error': f'生成回复时出错: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class ChatMessageWithFilesView(APIView):
    """处理带文件的聊天消息"""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
    def post(self, request):
        try:
            # 获取请求参数
            message = request.data.get('message', '')
            history_id = request.data.get('history_id')
            default_model = get_default_model()
            if not default_model:
                return Response(
                    {'error': '没有可用的模型，请在管理界面添加并激活至少一个模型'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            model_name = request.data.get('model', default_model)

            # 验证模型是否存在且激活
            from model_manager.models import LLMModel
            try:
                model = LLMModel.objects.get(name=model_name, is_active=True)
            except LLMModel.DoesNotExist:
                return Response(
                    {'error': f'模型 {model_name} 不存在或未激活，请选择其他模型'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            use_rag = request.data.get('use_rag') in [True, 'true', 'True', '1']
            knowledge_base = request.data.get('knowledge_base', '')
            system_prompt_id = request.data.get('system_prompt_id')
            
            # 打印调试信息
            # print(f" 消息={message[:20]}... 模型={model_name} 使用RAG={use_rag}")
            
            # 处理上传的文件 - 修正文件列表获取方式
            files = []
            if 'files[]' in request.FILES:
                files = request.FILES.getlist('files[]')
            elif 'files' in request.FILES:
                files = request.FILES.getlist('files')
            else:
                # 尝试从所有文件中获取
                for key in request.FILES:
                    if key.startswith('files'):
                        files.extend(request.FILES.getlist(key))
            
            # print(f"接收到 {len(files)} 个文件")
            
            file_data = []
            file_contents = []  # 存储文件内容和元数据
            
            # 确保上传目录存在
            upload_dir = os.path.join(settings.MEDIA_ROOT, 'chat_uploads', str(request.user.id))
            os.makedirs(upload_dir, exist_ok=True)
            
            # 导入文件处理器
            try:
                from core.file_processor import process_file_content
                # print("成功导入文件处理器")
            except ImportError as e:
                print(f"导入文件处理器失败: {str(e)}")
                import traceback
                traceback.print_exc()
                return Response(
                    {'error': f'文件处理模块导入失败: {str(e)}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # 处理所有上传的文件
            for file in files:
                # 详细输出文件信息用于调试
                print(f"处理文件: {file.name}, 大小: {file.size}, 类型: {file.content_type}")
                
                # 生成唯一文件名
                file_ext = os.path.splitext(file.name)[1]
                file_id = str(uuid4())  # 生成唯一ID
                unique_filename = f"{file_id}{file_ext}"
                file_path = os.path.join(upload_dir, unique_filename)
                
                # 保存文件
                with open(file_path, 'wb+') as destination:
                    for chunk in file.chunks():
                        destination.write(chunk)
                
                # print(f"文件已保存到: {file_path}")
                
                # 获取文件URL路径 - 生成绝对URL
                domain = request.build_absolute_uri('/').rstrip('/')
                file_url = f"{domain}/media/chat_uploads/{request.user.id}/{unique_filename}"
                
                # 处理文件内容
                try:
                    # print(f"开始处理文件内容: {file.name}")
                    file_content, content_type = process_file_content(file_path, file.name, file.content_type)
                    
                    if file_content:
                        file_contents.append({
                            'name': file.name,
                            'type': content_type,
                            'content': file_content,
                            'path': file_path,
                        })
                        print(f"成功提取文件 {file.name} 的内容，长度: {len(file_content)}")
                    else:
                        print(f"文件 {file.name} 内容提取为空")
                        
                except Exception as e:
                    print(f"处理文件 {file.name} 内容时出错: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    # 即使文件处理失败，也添加到文件数据，告知用户
                    file_contents.append({
                        'name': file.name,
                        'type': 'text/plain',
                        'content': f"无法处理文件: {str(e)}"
                    })
                
                # 保存文件信息 - 确保包含所有必要字段
                file_data.append({
                    'id': file_id,  # 添加唯一ID
                    'name': file.name,
                    'type': file.content_type,
                    'size': file.size,
                    'path': file_path,
                    'url': file_url,  # 使用绝对URL
                    'preview': file_url if file.content_type.startswith('image/') else None  # 为图片添加预览URL
                })
            
            # 获取或创建聊天历史
            if history_id:
                try:
                    chat_history = get_object_or_404(ChatHistory, id=history_id, user=request.user)
                except:
                    # 如果找不到历史ID，创建新的
                    chat_history = ChatHistory.objects.create(
                        user=request.user,
                        title=message[:20] + ('...' if len(message) > 20 else ''),
                        config={
                            'model': model_name,
                            'use_rag': use_rag,
                            'knowledge_base': knowledge_base,
                            'system_prompt_id': system_prompt_id
                        }
                    )
            else:
                # 创建新的聊天历史记录
                chat_history = ChatHistory.objects.create(
                    user=request.user,
                    title=message[:20] + ('...' if len(message) > 20 else ''),
                    config={
                        'model': model_name,
                        'use_rag': use_rag,
                        'knowledge_base': knowledge_base,
                        'system_prompt_id': system_prompt_id
                    }
                )
            
            # 准备消息文本，附加文件内容
            enhanced_message = message if message else "请分析以下上传的文件内容"
            
            # 如果有文件内容，添加到消息中
            if file_contents:
                enhanced_message += "\n\n===== 上传的文件内容 =====\n\n"
                for i, fc in enumerate(file_contents):
                    enhanced_message += f"【文件 {i+1}: {fc['name']}】\n"
                    enhanced_message += "-" * 40 + "\n"
                    enhanced_message += fc['content'] + "\n\n"
            
            # print(f"增强后的消息长度: {len(enhanced_message)}")
            
            # 创建用户消息 - 完整保存附件信息
            user_message = ChatMessage.objects.create(
                chat_history=chat_history,
                role='user',
                content=message,  # 原始消息
                raw_input=enhanced_message,  # 增强的消息作为原始输入
                attachments=file_data if file_data else None  # 保存完整文件数据
            )
            
            # 准备消息历史
            messages = []
            
            # 如果指定了系统提示词，添加到消息开头
            if system_prompt_id:
                try:
                    system_prompt = SystemPrompt.objects.get(id=system_prompt_id)
                    messages.append({
                        'role': 'system',
                        'content': system_prompt.content
                    })
                except SystemPrompt.DoesNotExist:
                    pass
            
            # 添加聊天历史
            for msg in chat_history.messages.all().order_by('created_at'):
                if msg.id != user_message.id:  # 排除刚刚添加的消息
                    messages.append({
                        'role': msg.role,
                        'content': msg.content
                    })
            
            # 使用RAG处理
            related_docs = None
            rag_prompt = None

            if use_rag and knowledge_base:
                try:
                    # 检查指定的知识库是否存在
                    from knowledge_base.models import KnowledgeBase
                    try:
                        kb = KnowledgeBase.objects.get(name=knowledge_base, user=request.user)
                        print(f"知识库: {kb.name}, ID: {kb.id}, 用户: {kb.user.username}")
                    except KnowledgeBase.DoesNotExist:
                        print(f"错误: 指定的知识库 '{knowledge_base}' 不存在")
                         # 使用特殊提示处理知识库不存在的情况
                        no_kb_prompt = (
                            f"### 系统指令 ###\n"
                            f"你是一个严格遵循指令的知识库问答助手。用户请求使用名为'{knowledge_base}'的知识库，但该知识库不存在或用户无权访问。"
                            f"你必须首先明确告知用户'找不到指定的知识库或您无权访问'，使用这个精确的词语。"
                            f"然后，你可以基于你的常识提供一个可能的回答，但必须在回答前明确标注'以下是我的推测，不基于知识库内容，仅供参考:'。"
                            f"你必须遵循这个格式，不得省略这些提示语。\n\n"
                            f"### 用户问题 ###\n{enhanced_message}"
                        )
                        # 记录没有找到知识库的情况
                        user_message.raw_input = no_kb_prompt
                        user_message.save()
                        
                        # 添加提示词消息
                        messages.append({
                            'role': 'user', 
                            'content': no_kb_prompt
                        })
                        # 跳过后续RAG处理
                        raise ValueError(f"指定的知识库 '{knowledge_base}' 不存在")
                    
                    # 获取RAG服务，确保只针对指定的知识库
                    rag_service = get_rag_service(knowledge_base, request.user.id)
                    
                    # 构建用于检索的查询
                    search_queries = []
                    
                    # 先使用用户消息
                    if message.strip():
                        search_queries.append(message)
                    
                    # 从文件内容中提取关键内容用于检索
                    for fc in file_contents:
                        # 提取文件内容，避免过长
                        content = fc['content']
                        # 分段获取文件内容，确保覆盖主要信息
                        # 按段落分割
                        paragraphs = content.split('\n\n')
                        for para in paragraphs:
                            if not para.strip():
                                continue
                            # 使用关键部分进行检索
                            if len(para) > 300:
                                search_queries.append(para[:300])
                            else:
                                search_queries.append(para)
                    
                    # print(f"生成了 {len(search_queries)} 个检索查询")
                    
                    # 设置相关性阈值
                    relevance_threshold = 0.05  # 调整此值以控制检索质量
                    
                    # 逐个执行检索，整合结果
                    all_docs = []
                    for query in search_queries:
                        # print(f"使用查询检索: {query[:100]}...")
                        docs = rag_service.retrieve(query)
                        # 只保留相关度高的文档
                        relevant_docs = []
                        for doc in docs:
                            score = doc.metadata.get('score', 0)
                            if score >= relevance_threshold:
                                doc.metadata['original_query'] = query[:50]  # 记录原始查询
                                relevant_docs.append(doc)
                                # print(f"找到相关文档，分数: {score:.2f}, 内容: {doc.page_content[:50]}...")
                            else:
                                print(f"忽略低相关性文档，分数: {score:.2f}, 内容: {doc.page_content[:50]}...")
                        
                        if relevant_docs:
                            all_docs.extend(relevant_docs)
                            print(f"查询返回 {len(relevant_docs)} 个相关文档 (分数≥{relevance_threshold})")
                        else:
                            print(f"查询未返回达到阈值的相关文档")
                    
                    # 去重：通过内容哈希值去除重复文档
                    unique_docs = {}
                    for doc in all_docs:
                        content = doc.page_content.strip()
                        # 使用内容哈希作为键，保留分数最高的文档
                        content_hash = hash(content)
                        if content_hash not in unique_docs or doc.metadata.get('score', 0) > unique_docs[content_hash].metadata.get('score', 0):
                            unique_docs[content_hash] = doc
                    
                    # 转换回列表并按相关性排序
                    unique_docs_list = list(unique_docs.values())
                    unique_docs_list.sort(key=lambda x: x.metadata.get('score', 0), reverse=True)
                    
                    # 限制文档数量，避免过多
                    max_docs = 8
                    if len(unique_docs_list) > max_docs:
                        unique_docs_list = unique_docs_list[:max_docs]
                    
                    if unique_docs_list:
                        # print(f"最终检索到 {len(unique_docs_list)} 个高相关度文档")
                        
                        # 转换为相关文档格式
                        related_docs = [{'content': doc.page_content, 'metadata': doc.metadata} for doc in unique_docs_list]
                        user_message.related_docs = related_docs
                        
                        # 创建RAG提示词
                        rag_prompt = rag_service.create_prompt(enhanced_message, unique_docs_list)
                        user_message.rag_prompt = rag_prompt
                        user_message.save()
                        
                        print(f"生成RAG提示词成功，长度: {len(rag_prompt)}")
                        
                        # 将RAG提示词添加到消息中
                        messages.append({
                            'role': 'user',
                            'content': rag_prompt
                        })
                    else:
                        print(f"未找到任何高相关度文档，使用无结果提示词")
                        # 特殊处理无检索结果的情况
                        no_results_prompt = (
                            f"### 系统指令 ###\n"
                            f"你是一个严格遵循指令的知识库问答助手。对于以下问题，知识库中没有找到任何相关信息。"
                            f"你必须首先明确告知用户'未在知识库中找到相关内容'，使用这个精确的词语。"
                            f"然后，你可以基于你的常识提供一个可能的回答，但必须在回答前明确标注'以下是我的推测，仅供参考:'。"
                            f"你必须遵循这个格式，不可以省略这些提示语。\n\n"
                            f"### 用户问题 ###\n{enhanced_message}"
                        )
                        
                        # 记录没有找到文档的情况
                        user_message.related_docs = []
                        user_message.rag_prompt = no_results_prompt
                        user_message.save()
                        
                        messages.append({
                            'role': 'user',
                            'content': no_results_prompt
                        })
                except Exception as e:
                    print(f"RAG处理错误: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    # 出错时直接使用增强消息
                    messages.append({
                        'role': 'user',
                        'content': enhanced_message + "\n\n请结合历史聊天记录来回答，不要引用任何其他知识库的内容，也不要回复一些没有任何依据的内容。"
                    })
            else:
                # 未启用RAG，直接添加增强后的消息
                messages.append({
                    'role': 'user',
                    'content': enhanced_message
                })
            
            # 获取LLM服务
            llm_service = get_llm_service(model_name)
            if not llm_service:
                return Response(
                    {'error': f'无法初始化模型 {model_name}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            print(f"开始生成回复...")
            
            # 生成回复
            try:
                response = llm_service.generate(messages)
                assistant_message = response['choices'][0]['message']['content']
                thinking_process = response.get('thinking_process')
                
                # 打印完整的回复内容和思考过程
                if thinking_process:
                    print(f"\n=== 思考过程（长度: {len(thinking_process)}）===\n{thinking_process}\n")
                print(f"\n=== 生成的回复（长度: {len(assistant_message)}）===\n{assistant_message}\n")
                # print(f"生成回复成功，长度: {len(assistant_message)}")
                
                # 保存助手回复
                ChatMessage.objects.create(
                    chat_history=chat_history,
                    role='assistant',
                    content=assistant_message,
                    thinking_process=thinking_process
                )
                
                return Response({
                    'message': assistant_message,
                    'history_id': chat_history.id,
                    'related_docs': related_docs,
                    'thinking_process': thinking_process,
                    'files': file_data
                })
            except Exception as e:
                print(f"生成回复时出错: {str(e)}")
                import traceback
                traceback.print_exc()
                return Response(
                    {'error': f'生成回复时出错: {str(e)}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
        except Exception as e:
            print(f"处理带文件的消息时出错: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response(
                {'error': f'处理带文件的消息时出错: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            
class ChatHistoryListView(generics.ListCreateAPIView):
    """聊天历史列表"""
    serializer_class = ChatHistorySerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return ChatHistory.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class ChatHistoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """聊天历史详情"""
    serializer_class = ChatHistorySerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return ChatHistory.objects.filter(user=self.request.user)