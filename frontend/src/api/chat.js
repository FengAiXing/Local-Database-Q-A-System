import api from './index';

export const chatAPI = {
  // 发送消息
  sendMessage: (data) => {
    console.log('API sendMessage:', data);
    // 检查模型参数
    if (!data.model) {
      console.error('没有指定模型名称');
      return Promise.reject(new Error('没有指定模型名称，请选择一个模型'));
    }
    return api.post('/chat/', data);
  },
  
  // 发送带文件的消息
  sendMessageWithFiles: (formData) => {
    console.log('API sendMessageWithFiles');
    return api.post('/chat/with-files/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      }
    });
  },
  
  // 发送流式消息请求
  sendStreamMessage: (data) => {
    console.log('API sendStreamMessage');
    // 这个方法不返回Promise，因为它使用的是EventSource
    // 调用者需要自己处理流式响应
    const queryParams = new URLSearchParams({
      message: data.message,
      history_id: data.history_id || '',
      model: data.model || 'deepseek-r1',
      use_rag: data.use_rag || false,
      knowledge_base: data.knowledge_base || '',
      system_prompt_id: data.system_prompt_id || ''
    }).toString();
    
    return `/api/chat/stream/?${queryParams}`;
  },
  
  // 获取聊天历史列表
  getChatHistories: () => {
    return api.get('/chat/history/');
  },
  
  // 获取特定聊天历史
  getChatHistory: (id) => {
    return api.get(`/chat/history/${id}/`);
  },
  
  // 更新聊天历史
  updateChatHistory: (id, data) => {
    return api.patch(`/chat/history/${id}/`, data);
  },
  
  // 删除聊天历史
  deleteChatHistory: (id) => {
    return api.delete(`/chat/history/${id}/`);
  },
};