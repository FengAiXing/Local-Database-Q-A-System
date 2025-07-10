import React, { useEffect, useState } from 'react';
import useAuthStore from './store/auth';
import useChatStore from './store/chat';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import api from './api/index';
import AlertService from './utils/AlertService';

// 页面组件
import LoginPage from './pages/auth/LoginPage';
import ChatPage from './pages/chat/ChatPage';
import KnowledgeBasePage from './pages/knowledge/KnowledgeBasePage';
import KnowledgeBaseDetailPage from './pages/knowledge/KnowledgeBaseDetailPage';
import SettingsPage from './pages/settings/SettingsPage';
import RegisterPage from './pages/auth/RegisterPage'; 
import ProfilePage from './pages/settings/ProfilePage';
import ErrorBoundary from './utils/ErrorBoundary';
// 布局组件
import MainLayout from './components/common/MainLayout';

// 认证组件
import PrivateRoute from './components/auth/PrivateRoute';

function App() {
  const { user, isAuthenticated } = useAuthStore();
  const { startNewChat, setMessages } = useChatStore();
  const [modelStatus, setModelStatus] = useState({ checked: false, hasActiveModels: false });

  // 当用户状态变化时，重置聊天状态和检查模型状态
  useEffect(() => {
    startNewChat();
    setMessages([]);
    
    // 检查模型状态
    if (isAuthenticated) {
      const checkModelStatus = async () => {
        try {
          const response = await api.get('/models/');
          // 只过滤活跃的模型
          const activeModels = response.data.filter(model => model.is_active === true);
          
          setModelStatus({
            checked: true,
            hasActiveModels: activeModels.length > 0
          });
          
          if (activeModels.length === 0) {
            AlertService.warning('系统没有可用的模型，请在管理界面添加并激活至少一个模型');
          }
        } catch (error) {
          console.error('检查模型状态失败', error);
          setModelStatus({
            checked: true,
            hasActiveModels: false
          });
        }
      };
      
      checkModelStatus();
    }
  }, [isAuthenticated, user?.id, startNewChat, setMessages]);
  
  return (
    <ErrorBoundary>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <Router>
        <Routes>
          {/* 公共路由 */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          
          {/* 私有路由 */}
          <Route path="/" element={
            <PrivateRoute>
              <MainLayout modelStatus={modelStatus} />
            </PrivateRoute>
          }>
            <Route index element={<Navigate to="/chat" />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="chat/:id" element={<ChatPage />} />
            <Route path="knowledge" element={<KnowledgeBasePage />} />
            <Route path="knowledge/:id" element={<KnowledgeBaseDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
          
          {/* 默认路由 */}
          <Route path="*" element={<Navigate to="/chat" />} />
        </Routes>
      </Router>
    </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;