from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.conf import settings

class ProcessingProgressView(APIView):
    """获取处理进度的API"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, kb_id, task_id):
        """获取指定任务的进度"""
        group_name = f'kb_{kb_id}_{task_id}'
        
        # 从settings中获取进度数据
        progress_data = settings.PROCESSING_TASKS.get(group_name, {})
        
        if not progress_data:
            # 检查是否存在任务正在启动但尚未设置进度的情况
            # 通常在任务刚刚创建时可能出现这种情况
            pending_tasks = [k for k in settings.PROCESSING_TASKS.keys() if k.startswith(f'kb_{kb_id}_')]
            if pending_tasks:
                # 如果有正在处理的任务，返回初始化状态
                return Response({
                    'status': 'initializing',
                    'message': '正在初始化处理...',
                    'progress': 0,
                    'total': 100
                })
            else:
                # 确实找不到任务
                return Response({
                    'status': 'not_found',
                    'message': '找不到指定的任务',
                    'progress': 0,
                    'total': 1
                })
        
        # 确保进度不超过总数
        if 'progress' in progress_data and 'total' in progress_data:
            if progress_data['progress'] > progress_data['total']:
                progress_data['progress'] = progress_data['total']
        
        return Response(progress_data)