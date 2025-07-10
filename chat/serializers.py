from rest_framework import serializers
from .models import ChatHistory, ChatMessage

class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ['id', 'role', 'content', 'raw_input', 'created_at', 'related_docs', 'thinking_process', 'attachments']
        read_only_fields = ['id', 'created_at']

class ChatHistorySerializer(serializers.ModelSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)
    
    class Meta:
        model = ChatHistory
        fields = ['id', 'title', 'created_at', 'updated_at', 'config', 'messages']
        read_only_fields = ['id', 'created_at', 'updated_at']

class ChatInputSerializer(serializers.Serializer):
    message = serializers.CharField()
    history_id = serializers.IntegerField(required=False, allow_null=True)
    model = serializers.CharField(required=False, default='gpt-4o')
    use_rag = serializers.BooleanField(required=False, default=False)
    knowledge_base = serializers.CharField(required=False, allow_blank=True)
    system_prompt_id = serializers.IntegerField(required=False, allow_null=True)