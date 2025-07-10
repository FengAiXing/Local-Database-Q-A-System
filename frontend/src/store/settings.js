// frontend/src/store/settings.js
import { create } from 'zustand';
import { settingsAPI } from '../api/index';
import AlertService from '../utils/AlertService';

const useSettingsStore = create((set, get) => ({
  userSettings: null,
  isLoading: false,
  error: null,
  
  // 加载用户设置
  loadUserSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await settingsAPI.getUserSettings();
      set({
        userSettings: response.data,
        isLoading: false,
      });
      return response.data;
    } catch (error) {
      console.error("加载用户设置失败:", error);
      set({
        isLoading: false,
        error: error.response?.data?.detail || '加载用户设置失败',
        userSettings: null,
      });
      return null;
    }
  },
  
  // 更新用户设置
  updateUserSettings: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await settingsAPI.updateUserSettings(data);
      set({
        userSettings: response.data,
        isLoading: false,
      });
      AlertService.success('设置已保存');
      return response.data;
    } catch (error) {
      console.error("更新用户设置失败:", error);
      set({
        isLoading: false,
        error: error.response?.data?.detail || '更新用户设置失败',
      });
      AlertService.error('保存设置失败');
      return null;
    }
  },
  
  // 重置错误状态
  resetError: () => set({ error: null }),
}));

export default useSettingsStore;