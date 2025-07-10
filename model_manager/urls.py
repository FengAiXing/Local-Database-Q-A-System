from django.urls import path
from . import views

urlpatterns = [
    path('', views.LLMModelListView.as_view(), name='llm_model_list'),
    path('<int:pk>/', views.LLMModelDetailView.as_view(), name='llm_model_detail'),
    path('prompts/', views.SystemPromptListView.as_view(), name='system_prompt_list'),
    path('prompts/<int:pk>/', views.SystemPromptDetailView.as_view(), name='system_prompt_detail'),
    path('status/', views.ModelStatusView.as_view(), name='model_status'),
]