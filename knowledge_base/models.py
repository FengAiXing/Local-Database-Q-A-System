# knowledge_base/models.py
from django.db import models
from django.contrib.auth.models import User
import os

def document_upload_path(instance, filename):
    """确定文档上传路径"""
    user_id = instance.knowledge_base.user.id
    kb_name = instance.knowledge_base.name
    return os.path.join('documents', f'user_{user_id}', kb_name, filename)

class KnowledgeBase(models.Model):
    """知识库"""
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='knowledge_bases')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    chunk_size = models.IntegerField(default=512)
    chunk_overlap = models.IntegerField(default=50)
    merge_rows = models.IntegerField(default=2)
    # 添加嵌入模型选项
    EMBEDDING_CHOICES = [
        ('remote', '远程嵌入(SiliconFlow)'),  
        ('local', '本地嵌入(Ollama)'),
    ]
    embedding_type = models.CharField(
        max_length=10, 
        choices=EMBEDDING_CHOICES, 
        default='remote', 
        help_text="选择使用远程API或本地Ollama进行嵌入"
    )
    
    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "知识库"
        verbose_name_plural = "知识库"
        unique_together = ('user', 'name')

class Document(models.Model):
    knowledge_base = models.ForeignKey(KnowledgeBase, on_delete=models.CASCADE, related_name='documents')
    file = models.FileField(upload_to=document_upload_path)
    filename = models.CharField(max_length=255)
    file_hash = models.CharField(max_length=64, blank=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='uploaded_documents')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    processed = models.BooleanField(default=False)
    processing_error = models.TextField(blank=True, null=True)
    
    def __str__(self):
        return self.filename
    
    class Meta:
        verbose_name = "文档"
        verbose_name_plural = "文档"
        unique_together = ('knowledge_base', 'filename')