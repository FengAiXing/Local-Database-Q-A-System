import React, { useState, useEffect } from 'react';
import AlertService from '../../utils/AlertService';
import { 
  Form, 
  Input, 
  Button, 
  Card, 
  Typography, 
  Tabs, 
  Avatar, 
  Row, 
  Col,
  Space
} from 'antd';
import { 
  UserOutlined, 
  LockOutlined, 
  MailOutlined, 
  SafetyOutlined,
  SettingOutlined,
  EditOutlined
} from '@ant-design/icons';
import api from '../../api/index';
import useAuthStore from '../../store/auth';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const ProfilePage = () => {
  const [passwordForm] = Form.useForm();
  const [userInfoForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const { user, updateUser, logout } = useAuthStore();
  const [registrationTime, setRegistrationTime] = useState('');
  const [activeTab, setActiveTab] = useState('1');
  const navigate = useNavigate();
  
  useEffect(() => {
    // 加载用户个人资料
    const fetchUserProfile = async () => {
      try {
        const response = await api.get('/users/profile/');
        setUserInfo(response.data);
        
        // 保存注册时间，避免被编辑
        const formattedTime = response.data.date_joined ? 
          new Date(response.data.date_joined).toLocaleString() : '';
        setRegistrationTime(formattedTime);
        
        // 设置表单初始值
        userInfoForm.setFieldsValue({
          username: response.data.username,
          email: response.data.email,
        });
      } catch (error) {
        AlertService.error('获取用户资料失败');
      }
    };
    
    fetchUserProfile();
  }, [userInfoForm]);
  
  const handlePasswordChange = async (values) => {
    setLoading(true);
    try {
      await api.put('/users/change-password/', {
        old_password: values.old_password,
        new_password: values.new_password,
        confirm_password: values.confirm_password
      });
      
      // 成功提示弹窗
      AlertService.success('您的密码已成功更新，系统将在3秒后自动退出登录。');
      
      // 重置表单
      passwordForm.resetFields();
      
      // 设置定时器，3秒后登出并重定向到登录页面
      setTimeout(() => {
        // 调用登出函数
        logout();
        // 重定向到登录页面
        navigate('/login');
      }, 3000);
      
    } catch (error) {
      // 错误提示弹窗
      let errorMsg = '修改密码失败，请重试';
      
      if (error.response && error.response.data) {
        const errors = error.response.data;
        if (errors.old_password) {
          errorMsg = `当前密码错误: ${errors.old_password}`;
        } else if (errors.new_password) {
          errorMsg = `修改失败: ${errors.new_password}`;
        } else if (errors.confirm_password) {
          errorMsg = `修改失败: ${errors.confirm_password}`;
        } else if (errors.detail) {
          errorMsg = errors.detail;
        }
      }
      
      AlertService.error(errorMsg);

    } finally {
      setLoading(false);
    }
  };
  
  const handleEditProfile = () => {
    setIsEditing(true);
  };
  
  const handleCancelEdit = () => {
    // 重置表单到原始值
    userInfoForm.setFieldsValue({
      username: userInfo.username,
      email: userInfo.email,
    });
    setIsEditing(false);
  };
  
  const handleSaveProfile = async () => {
    try {
      const values = await userInfoForm.validateFields();
      setLoading(true);
      
      try {
        // 发送更新请求
        const response = await api.put('/users/profile/', values);
        setUserInfo(response.data);
        
        // 成功提示弹窗
        AlertService.success('您的个人资料已成功保存。');

        
        setIsEditing(false);
        
        // 更新本地存储的用户信息
        if (updateUser) {
          updateUser({
            ...user,
            username: values.username,
            email: values.email
          });
        }
      } catch (error) {
        let errorMsg = '更新个人资料失败，请重试';
        
        if (error.response && error.response.data) {
          const errors = error.response.data;
          if (errors.username) {
            errorMsg = `用户名错误: ${errors.username}`;
          } else if (errors.email) {
            errorMsg = `邮箱错误: ${errors.email}`;
          } else if (errors.detail) {
            errorMsg = errors.detail;
          }
        }
        
        AlertService.error(errorMsg);

      } finally {
        setLoading(false);
      }
    } catch (validationError) {
      // 表单验证失败
    }
  };

  return (
    <div className="profile-container" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <Title level={2} style={{ textAlign: 'center', marginBottom: '24px' }}>用户资料</Title>
      
      <Row gutter={24}>
        {/* 用户卡片 - 左侧 */}
        <Col xs={24} md={8}>
          <Card bordered={true} style={{ marginBottom: '24px', borderRadius: '4px' }}>
            <div style={{ textAlign: 'center' }}>
              <Avatar 
                size={100} 
                icon={<UserOutlined />} 
                style={{ backgroundColor: '#1890ff', marginBottom: '16px' }}
              />
              <Title level={3} style={{ margin: '8px 0' }}>
                {userInfo?.username || '加载中...'}
              </Title>
              <div style={{ marginBottom: '16px' }}>
                <MailOutlined style={{ marginRight: '8px' }} />
                <Text>{userInfo?.email || '加载中...'}</Text>
              </div>
              
              <Button 
                type="primary" 
                icon={<EditOutlined />} 
                onClick={handleEditProfile}
                style={{ width: '80%', marginBottom: '16px' }}
              >
                编辑个人资料
              </Button>
              
              <div style={{ textAlign: 'left', marginTop: '16px' }}>
                <Text style={{ display: 'block', color: '#999' }}>
                  注册时间: {registrationTime || '加载中...'}
                </Text>
              </div>
            </div>
          </Card>
        </Col>
        
        {/* 内容区域 - 右侧 */}
        <Col xs={24} md={16}>
          <Card 
            bordered={true} 
            style={{ borderRadius: '4px' }}
          >
            <Tabs 
              activeKey={activeTab}
              onChange={setActiveTab}
              tabPosition="top"
              style={{ marginBottom: '16px' }}
            >
              <TabPane 
                tab={<Space><UserOutlined />个人信息</Space>} 
                key="1"
              >
                <Form
                  form={userInfoForm}
                  layout="vertical"
                  initialValues={userInfo}
                  disabled={!isEditing}
                >
                  <Form.Item
                    name="username"
                    label={<><span style={{color: 'red'}}></span> 用户名</>}
                    rules={[
                      { required: true, message: '请输入用户名' },
                      { min: 3, message: '用户名至少需要3个字符' }
                    ]}
                  >
                    <Input 
                      prefix={<UserOutlined />} 
                      placeholder="用户名" 
                      size="large"
                    />
                  </Form.Item>
                  
                  <Form.Item
                    name="email"
                    label={<><span style={{color: 'red'}}></span> 邮箱</>}
                    rules={[
                      { required: true, message: '请输入邮箱' },
                      { type: 'email', message: '请输入有效的邮箱地址' }
                    ]}
                  >
                    <Input 
                      prefix={<MailOutlined />} 
                      placeholder="邮箱" 
                      size="large"
                    />
                  </Form.Item>
                  
                  <Form.Item label="注册时间">
                    <Input
                      value={registrationTime}
                      disabled
                      size="large"
                    />
                  </Form.Item>
                  
                  {isEditing && (
                    <Form.Item>
                      <Space>
                        <Button 
                          type="primary" 
                          onClick={handleSaveProfile}
                          loading={loading}
                        >
                          保存
                        </Button>
                        <Button onClick={handleCancelEdit}>
                          取消
                        </Button>
                      </Space>
                    </Form.Item>
                  )}
                </Form>
              </TabPane>
              
              <TabPane 
                tab={<Space><SafetyOutlined />修改密码</Space>} 
                key="2"
              >
                <Form
                  form={passwordForm}
                  layout="vertical"
                  onFinish={handlePasswordChange}
                >
                  <Form.Item
                    name="old_password"
                    label="当前密码"
                    rules={[{ required: true, message: '请输入当前密码' }]}
                  >
                    <Input.Password 
                      prefix={<LockOutlined />} 
                      placeholder="请输入当前密码" 
                      size="large" 
                    />
                  </Form.Item>
                  
                  <Form.Item
                    name="new_password"
                    label="新密码"
                    rules={[
                      { required: true, message: '请输入新密码' },
                      { min: 8, message: '密码长度至少8个字符' }
                    ]}
                  >
                    <Input.Password 
                      prefix={<LockOutlined />} 
                      placeholder="请输入新密码" 
                      size="large" 
                    />
                  </Form.Item>
                  
                  <Form.Item
                    name="confirm_password"
                    label="确认新密码"
                    dependencies={['new_password']}
                    rules={[
                      { required: true, message: '请确认新密码' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('new_password') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('两次输入的密码不匹配!'));
                        },
                      }),
                    ]}
                  >
                    <Input.Password 
                      prefix={<LockOutlined />} 
                      placeholder="请确认新密码" 
                      size="large" 
                    />
                  </Form.Item>
                  
                  <Form.Item>
                    <Button 
                      type="primary" 
                      htmlType="submit" 
                      loading={loading}
                      size="large"
                      icon={<SafetyOutlined />}
                      style={{ width: '100%' }}
                    >
                      修改密码
                    </Button>
                  </Form.Item>
                </Form>
              </TabPane>
              
              <TabPane 
                tab={<Space><SettingOutlined />账户设置</Space>} 
                key="3"
              >
                <div style={{ padding: '40px 0' }}>
                  <Title level={4}>账户设置</Title>
                  <Text>
                    您可以在这里管理您的账户设置和隐私偏好。
                  </Text>
                  <div style={{ marginTop: '20px' }}>
                    <Text type="secondary">
                      目前暂无更多设置选项
                    </Text>
                  </div>
                </div>
              </TabPane>
            </Tabs>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ProfilePage;