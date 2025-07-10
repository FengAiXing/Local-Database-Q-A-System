from django.contrib import admin
from .models import LLMModel, SystemPrompt

@admin.register(LLMModel)
class LLMModelAdmin(admin.ModelAdmin):
    list_display = ['name', 'display_name', 'provider', 'is_free', 'is_active', 'order']
    list_filter = ['provider', 'is_free', 'is_active']
    search_fields = ['name', 'display_name']
    list_editable = ['order', 'is_active']  # 允许在列表页直接编辑排序和活跃状态
    ordering = ['order', 'provider', 'name']  # 设置默认排序

@admin.register(SystemPrompt)
class SystemPromptAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_global', 'created_by', 'created_at', 'updated_at']
    list_filter = ['is_global', 'created_at', 'created_by']
    search_fields = ['name', 'content']
    readonly_fields = ['created_at', 'updated_at']
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(created_by=request.user) | qs.filter(is_global=True)
    
    def has_delete_permission(self, request, obj=None):
        if obj and obj.is_global:
            return request.user.is_superuser
        return super().has_delete_permission(request, obj)
    
    def has_change_permission(self, request, obj=None):
        if obj and obj.is_global:
            return request.user.is_superuser
        return super().has_change_permission(request, obj)
    
    def save_model(self, request, obj, form, change):
        if not obj.created_by and not obj.is_global:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)