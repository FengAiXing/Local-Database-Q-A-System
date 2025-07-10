// frontend/src/store/knowledge.js
import { create } from 'zustand';
import { knowledgeAPI } from '../api/knowledge';

const useKnowledgeStore = create((set, get) => ({
  knowledgeBases: [],
  currentKnowledgeBase: null,
  isLoading: false,
  isProcessing: false,
  error: null,
  
  // 加载知识库列表
  loadKnowledgeBases: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await knowledgeAPI.getKnowledgeBases();
      set({
        knowledgeBases: response.data,
        isLoading: false,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.response?.data?.detail || '加载知识库失败',
      });
    }
  },
  
  // 加载特定知识库详情
  loadKnowledgeBase: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const response = await knowledgeAPI.getKnowledgeBase(id);
      set({
        currentKnowledgeBase: response.data,
        isLoading: false,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.response?.data?.detail || '加载知识库详情失败',
      });
    }
  },
  
  // 创建知识库
  createKnowledgeBase: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await knowledgeAPI.createKnowledgeBase(data);
      set(state => ({
        knowledgeBases: [...state.knowledgeBases, response.data],
        isLoading: false,
      }));
      return response.data;
    } catch (error) {
      set({
        isLoading: false,
        error: error.response?.data?.detail || '创建知识库失败',
      });
      return null;
    }
  },
  
  // 更新知识库
  updateKnowledgeBase: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await knowledgeAPI.updateKnowledgeBase(id, data);
      
      set(state => ({
        knowledgeBases: state.knowledgeBases.map(kb => 
          kb.id === id ? response.data : kb
        ),
        currentKnowledgeBase: state.currentKnowledgeBase?.id === id 
          ? response.data 
          : state.currentKnowledgeBase,
        isLoading: false,
      }));
      
      return response.data;
    } catch (error) {
      set({
        isLoading: false,
        error: error.response?.data?.detail || '更新知识库失败',
      });
      return null;
    }
  },
  
  // 删除知识库
  deleteKnowledgeBase: async (id) => {
    try {
      await knowledgeAPI.deleteKnowledgeBase(id);
      
      set(state => ({
        knowledgeBases: state.knowledgeBases.filter(kb => kb.id !== id),
        currentKnowledgeBase: state.currentKnowledgeBase?.id === id 
          ? null 
          : state.currentKnowledgeBase,
      }));
      
      return true;
    } catch (error) {
      set({
        error: error.response?.data?.detail || '删除知识库失败',
      });
      return false;
    }
  },
  
  // 上传文档 - 修改为直接返回true，因为上传已经由Upload组件直接处理
  uploadDocument: async (knowledgeBaseId, file) => {
    // 这个函数不再需要自己上传，因为已经由Upload组件直接处理
    // 但为了保持API一致性，我们保留这个函数
    return true;
  },
  
  // 删除文档
  deleteDocument: async (knowledgeBaseId, documentId) => {
    try {
      await knowledgeAPI.deleteDocument(knowledgeBaseId, documentId);
      
      // 如果是当前知识库，更新文档列表
      if (get().currentKnowledgeBase?.id === knowledgeBaseId) {
        set({
          currentKnowledgeBase: {
            ...get().currentKnowledgeBase,
            documents: get().currentKnowledgeBase.documents.filter(
              doc => doc.id !== documentId
            ),
          },
        });
      }
      
      return true;
    } catch (error) {
      set({
        error: error.response?.data?.detail || '删除文档失败',
      });
      return false;
    }
  },
  
  // 处理知识库
  processKnowledgeBase: async (knowledgeBaseId, forceCreate = false, taskId = null) => {
    set({ isProcessing: true, error: null });
    try {
      const response = await knowledgeAPI.processKnowledgeBase(knowledgeBaseId, forceCreate, taskId);
      
      // 注意：这里不需要立即加载知识库，因为我们会通过WebSocket获取更新
      // 处理完成后会单独调用loadKnowledgeBase
      
      set({ isProcessing: false });
      return response.data;
    } catch (error) {
      console.error('处理知识库失败:', error);
      set({
        isProcessing: false,
        error: error.response?.data?.detail || '处理知识库失败',
      });
      return null;
    }
  },
  
  // 取消处理
  cancelProcessing: async (knowledgeBaseId, taskId) => {
    try {
      await knowledgeAPI.cancelProcessing(knowledgeBaseId, taskId);
      return true;
    } catch (error) {
      console.error('取消处理失败:', error);
      set({
        error: error.response?.data?.detail || '取消处理失败',
      });
      return false;
    }
  },
}));

export default useKnowledgeStore;