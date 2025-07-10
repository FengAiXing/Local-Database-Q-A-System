from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from .models import KnowledgeBase, Document
from .serializers import KnowledgeBaseSerializer, KnowledgeBaseDetailSerializer, DocumentSerializer
from core.rag.document_processor import process_documents
import os
import uuid
import threading
from django.conf import settings

class KnowledgeBaseListView(generics.ListCreateAPIView):
    """知识库列表"""
    serializer_class = KnowledgeBaseSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return KnowledgeBase.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        # 检查同名知识库
        name = self.request.data.get('name')
        if KnowledgeBase.objects.filter(user=self.request.user, name=name).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'name': '您已创建过同名知识库'})
        serializer.save(user=self.request.user)

class KnowledgeBaseDetailView(generics.RetrieveUpdateDestroyAPIView):
    """知识库详情"""
    serializer_class = KnowledgeBaseDetailSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return KnowledgeBase.objects.filter(user=self.request.user)
    
    def perform_destroy(self, instance):
        # 删除知识库文件夹
        from django.conf import settings
        import shutil
        
        # 使用包含用户ID的路径
        user_id = instance.user.id
        
        # 删除文档目录
        kb_doc_path = os.path.join(settings.MEDIA_ROOT, 'documents', f"user_{user_id}", instance.name)
        if os.path.exists(kb_doc_path):
            shutil.rmtree(kb_doc_path)
            
        # 删除向量数据库文件 - 使用新的文件名格式
        index_name = f"user_{user_id}_{instance.name}"
        for ext in ['.faiss', '.pkl']:
            vector_path = os.path.join(settings.MEDIA_ROOT, 'faiss_index', f"{index_name}{ext}")
            if os.path.exists(vector_path):
                os.remove(vector_path)
                
        # 删除哈希记录 - 使用新的键名格式
        from core.utils import read_json_file, save_json_file
        hash_file_path = os.path.join(settings.MEDIA_ROOT, 'documents', 'hash_file.json')
        hash_data = read_json_file(hash_file_path)
        
        # 检查新旧两种键名格式
        old_key = instance.name
        new_key = f"user_{user_id}_{instance.name}"
        
        if new_key in hash_data:
            del hash_data[new_key]
            save_json_file(hash_data, hash_file_path)
        elif old_key in hash_data:
            del hash_data[old_key]
            save_json_file(hash_data, hash_file_path)
        
        instance.delete()

class DocumentListView(generics.ListCreateAPIView):
    """文档列表视图"""
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    
    def get_queryset(self):
        kb_id = self.kwargs.get('pk')
        kb = get_object_or_404(KnowledgeBase, id=kb_id, user=self.request.user)
        return Document.objects.filter(knowledge_base=kb)
    
    def create(self, request, *args, **kwargs):
        try:
            # 获取知识库
            kb_id = self.kwargs.get('pk')
            kb = get_object_or_404(KnowledgeBase, id=kb_id, user=request.user)
            
            # 获取上传的文件
            file = request.FILES.get('file')
            if not file:
                return Response({"error": "没有找到文件"}, status=status.HTTP_400_BAD_REQUEST)
            
            # 创建文档记录
            document = Document(
                knowledge_base=kb,
                file=file,
                filename=file.name,
                uploaded_by=request.user
            )
            document.save()
            
            # 返回序列化的文档数据
            serializer = self.get_serializer(document)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

class DocumentDetailView(generics.RetrieveDestroyAPIView):
    """文档详情"""
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        kb_id = self.kwargs.get('kb_pk')
        kb = get_object_or_404(KnowledgeBase, id=kb_id, user=self.request.user)
        return Document.objects.filter(knowledge_base=kb)

class ProcessKnowledgeBaseView(APIView):
    """处理知识库文档"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request, pk):
        kb = get_object_or_404(KnowledgeBase, id=pk, user=request.user)
        
        force_create = request.data.get('force_create', False)
        task_id = request.data.get('task_id')
        
        # 确保有任务ID
        if not task_id:
            task_id = str(uuid.uuid4())
            
        print(f"开始处理知识库 ID={pk}, 任务ID={task_id}, 强制重建={force_create}")
        
        try:
            # 获取文档数量用于进度估计
            documents = Document.objects.filter(knowledge_base=kb, processed=False)
            
            if not documents.exists() and not force_create:
                return Response(
                    {'message': '没有需要处理的新文档', 'task_id': task_id},
                    status=status.HTTP_200_OK
                )
            
            # 初始化任务状态
            group_name = f'kb_{pk}_{task_id}'
            settings.PROCESSING_TASKS[group_name] = {
                'status': 'initializing',
                'message': '正在初始化...',
                'progress': 0,
                'total': 100,
                'task_id': task_id
            }
            
            # 异步处理文档
            def process_async():
                try:
                    print(f"异步处理任务开始: {task_id}")
                    failed_docs = process_documents(kb, force_create, task_id=task_id)
                    if failed_docs and isinstance(failed_docs, dict) and failed_docs.get('task_cancelled'):
                        print(f"任务已取消: {task_id}")
                    elif failed_docs:
                        print(f"处理失败的文档: {failed_docs}")
                except Exception as e:
                    print(f"异步处理文档时出错: {str(e)}")
                    # 更新任务状态为错误
                    group_name = f'kb_{pk}_{task_id}'
                    if group_name in settings.PROCESSING_TASKS:
                        settings.PROCESSING_TASKS[group_name]['status'] = 'error'
                        settings.PROCESSING_TASKS[group_name]['message'] = f'处理时出错: {str(e)}'
                    import traceback
                    traceback.print_exc()
            
            thread = threading.Thread(target=process_async)
            thread.daemon = True
            thread.start()
            
            return Response({
                'message': '文档处理已开始',
                'task_id': task_id
            })
                
        except Exception as e:
            return Response(
                {'error': f'处理文档时出错: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def delete(self, request, pk):
        """取消文档处理任务"""
        kb = get_object_or_404(KnowledgeBase, id=pk, user=request.user)
        task_id = request.query_params.get('task_id')
        
        if not task_id:
            return Response({'error': '未提供任务ID'}, status=status.HTTP_400_BAD_REQUEST)
        
        print(f"取消处理任务: KB={pk}, 任务ID={task_id}")
        group_name = f'kb_{pk}_{task_id}'
        
        # 标记任务为已取消
        if group_name in settings.PROCESSING_TASKS:
            settings.PROCESSING_TASKS[group_name]['status'] = 'cancelled'
            settings.PROCESSING_TASKS[group_name]['message'] = '处理已取消'
            return Response({'message': '任务已取消'})
        else:
            return Response({'error': '找不到指定的任务'}, status=status.HTTP_404_NOT_FOUND)