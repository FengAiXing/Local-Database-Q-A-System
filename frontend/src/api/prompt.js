import api from './index';

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