// src/utils/AlertService.js
import React from 'react';
import ReactDOM from 'react-dom/client';

// 弹窗组件
const AlertComponent = ({ message, type, onClose }) => {
  // 颜色主题
  const themes = {
    success: { bg: '#f6ffed', border: '#52c41a', color: '#52c41a', icon: '✓' },
    error: { bg: '#fff2f0', border: '#ff4d4f', color: '#ff4d4f', icon: '✕' },
    warning: { bg: '#fffbe6', border: '#faad14', color: '#faad14', icon: '⚠' },
    info: { bg: '#e6f7ff', border: '#1890ff', color: '#1890ff', icon: 'ℹ' }
  };
  
  const theme = themes[type] || themes.info;
  
  // 组件样式
  const style = {
    container: {
      padding: '10px 16px',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      backgroundColor: theme.bg,
      borderLeft: `4px solid ${theme.border}`,
      color: theme.color,
      fontSize: '14px',
      fontWeight: '500',
      margin: '10px 0',
      minWidth: '250px',
      animation: 'slideIn 0.3s ease'
    },
    icon: {
      fontSize: '16px',
      fontWeight: 'bold'
    },
    content: {
      flex: 1
    }
  };
  
  // 自动关闭
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div style={style.container}>
      <span style={style.icon}>{theme.icon}</span>
      <span style={style.content}>{message}</span>
    </div>
  );
};

// 样式表
const createStyles = () => {
  if (document.getElementById('alert-service-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'alert-service-styles';
  style.textContent = `
    @keyframes slideIn {
      0% { opacity: 0; transform: translateY(-20px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideOut {
      0% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-20px); }
    }
  `;
  document.head.appendChild(style);
};

// 创建或获取容器
const getContainer = () => {
  let container = document.getElementById('global-alert-container');
  
  if (!container) {
    container = document.createElement('div');
    container.id = 'global-alert-container';
    Object.assign(container.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '9999',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    });
    document.body.appendChild(container);
  }
  
  return container;
};

// 显示弹窗的函数
const showAlert = (message, type) => {
  // 创建样式
  createStyles();
  
  // 获取容器
  const container = getContainer();
  
  // 创建元素用于挂载弹窗
  const alertDiv = document.createElement('div');
  container.appendChild(alertDiv);
  
  // 创建React根
  const root = ReactDOM.createRoot(alertDiv);
  
  // 关闭函数
  const handleClose = () => {
    alertDiv.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
      root.unmount();
      if (container.contains(alertDiv)) {
        container.removeChild(alertDiv);
      }
    }, 300);
  };
  
  // 渲染弹窗
  root.render(
    <AlertComponent 
      message={message} 
      type={type} 
      onClose={handleClose} 
    />
  );
  
  // 返回关闭函数
  return handleClose;
};

// 导出弹窗服务
const AlertService = {
  success: (message) => showAlert(message, 'success'),
  error: (message) => showAlert(message, 'error'),
  warning: (message) => showAlert(message, 'warning'),
  info: (message) => showAlert(message, 'info')
};

export default AlertService;