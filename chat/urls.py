from django.urls import path
from . import views
# from . import streaming

urlpatterns = [
    path('', views.ChatMessageView.as_view(), name='chat_message'),
    path('with-files/', views.ChatMessageWithFilesView.as_view(), name='chat_message_with_files'),
    path('history/', views.ChatHistoryListView.as_view(), name='chat_history_list'),
    path('history/<int:pk>/', views.ChatHistoryDetailView.as_view(), name='chat_history_detail'),
    # path('stream/', streaming.stream_chat, name='stream_chat'),
]