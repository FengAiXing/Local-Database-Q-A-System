from django.db import models
from django.contrib.auth.models import User

class LLMModel(models.Model):
    """LLM模型配置"""
    PROVIDER_CHOICES = [
        ('openai', 'OpenAI'),
        ('siliconflow', 'SiliconFlow'),
        ('ollama', 'Ollama'),
    ]
    
    name = models.CharField(max_length=100)
    display_name = models.CharField(max_length=100)
    provider = models.CharField(max_length=50, choices=PROVIDER_CHOICES)
    api_key = models.CharField(max_length=255, blank=True)
    base_url = models.URLField(max_length=255)
    is_free = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    context_length = models.IntegerField(default=4096)
    order = models.IntegerField(default=0, help_text="排序顺序，数字越小排越靠前")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.display_name} ({self.provider})"
    
    class Meta:
        verbose_name = "LLM模型"
        verbose_name_plural = "LLM模型"
        ordering = ['order', 'provider', 'name'] 

class SystemPrompt(models.Model):
    """系统提示词模板"""
    name = models.CharField(max_length=100)
    content = models.TextField()
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    is_global = models.BooleanField(default=False, verbose_name="全局提示词")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "系统提示词"
        verbose_name_plural = "系统提示词"