from django.db import models
from django.contrib.auth.models import User

class ChatHistory(models.Model):
    """聊天历史记录"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_histories')
    title = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    config = models.JSONField(blank=True, null=True)
    
    def __str__(self):
        return f"{self.title or '未命名会话'} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"
    
    class Meta:
        ordering = ['-updated_at']
        verbose_name = "聊天历史"
        verbose_name_plural = "聊天历史"

class ChatMessage(models.Model):
    """聊天消息"""
    ROLE_CHOICES = [
        ('user', '用户'),
        ('assistant', '助手'),
        ('system', '系统'),
    ]
    
    chat_history = models.ForeignKey(ChatHistory, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    raw_input = models.TextField(blank=True, null=True)  # 可以存储大量文本
    created_at = models.DateTimeField(auto_now_add=True)
    related_docs = models.JSONField(blank=True, null=True)
    rag_prompt = models.TextField(blank=True, null=True)
    thinking_process = models.TextField(blank=True, null=True)
    attachments = models.JSONField(blank=True, null=True)  # 存储上传文件的信息，确保完整存储文件URL等信息
    
    def __str__(self):
        return f"{self.role}: {self.content[:50]}..."
    
    class Meta:
        ordering = ['created_at']
        verbose_name = "聊天消息"
        verbose_name_plural = "聊天消息"