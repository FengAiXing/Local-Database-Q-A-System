from django.db import models
from django.contrib.auth.models import User

class UserSettings(models.Model):
    """用户设置"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='settings')
    default_model = models.CharField(max_length=100, null=True, blank=True)
    temperature = models.CharField(max_length=10, default='0.1')
    default_rag = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.user.username}的设置"
    
    class Meta:
        verbose_name = "用户设置"
        verbose_name_plural = "用户设置"