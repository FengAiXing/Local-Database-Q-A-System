from django.contrib import admin
from .models import KnowledgeBase, Document

class DocumentInline(admin.TabularInline):
    model = Document
    extra = 0
    readonly_fields = ['filename', 'uploaded_at', 'processed']

@admin.register(KnowledgeBase)
class KnowledgeBaseAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'created_at', 'document_count', 'embedding_type']
    list_filter = ['user', 'created_at', 'embedding_type']
    search_fields = ['name', 'description', 'user__username']
    inlines = [DocumentInline]
    
    def document_count(self, obj):
        return obj.documents.count()
    document_count.short_description = '文档数量'
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(user=request.user)

@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ['filename', 'knowledge_base', 'uploaded_by', 'uploaded_at', 'processed']
    list_filter = ['processed', 'uploaded_at', 'knowledge_base']
    search_fields = ['filename', 'knowledge_base__name']
    readonly_fields = ['uploaded_at', 'file_hash']
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(knowledge_base__user=request.user)