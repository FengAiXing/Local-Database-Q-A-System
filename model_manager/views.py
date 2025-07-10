from rest_framework import generics
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from .models import LLMModel, SystemPrompt
from .serializers import LLMModelSerializer, SystemPromptSerializer
from rest_framework.views import APIView
from rest_framework.response import Response


class ModelStatusView(APIView):
    """返回模型可用状态"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # 获取所有激活的模型
        active_models = LLMModel.objects.filter(is_active=True)
        
        if not active_models.exists():
            return Response({
                'status': 'error',
                'message': '没有可用的模型，请在管理界面添加并激活模型',
                'has_active_models': False
            })
            
        return Response({
            'status': 'ok',
            'message': f'找到 {active_models.count()} 个可用模型',
            'has_active_models': True,
            'default_model': active_models.first().name if active_models.exists() else None
        })
        
class LLMModelListView(generics.ListCreateAPIView):
    """LLM模型列表"""
    serializer_class = LLMModelSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # 普通用户只能查看激活的模型，并按order排序
        if self.request.user.is_staff:
            return LLMModel.objects.all().order_by('order', 'provider', 'name')
        return LLMModel.objects.filter(is_active=True).order_by('order', 'provider', 'name')
    
    def get_permissions(self):
        # 创建模型需要管理员权限
        if self.request.method != 'GET':
            return [IsAdminUser()]
        return super().get_permissions()
    
    def perform_create(self, serializer):
        instance = serializer.save()
        # 通知其他服务刷新模型缓存
        print(f"创建了新模型: {instance.name}")
        return instance

    def perform_update(self, serializer):
        instance = serializer.save()
        # 通知其他服务刷新模型缓存
        print(f"更新了模型: {instance.name}")
        return instance

class LLMModelDetailView(generics.RetrieveUpdateDestroyAPIView):
    """LLM模型详情"""
    serializer_class = LLMModelSerializer
    permission_classes = [IsAdminUser]
    queryset = LLMModel.objects.all()

class SystemPromptListView(generics.ListCreateAPIView):
    """系统提示词列表"""
    serializer_class = SystemPromptSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # 包括当前用户创建的和全局的系统提示词
        return (SystemPrompt.objects.filter(created_by=self.request.user) | 
                SystemPrompt.objects.filter(is_global=True))
    
    def perform_create(self, serializer):
        # 普通用户不能创建全局提示词
        if not self.request.user.is_staff and serializer.validated_data.get('is_global', False):
            serializer.validated_data['is_global'] = False
        serializer.save(created_by=self.request.user)

class SystemPromptDetailView(generics.RetrieveUpdateDestroyAPIView):
    """系统提示词详情"""
    serializer_class = SystemPromptSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # 用户可以查看全局和自己的提示词
        return (SystemPrompt.objects.filter(created_by=self.request.user) | 
                SystemPrompt.objects.filter(is_global=True))
    
    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        # 如果是编辑操作且对象是全局提示词，非管理员不允许编辑
        if request.method in ['PUT', 'PATCH'] and obj.is_global and not request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("无法编辑全局提示词")
    
    def perform_destroy(self, instance):
        # 阻止删除全局提示词
        if instance.is_global and not self.request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("无法删除全局提示词")
        super().perform_destroy(instance)
    
    def perform_update(self, serializer):
        # 阻止修改全局提示词的全局状态
        instance = self.get_object()
        if instance.is_global and not self.request.user.is_superuser:
            # 全局提示词不允许普通用户编辑
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("无法编辑全局提示词")
        
        # 普通用户不能将自己的提示词设为全局
        if not self.request.user.is_superuser and serializer.validated_data.get('is_global', False):
            serializer.validated_data['is_global'] = False
            
        serializer.save()