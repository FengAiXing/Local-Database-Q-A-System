import axios from 'axios';

// 创建axios实例
const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  timeout: 180000,  // 增加到180秒（3分钟）
  headers: {
    'Content-Type': 'application/json',
  }
});

// 请求拦截器 - 添加认证令牌
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // 处理401认证错误
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 设置 API
export const settingsAPI = {
  // 获取用户设置
  getUserSettings: () => {
    return api.get('/users/settings/');
  },
  
  // 更新用户设置
  updateUserSettings: (data) => {
    return api.post('/users/settings/', data);
  }
};

// 模型API
export const modelAPI = {
  // 获取模型列表
  getModels: () => {
    return api.get('/models/');
  },
  
  // 获取特定模型详情
  getModel: (id) => {
    return api.get(`/models/${id}/`);
  }
};

// 系统提示词API
export const promptAPI = {
  // 获取系统提示词列表
  getSystemPrompts: () => {
    return api.get('/models/prompts/');
  },
  
  // 获取特定系统提示词
  getSystemPrompt: (id) => {
    return api.get(`/models/prompts/${id}/`);
  },
  
  // 创建系统提示词
  createSystemPrompt: (data) => {
    return api.post('/models/prompts/', data);
  },
  
  // 更新系统提示词
  updateSystemPrompt: (id, data) => {
    return api.put(`/models/prompts/${id}/`, data);
  },
  
  // 删除系统提示词
  deleteSystemPrompt: (id) => {
    return api.delete(`/models/prompts/${id}/`);
  },
};

// 聊天API
export const chatAPI = {
  // 发送消息
  sendMessage: (data) => {
    console.log('API sendMessage:', data);
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

// 知识库API
export const knowledgeAPI = {
  // 获取知识库列表
  getKnowledgeBases: () => {
    return api.get('/knowledge-base/');
  },
  // 获取特定知识库详情
  getKnowledgeBase: (id) => {
    return api.get(`/knowledge-base/${id}/`);
  },
  // 创建知识库
  createKnowledgeBase: (data) => {
    return api.post('/knowledge-base/', data);
  },
  // 更新知识库
  updateKnowledgeBase: (id, data) => {
    return api.put(`/knowledge-base/${id}/`, data);
  },
  // 删除知识库
  deleteKnowledgeBase: (id) => {
    return api.delete(`/knowledge-base/${id}/`);
  },
  // 上传文档
  uploadDocument: (knowledgeBaseId, formData) => {
    return api.post(`/knowledge-base/${knowledgeBaseId}/documents/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  // 删除文档
  deleteDocument: (knowledgeBaseId, documentId) => {
    return api.delete(`/knowledge-base/${knowledgeBaseId}/documents/${documentId}/`);
  },
  // 处理知识库
  processKnowledgeBase: (knowledgeBaseId, forceCreate = false, taskId = null) => {
    return api.post(`/knowledge-base/${knowledgeBaseId}/process/`, { 
      force_create: forceCreate,
      task_id: taskId
    });
  },
  
  // 获取处理进度
  getProcessingProgress: (knowledgeBaseId, taskId) => {
    return api.get(`/knowledge-base/${knowledgeBaseId}/progress/${taskId}/`);
  },
  
  // 取消处理
  cancelProcessing: (knowledgeBaseId, taskId) => {
    if (!taskId) {
      console.error('取消处理需要任务ID');
      return Promise.reject(new Error('缺少任务ID'));
    }
    return api.delete(`/knowledge-base/${knowledgeBaseId}/process/?task_id=${taskId}`);
  }
};

// 认证API
export const authAPI = {
  login: (username, password) => {
    return api.post('/token/', { username, password });
  },
  refreshToken: (refresh) => {
    return api.post('/token/refresh/', { refresh });
  },
};

export default api;