import api from './index';

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