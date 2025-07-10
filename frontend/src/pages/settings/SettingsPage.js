import React, { useState, useEffect } from 'react';
import { Layout, Typography, Card, Tabs, Form, Input, Select, Button, Switch, Space, message, Tag, List, Popconfirm, Divider } from 'antd';
import { SaveOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import usePromptStore from '../../store/prompt';
import api from '../../api/index';
import AlertService from '../../utils/AlertService';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { TabPane } = Tabs;

const SettingsPage = () => {
  const [modelForm] = Form.useForm();
  const [promptForm] = Form.useForm();
  const [editPromptForm] = Form.useForm();
  
  const [editingPromptId, setEditingPromptId] = useState(null);
  const [isPromptModalVisible, setIsPromptModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modelList, setModelList] = useState([]);
  const [loadingModelList, setLoadingModelList] = useState(false);
  
  // 从提示词存储中获取状态和方法
  const { 
    systemPrompts, 
    isLoading, 
    error, 
    loadSystemPrompts, 
    createSystemPrompt, 
    updateSystemPrompt, 
    deleteSystemPrompt 
  } = usePromptStore();
  
  // 加载模型列表
  const loadModelList = async () => {
    setLoadingModelList(true);
    try {
      const response = await api.get('/models/');
      if (response.data && Array.isArray(response.data)) {
        // 只保留活跃的模型 - 后端已按order排序，这里不需要再排序
        const activeModels = response.data.filter(model => model.is_active === true);
        setModelList(activeModels);
        
        // 如果没有可用模型，显示提示
        if (activeModels.length === 0) {
          AlertService.warning('没有可用的模型，请在管理界面添加并激活模型');
        }
        
        // 检查当前选择的模型是否仍然有效
        const currentModel = modelForm.getFieldValue('defaultModel');
        if (currentModel && !activeModels.some(m => m.name === currentModel)) {
          AlertService.warning('您当前选择的默认模型已不可用，请重新选择');
          modelForm.setFieldsValue({ defaultModel: '' });
        }
      } else {
        setModelList([]);
        AlertService.warning('模型列表格式不正确');
      }
    } catch (error) {
      console.error('加载模型列表失败:', error);
      setModelList([]);
      AlertService.error('加载模型列表失败');
    } finally {
      setLoadingModelList(false);
    }
  };
  
  // 初始加载系统提示词和用户设置
  useEffect(() => {
    loadSystemPrompts();
    loadUserSettings();
    loadModelList();
  }, [loadSystemPrompts]);
  
  // 加载用户设置
  const loadUserSettings = async () => {
    try {
      const response = await api.get('/users/settings/');
      const settings = response.data;
      
      // 设置表单初始值
      modelForm.setFieldsValue({
        defaultModel: settings.default_model || '',
        temperature: settings.temperature || '0.1',
        defaultRag: settings.default_rag || false
      });
    } catch (error) {
      console.error('加载用户设置失败:', error);
      // 设置默认值
      modelForm.setFieldsValue({
        defaultModel: '',
        temperature: '0.1',
        defaultRag: false
      });
    }
  };
  
  // 处理错误消息
  useEffect(() => {
    if (error) {
      message.error(error);
    }
  }, [error]);
  
  // 提交模型设置
  const handleModelSubmit = async (values) => {
    // 验证选择的模型是否存在于活跃的模型列表中
    if (values.defaultModel && !modelList.some(m => m.name === values.defaultModel)) {
      AlertService.error('所选模型不可用，请重新选择');
      return;
    }
    
    setLoading(true);
    try {
      // 转换数据为后端需要的格式
      const settingsData = {
        default_model: values.defaultModel,
        temperature: values.temperature,
        default_rag: values.defaultRag
      };
      
      // 调用API保存设置
      const response = await api.post('/users/settings/', settingsData);
      AlertService.success('设置保存成功！');
      console.log('保存的设置:', response.data);
    } catch (error) {
      console.error('保存设置失败:', error);
      AlertService.error('保存设置失败: ' + (error.response?.data?.error || '未知错误'));
    } finally {
      setLoading(false);
    }
  };
  
  // 添加系统提示词
  const handleAddPrompt = async (values) => {
    const result = await createSystemPrompt({
      name: values.name,
      content: values.content
    });
    
    if (result) {
      promptForm.resetFields();
      setIsPromptModalVisible(false);
      AlertService.success('添加成功');
    }
  };
  
  // 编辑系统提示词
  const handleEditPrompt = (id) => {
    const prompt = systemPrompts.find(p => p.id === id);
    if (prompt) {
      setEditingPromptId(id);
      editPromptForm.setFieldsValue({
        name: prompt.name,
        content: prompt.content
      });
    }
  };
  
  // 保存编辑的提示词
  const handleSavePrompt = async (values) => {
    if (editingPromptId) {
      const result = await updateSystemPrompt(editingPromptId, values);
      if (result) {
        setEditingPromptId(null);
        editPromptForm.resetFields();
        AlertService.success('更新成功');
      }
    }
  };
  
  // 删除系统提示词
  const handleDeletePrompt = async (id) => {
    const success = await deleteSystemPrompt(id);
    if (success) {
      AlertService.success('删除成功');
    }
  };

  // 排序系统提示词 - 用户创建的在前，全局提示词在后
  const sortedPrompts = [...systemPrompts].sort((a, b) => {
    // 先按照是否为全局提示词排序（非全局在前）
    if (a.is_global !== b.is_global) {
      return a.is_global ? 1 : -1;
    }
    // 然后按创建时间排序（新的在前）
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <Layout style={{ background: '#fff', borderRadius: 8, padding: 16, minHeight: 'calc(100vh - 112px)' }}>
      <Title level={4}>设置</Title>
      
      <Tabs defaultActiveKey="1">
        <TabPane tab="模型设置" key="1">
          <Card>
            <Form 
              layout="vertical" 
              form={modelForm}
              onFinish={handleModelSubmit}
            >
              <Form.Item 
                label="默认模型" 
                name="defaultModel"
                tooltip="选择默认使用的LLM模型"
              >
                <Select
                  loading={loadingModelList}
                  placeholder="请选择默认模型"
                  notFoundContent="没有可用的模型，请在管理界面添加"
                >
                  {modelList.length > 0 ? (
                    modelList.map(model => (
                      <Option key={model.name} value={model.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{model.display_name || model.name}</span>
                          {model.is_free ? (
                            <Tag color="green">免费</Tag>
                          ) : (
                            <Tag color="orange">收费</Tag>
                          )}
                        </div>
                      </Option>
                    ))
                  ) : (
                    <Option value="" disabled>请先在管理界面添加模型</Option>
                  )}
                </Select>
              </Form.Item>
              
              <Form.Item 
                label="温度" 
                name="temperature"
                tooltip="控制生成内容的创造性，值越高越创造性，越低越确定性"
              >
                <Select>
                  <Option value="0">0.0 (最确定性)</Option>
                  <Option value="0.1">0.1 (低温度)</Option>
                  <Option value="0.5">0.5 (平衡)</Option>
                  <Option value="0.8">0.8 (较高创造性)</Option>
                  <Option value="1">1.0 (最高创造性)</Option>
                </Select>
              </Form.Item>
              
              <Form.Item 
                label="默认开启RAG" 
                name="defaultRag"
                valuePropName="checked"
                tooltip="是否默认开启知识库增强"
              >
                <Switch />
              </Form.Item>
              
              <Form.Item>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  icon={<SaveOutlined />} 
                  loading={loading}
                  disabled={modelList.length === 0} // 如果没有模型，禁用保存按钮
                >
                  保存设置
                </Button>
                {modelList.length === 0 && (
                  <Text type="danger" style={{ marginLeft: '10px' }}>
                    {/* 没有可用的模型，请先在管理界面添加模型 */}
                  </Text>
                )}
              </Form.Item>
            </Form>
          </Card>
        </TabPane>
        
        <TabPane tab="系统提示词" key="2">
          <Card
            title="系统提示词模板"
            extra={
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={() => setIsPromptModalVisible(true)}
              >
                添加模板
              </Button>
            }
          >
            {/* 添加提示词模态框 - 放在列表上方 */}
            {isPromptModalVisible && (
              <div style={{ marginBottom: 16 }}>
                <Card 
                  type="inner"
                  title="添加系统提示词" 
                  extra={
                    <Button 
                      type="text" 
                      danger
                      onClick={() => setIsPromptModalVisible(false)}
                    >
                      取消
                    </Button>
                  }
                >
                  <Form
                    form={promptForm}
                    layout="vertical"
                    onFinish={handleAddPrompt}
                  >
                    <Form.Item
                      name="name"
                      label="名称"
                      rules={[{ required: true, message: '请输入名称' }]}
                    >
                      <Input placeholder="输入提示词名称" />
                    </Form.Item>
                    
                    <Form.Item
                      name="content"
                      label="内容"
                      rules={[{ required: true, message: '请输入内容' }]}
                    >
                      <TextArea 
                        rows={6} 
                        placeholder="输入提示词内容" 
                      />
                    </Form.Item>
                    
                    <Form.Item>
                      <Button 
                        type="primary" 
                        htmlType="submit"
                        icon={<SaveOutlined />}
                        loading={isLoading}
                      >
                        保存
                      </Button>
                    </Form.Item>
                  </Form>
                </Card>
              </div>
            )}
            
            <List
              loading={isLoading}
              dataSource={sortedPrompts}
              renderItem={prompt => (
                <List.Item
                  actions={[
                    // 只对非全局提示词显示编辑按钮
                    !prompt.is_global && (
                      <Button 
                        type="text" 
                        icon={<EditOutlined />} 
                        onClick={() => handleEditPrompt(prompt.id)}
                      >
                        编辑
                      </Button>
                    ),
                    // 只对非全局提示词显示删除按钮
                    !prompt.is_global && (
                      <Popconfirm
                        title="确定要删除吗？"
                        onConfirm={() => handleDeletePrompt(prompt.id)}
                        okText="是"
                        cancelText="否"
                      >
                        <Button 
                          type="text" 
                          danger 
                          icon={<DeleteOutlined />}
                        >
                          删除
                        </Button>
                      </Popconfirm>
                    )
                  ].filter(Boolean)} // 过滤掉undefined项
                >
                  <List.Item.Meta
                    title={
                      <span>
                        {prompt.name}
                        {prompt.is_global && <Tag color="green" style={{marginLeft: '8px'}}>全局</Tag>}
                      </span>
                    }
                    description={
                      editingPromptId === prompt.id ? (
                        <Form
                          form={editPromptForm}
                          layout="vertical"
                          onFinish={handleSavePrompt}
                        >
                          <Form.Item
                            name="name"
                            rules={[{ required: true, message: '请输入名称' }]}
                          >
                            <Input placeholder="输入提示词名称" />
                          </Form.Item>
                          
                          <Form.Item
                            name="content"
                            rules={[{ required: true, message: '请输入内容' }]}
                          >
                            <TextArea 
                              rows={4} 
                              placeholder="输入提示词内容" 
                            />
                          </Form.Item>
                          
                          <Space>
                            <Button 
                              type="primary" 
                              htmlType="submit"
                            >
                              保存
                            </Button>
                            <Button 
                              onClick={() => setEditingPromptId(null)}
                            >
                              取消
                            </Button>
                          </Space>
                        </Form>
                      ) : (
                        <Paragraph ellipsis={{ rows: 2 }}>
                          {prompt.content}
                        </Paragraph>
                      )
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </TabPane>
        
        <TabPane tab="API配置" key="3">
          <Card title="模型API配置">
            <Paragraph type="secondary">
              暂不支持
            </Paragraph>
          </Card>
        </TabPane>
      </Tabs>
    </Layout>
  );
};

export default SettingsPage;