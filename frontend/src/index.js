// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorHandler from './utils/ErrorHandler';
import './utils/AlertService';

// 安装错误处理器，过滤React错误警告
ErrorHandler.install();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
