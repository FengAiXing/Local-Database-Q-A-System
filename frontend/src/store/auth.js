import { create } from 'zustand';
import { authAPI } from '../api/auth';

const useAuthStore = create((set) => ({
  isAuthenticated: !!localStorage.getItem('token'),
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user')) || null,
  isLoading: false,
  error: null,
  
  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authAPI.login(username, password);
      const { access, refresh, user } = response.data;
      
      localStorage.setItem('token', access);
      localStorage.setItem('refreshToken', refresh);
      localStorage.setItem('user', JSON.stringify(user));
      
      set({
        isAuthenticated: true,
        token: access,
        user,
        isLoading: false,
      });
      
      return true;
    } catch (error) {
      set({
        isLoading: false,
        error: error.response?.data?.detail || '登录失败',
      });
      return false;
    }
  },
  
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    set({
      isAuthenticated: false,
      token: null,
      user: null,
    });
  },
  updateUser: (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    set({
      user: userData
    });
  }
}));

export default useAuthStore;