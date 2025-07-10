import React, { useEffect } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom'; 
import useAuthStore from '../../store/auth';
import useChatStore from '../../store/chat';

const { Title, Text } = Typography;  // 确保包含 Text

const LoginPage = () => {
  const navigate = useNavigate();
  const { startNewChat, setMessages } = useChatStore();
  const { login, isAuthenticated, isLoading, error } = useAuthStore();

  useEffect(() => {
    // 如果已经认证，重定向到聊天页面
    if (isAuthenticated) {
      navigate('/chat');
    }
  }, [isAuthenticated, navigate]);
  
  useEffect(() => {
    if (error) {
      message.error(error);
    }
  }, [error]);

  const onFinish = async (values) => {
    const success = await login(values.username, values.password);
    if (success) {
      startNewChat();
      setMessages([]);
      message.success('登录成功！');
      navigate('/chat');
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      background: '#f0f2f5'
    }}>
      <Card style={{ width: 400, boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2}>RAG助手</Title>
          <Title level={4} style={{ marginTop: 0 }}>登录</Title>
        </div>
        
        <Form
          name="login"
          initialValues={{ remember: true }}
          onFinish={onFinish}
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名!' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码!' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              style={{ width: '100%' }}
              loading={isLoading}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
        
        {/* 添加注册链接 */}
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <Text type="secondary">
            还没有账户? <Link to="/register">立即注册</Link>
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;