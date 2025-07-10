import { create } from 'zustand';
import { promptAPI } from '../api/prompt';

const usePromptStore = create((set, get) => ({
  systemPrompts: [],
  currentSystemPrompt: null,
  isLoading: false,
  error: null,
  
  // 加载系统提示词列表
  loadSystemPrompts: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await promptAPI.getSystemPrompts();
      set({
        systemPrompts: response.data,
        isLoading: false,
      });
      return response.data;
    } catch (error) {
      console.error("加载系统提示词失败:", error);
      set({
        isLoading: false,
        error: error.response?.data?.detail || '加载系统提示词失败',
      });
      return [];
    }
  },
  
  // 加载特定系统提示词
  loadSystemPrompt: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const response = await promptAPI.getSystemPrompt(id);
      set({
        currentSystemPrompt: response.data,
        isLoading: false,
      });
      return response.data;
    } catch (error) {
      console.error("加载系统提示词详情失败:", error);
      set({
        isLoading: false,
        error: error.response?.data?.detail || '加载系统提示词详情失败',
      });
      return null;
    }
  },
  
  // 创建系统提示词
  createSystemPrompt: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await promptAPI.createSystemPrompt(data);
      set(state => ({
        systemPrompts: [...state.systemPrompts, response.data],
        isLoading: false,
      }));
      return response.data;
    } catch (error) {
      console.error("创建系统提示词失败:", error);
      set({
        isLoading: false,
        error: error.response?.data?.detail || '创建系统提示词失败',
      });
      return null;
    }
  },
  
  // 更新系统提示词
  updateSystemPrompt: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await promptAPI.updateSystemPrompt(id, data);
      set(state => ({
        systemPrompts: state.systemPrompts.map(p => 
          p.id === id ? response.data : p
        ),
        currentSystemPrompt: state.currentSystemPrompt?.id === id 
          ? response.data 
          : state.currentSystemPrompt,
        isLoading: false,
      }));
      return response.data;
    } catch (error) {
      console.error("更新系统提示词失败:", error);
      set({
        isLoading: false,
        error: error.response?.data?.detail || '更新系统提示词失败',
      });
      return null;
    }
  },
  
  // 删除系统提示词
  deleteSystemPrompt: async (id) => {
    try {
      await promptAPI.deleteSystemPrompt(id);
      set(state => ({
        systemPrompts: state.systemPrompts.filter(p => p.id !== id),
        currentSystemPrompt: state.currentSystemPrompt?.id === id 
          ? null 
          : state.currentSystemPrompt,
      }));
      return true;
    } catch (error) {
      console.error("删除系统提示词失败:", error);
      set({
        error: error.response?.data?.detail || '删除系统提示词失败',
      });
      return false;
    }
  },
}));

export default usePromptStore;