// frontend/src/pages/knowledge/KnowledgeBasePage.js
import React, { useEffect, useState } from 'react';
import { Layout, Card, Button, Typography, List, Space, Tag, Empty, Modal, Form, Input, message, Radio } from 'antd';
import { PlusOutlined, DatabaseOutlined, FileOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import useKnowledgeStore from '../../store/knowledge';
import AlertService from '../../utils/AlertService';
const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const KnowledgeBasePage = () => {
  const navigate = useNavigate();
  const { 
    knowledgeBases, 
    isLoading, 
    error, 
    loadKnowledgeBases, 
    createKnowledgeBase 
  } = useKnowledgeStore();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    loadKnowledgeBases();
  }, [loadKnowledgeBases]);
  
  useEffect(() => {
    if (error) {
      message.error(error);
    }
  }, [error]);

  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const result = await createKnowledgeBase(values);
      if (result) {
        AlertService.success('创建知识库成功');
        setIsModalVisible(false);
        form.resetFields();
        
        // 导航到新创建的知识库详情页
        navigate(`/knowledge/${result.id}`);
      }
    } catch (errorInfo) {
      console.log('表单验证失败:', errorInfo);
      // 处理名称重复错误
      if (errorInfo.response && errorInfo.response.data && errorInfo.response.data.name) {
        AlertService.error(`创建失败: ${errorInfo.response.data.name}`);
      } else {
        AlertService.error('创建知识库失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout style={{ background: '#fff', borderRadius: 8, padding: 16, minHeight: 'calc(100vh - 112px)' }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>知识库管理</Title>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={showModal}
          >
            创建知识库
          </Button>
        </div>
        
        {knowledgeBases.length > 0 ? (
          <List
            grid={{ gutter: 16, column: 3 }}
            dataSource={knowledgeBases}
            loading={isLoading}
            renderItem={kb => (
              <List.Item>
                <Card
                  hoverable
                  onClick={() => navigate(`/knowledge/${kb.id}`)}
                  actions={[
                    <Button type="link" onClick={() => navigate(`/knowledge/${kb.id}`)}>
                      查看详情
                    </Button>
                  ]}
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Space align="center">
                      <DatabaseOutlined style={{ fontSize: 24, color: '#1890ff' }} />
                      <Title level={5} style={{ margin: 0 }}>{kb.name}</Title>
                    </Space>
                    <Paragraph ellipsis={{ rows: 2 }} type="secondary">
                      {kb.description || '暂无描述'}
                    </Paragraph>
                    <Space>
                      <Tag icon={<FileOutlined />} color="blue">{kb.documents_count || 0} 文档</Tag>
                      <Tag color={kb.embedding_type === 'local' ? 'green' : 'geekblue'}>
                        {kb.embedding_type === 'local' ? '本地嵌入' : '远程嵌入'}
                      </Tag>
                    </Space>
                  </Space>
                </Card>
              </List.Item>
            )}
          />
        ) : (
          <Empty 
            description={isLoading ? "加载中..." : "暂无知识库"} 
            image={Empty.PRESENTED_IMAGE_SIMPLE} 
          />
        )}
      </Space>
      
      {/* 创建知识库表单 */}
      <Modal
        title="创建知识库"
        open={isModalVisible}
        onOk={handleCreate}
        onCancel={handleCancel}
        okText="创建"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            chunk_size: 8000,
            chunk_overlap: 50,
            merge_rows: 2,
            embedding_type: 'local'
          }}
        >
          <Form.Item
            name="name"
            label="知识库名称"
            rules={[{ required: true, message: '请输入知识库名称' }]}
          >
            <Input placeholder="请输入知识库名称" />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={3} placeholder="请输入描述（可选）" />
          </Form.Item>
          
          <Form.Item
            name="embedding_type"
            label="嵌入模型类型"
            tooltip="选择使用远程API或本地Ollama进行嵌入（本地支持更长文本，远程需要递归分块）"
          >
            <Radio.Group>
              <Radio value="local">本地嵌入 (Ollama - bge-m3)</Radio>
              <Radio value="remote">远程嵌入 (SiliconFlow - bge-m3)</Radio>
            </Radio.Group>
          </Form.Item>
          
          <Form.Item
            name="chunk_size"
            label="块大小"
            rules={[{ required: true, message: '请输入块大小' }]}
            tooltip="文本分割器每个块的最大字符数"
          >
            <Input type="number" placeholder="输入数字，默认8000" />
          </Form.Item>
          
          <Form.Item
            name="chunk_overlap"
            label="块重叠"
            rules={[{ required: true, message: '请输入块重叠大小' }]}
            tooltip="文本分割器中相邻块之间的重叠字符数"
          >
            <Input type="number" placeholder="输入数字，默认50" />
          </Form.Item>
          
          <Form.Item
            name="merge_rows"
            label="合并行数"
            rules={[{ required: true, message: '请输入合并行数' }]}
            tooltip="表格文件（CSV/Excel）多少行合并为一个文本块"
          >
            <Input type="number" placeholder="输入数字，默认2" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default KnowledgeBasePage;