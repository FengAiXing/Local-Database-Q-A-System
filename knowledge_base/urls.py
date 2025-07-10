from django.urls import path
from . import views
from . import progress

urlpatterns = [
    path('', views.KnowledgeBaseListView.as_view(), name='knowledge_base_list'),
    path('<int:pk>/', views.KnowledgeBaseDetailView.as_view(), name='knowledge_base_detail'),
    path('<int:pk>/documents/', views.DocumentListView.as_view(), name='document_list'),
    path('<int:kb_pk>/documents/<int:pk>/', views.DocumentDetailView.as_view(), name='document_detail'),
    path('<int:pk>/process/', views.ProcessKnowledgeBaseView.as_view(), name='process_knowledge_base'),
    path('<int:kb_id>/progress/<str:task_id>/', progress.ProcessingProgressView.as_view(), name='processing_progress'),
]