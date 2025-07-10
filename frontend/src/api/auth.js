import api from './index';

export const authAPI = {
  login: (username, password) => {
    return api.post('/token/', { username, password });
  },
  refreshToken: (refresh) => {
    return api.post('/token/refresh/', { refresh });
  },
};