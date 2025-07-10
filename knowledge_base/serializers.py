# knowledge_base/serializers.py
from rest_framework import serializers
from .models import KnowledgeBase, Document

class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = ['id', 'filename', 'file', 'uploaded_at', 'processed', 'processing_error']
        read_only_fields = ['id', 'uploaded_at', 'processed', 'processing_error']

class KnowledgeBaseSerializer(serializers.ModelSerializer):
    documents_count = serializers.SerializerMethodField()
    
    class Meta:
        model = KnowledgeBase
        fields = ['id', 'name', 'description', 'created_at', 'updated_at', 
                  'chunk_size', 'chunk_overlap', 'merge_rows', 'embedding_type', 'documents_count']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_documents_count(self, obj):
        return obj.documents.count()
    
    def validate_name(self, value):
        """确保同一用户下知识库名称唯一"""
        request = self.context.get('request')
        if request and request.user and self.instance is None:  # 只在创建时验证
            if KnowledgeBase.objects.filter(user=request.user, name=value).exists():
                raise serializers.ValidationError("您已创建过同名知识库")
        return value

class KnowledgeBaseDetailSerializer(KnowledgeBaseSerializer):
    documents = DocumentSerializer(many=True, read_only=True)
    
    class Meta(KnowledgeBaseSerializer.Meta):
        fields = KnowledgeBaseSerializer.Meta.fields + ['documents']