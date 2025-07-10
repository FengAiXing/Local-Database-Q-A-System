from rest_framework import serializers
from .models import LLMModel, SystemPrompt

class LLMModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = LLMModel
        fields = ['id', 'name', 'display_name', 'provider', 'is_free', 'is_active', 'context_length','order']
        read_only_fields = ['id']
        
class SystemPromptSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemPrompt
        fields = ['id', 'name', 'content', 'is_global', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
        
    def to_representation(self, instance):
        representation = super().to_representation(instance)
        request = self.context.get('request')
        is_superuser = request and request.user and request.user.is_superuser
        
        # 添加字段标识是否可以删除和编辑
        representation['can_delete'] = not instance.is_global or is_superuser
        representation['can_edit'] = not instance.is_global or is_superuser
        return representation