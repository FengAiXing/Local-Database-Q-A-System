// frontend/src/api/knowledge.js
import api from './index';

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