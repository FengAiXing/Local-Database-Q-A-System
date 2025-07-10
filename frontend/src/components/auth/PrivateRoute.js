// frontend/src/components/auth/PrivateRoute.js
import React, { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/auth';
import useChatStore from '../../store/chat';

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, token, user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const { startNewChat, setMessages } = useChatStore();
  
  // 监听用户变化，清除聊天记录
  useEffect(() => {
    if (isAuthenticated) {
      // 清除可能存在的前一个用户的聊天记录
      startNewChat();
      setMessages([]);
    }
  }, [isAuthenticated, user?.id, startNewChat, setMessages]);
  
  if (!isAuthenticated) {
    // 重定向到登录页面，并保存当前尝试访问的路径
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
};

export default PrivateRoute;