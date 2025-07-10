import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Layout, Typography, Button, Space, Card, List, Tag, Upload, 
  Popconfirm, message, Spin, Empty, Tabs, Divider, Modal, Form, Input, Radio, Image
} from 'antd';
import { 
  ArrowLeftOutlined, FileOutlined, UploadOutlined, DeleteOutlined, 
  SyncOutlined, EditOutlined, InboxOutlined, FilePdfOutlined,
  FileWordOutlined, FileExcelOutlined, FileTextOutlined, FileUnknownOutlined,
  EyeOutlined, LinkOutlined
} from '@ant-design/icons';
import useKnowledgeStore from '../../store/knowledge';
import api from '../../api/index';
import ProcessingModal from '../../components/knowledge/ProcessingModal';
import { v4 as uuidv4 } from 'uuid';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;
const { TabPane } = Tabs;

const KnowledgeBaseDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { 
    currentKnowledgeBase, 
    isLoading, 
    isProcessing,
    error, 
    loadKnowledgeBase, 
    updateKnowledgeBase,
    deleteKnowledgeBase,
    deleteDocument,
    processKnowledgeBase,
    cancelProcessing,
  } = useKnowledgeStore();
  
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isProcessingModalVisible, setIsProcessingModalVisible] = useState(false);
  const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  
  // 加载知识库数据
  useEffect(() => {
    if (id) {
      loadKnowledgeBase(parseInt(id));
    }
  }, [id, loadKnowledgeBase]);
  
  // 错误处理
  useEffect(() => {
    if (error) {
      message.error(error);
    }
  }, [error]);
  
  // 初始化表单
  useEffect(() => {
    if (currentKnowledgeBase && isEditModalVisible) {
      form.setFieldsValue({
        name: currentKnowledgeBase.name,
        description: currentKnowledgeBase.description,
        chunk_size: currentKnowledgeBase.chunk_size,
        chunk_overlap: currentKnowledgeBase.chunk_overlap,
        merge_rows: currentKnowledgeBase.merge_rows,
        embedding_type: currentKnowledgeBase.embedding_type || 'remote'
      });
    }
  }, [currentKnowledgeBase, isEditModalVisible, form]);
  
  // 处理文件上传后，更新待处理文件列表
  useEffect(() => {
    if (currentKnowledgeBase && currentKnowledgeBase.documents) {
      const pendingDocs = currentKnowledgeBase.documents.filter(doc => !doc.processed);
      setPendingFiles(pendingDocs);
    }
  }, [currentKnowledgeBase]);
  
  if (isLoading && !currentKnowledgeBase) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }
  
  if (!currentKnowledgeBase) {
    return (
      <Card>
        <Empty description="未找到知识库" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button type="primary" onClick={() => navigate('/knowledge')}>
            返回列表
          </Button>
        </div>
      </Card>
    );
  }
  
  // 获取文件图标
  const getFileIcon = (filename) => {
    if (/\.pdf$/i.test(filename)) {
      return <FilePdfOutlined style={{ fontSize: 24, color: '#f5222d' }} />;
    } else if (/\.(doc|docx)$/i.test(filename)) {
      return <FileWordOutlined style={{ fontSize: 24, color: '#1890ff' }} />;
    } else if (/\.(xls|xlsx|csv)$/i.test(filename)) {
      return <FileExcelOutlined style={{ fontSize: 24, color: '#52c41a' }} />;
    } else if (/\.(txt|md)$/i.test(filename)) {
      return <FileTextOutlined style={{ fontSize: 24, color: '#faad14' }} />;
    } else {
      return <FileUnknownOutlined style={{ fontSize: 24, color: '#8c8c8c' }} />;
    }
  };
  
  // 文件预览功能
  const handlePreview = (file) => {
    setPreviewFile(file);
    setIsPreviewModalVisible(true);
  };
  
  // 渲染预览内容
  const renderPreviewContent = () => {
    if (!previewFile) return null;
    
    // 检查文件类型
    const filename = previewFile.filename || previewFile.name;
    const fileUrl = previewFile.file?.url || previewFile.url || '';
    
    if (/\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filename)) {
      // 图片文件预览
      return <Image src={fileUrl} alt={filename} style={{ maxWidth: '100%' }} />;
    } else if (/\.pdf$/i.test(filename)) {
      // PDF 预览
      return (
        <div style={{ height: '500px', width: '100%' }}>
          <iframe 
            src={fileUrl} 
            title={filename} 
            width="100%" 
            height="100%"
            style={{ border: 'none' }}
          />
        </div>
      );
    } else {
      // 其他文件类型，提供下载链接
      return (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          {getFileIcon(filename)}
          <p style={{ marginTop: 16 }}>无法预览此文件类型</p>
          <Button 
            type="primary"
            icon={<LinkOutlined />}
            href={fileUrl}
            target="_blank"
            style={{ marginTop: 16 }}
          >
            下载文件
          </Button>
        </div>
      );
    }
  };
  
  // 处理文件上传变更
  const handleUploadChange = (info) => {
    let fileList = [...info.fileList];
    
    // 限制只显示最近上传的5个文件
    fileList = fileList.slice(-5);
    
    // 更新状态
    setFileList(fileList);
    
    // 处理状态改变
    const { status, response } = info.file;
    
    if (status === 'done') {
      message.success(`${info.file.name} 上传成功`);
      // 清空文件列表
      setFileList([]);
      // 刷新知识库数据
      loadKnowledgeBase(parseInt(id));
    } else if (status === 'error') {
      message.error(`${info.file.name} 上传失败: ${info.file?.response?.error || '未知错误'}`);
    }
  };
  
  // 自定义上传方法
  const customUpload = async ({ file, onSuccess, onError, onProgress }) => {
    // 创建FormData对象
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // 显示上传进度
      onProgress({ percent: 0 });
      
      // 发送请求
      const response = await api.post(
        `/knowledge-base/${currentKnowledgeBase.id}/documents/`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress({ percent });
          },
        }
      );
      
      // 上传成功
      onSuccess(response.data);
    } catch (error) {
      console.error('上传文件失败:', error);
      onError(error);
    }
  };
  
  // 处理删除文件
  const handleDeleteDocument = async (docId) => {
    const success = await deleteDocument(currentKnowledgeBase.id, docId);
    if (success) {
      message.success('文档删除成功');
    }
  };
  
  // 处理知识库
  const handleProcessKnowledgeBase = async (forceCreate = false) => {
    try {
      // 如果没有处理中的文档且不是强制重建，提示用户
      if (!forceCreate && pendingFiles.length === 0) {
        message.info('没有需要处理的新文档');
        return;
      }
      
      // 生成任务ID
      const taskId = uuidv4();
      setCurrentTaskId(taskId);
      
      // 显示进度弹窗
      setIsProcessingModalVisible(true);
      
      // 调用处理API
      await processKnowledgeBase(currentKnowledgeBase.id, forceCreate, taskId);
    } catch (err) {
      console.error('处理知识库失败:', err);
      message.error('处理知识库失败');
      setIsProcessingModalVisible(false);
    }
  };
  
  // 处理取消知识库处理
  const handleCancelProcessing = async (taskId) => {
    try {
      await cancelProcessing(currentKnowledgeBase.id, taskId);
      message.info('已取消处理');
    } catch (err) {
      console.error('取消处理失败:', err);
    }
  };
  
  // 处理编辑知识库
  const showEditModal = () => {
    setIsEditModalVisible(true);
  };
  
  const handleEditCancel = () => {
    setIsEditModalVisible(false);
  };
  
  const handleEditSubmit = async () => {
    try {
      const values = await form.validateFields();
      const result = await updateKnowledgeBase(currentKnowledgeBase.id, values);
      if (result) {
        message.success('更新知识库成功');
        setIsEditModalVisible(false);
      }
    } catch (errorInfo) {
      console.error('表单验证失败:', errorInfo);
    }
  };
  
  // 处理删除知识库
  const handleDeleteKnowledgeBase = async () => {
    const success = await deleteKnowledgeBase(currentKnowledgeBase.id);
    if (success) {
      message.success('知识库删除成功');
      navigate('/knowledge');
    }
  };

  // 关闭处理弹窗
  const handleCloseProcessingModal = () => {
    setIsProcessingModalVisible(false);
    setCurrentTaskId(null);
    
    // 刷新知识库数据
    loadKnowledgeBase(parseInt(id));
  };
  
  // 渲染待处理文件
  const renderPendingFiles = () => {
    if (!pendingFiles || pendingFiles.length === 0) {
      return null;
    }
    
    return (
      <div style={{ marginTop: '12px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>待处理文件</div>
        <List
          dataSource={pendingFiles}
          renderItem={file => (
            <List.Item
              key={file.id}
              style={{
                padding: '8px',
                background: '#f9f9f9',
                borderRadius: '4px',
                marginBottom: '8px',
                border: '1px solid #f0f0f0'
              }}
              actions={[
                <Button 
                  size="small" 
                  danger 
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteDocument(file.id)}
                >
                  删除
                </Button>
              ]}
            >
              <List.Item.Meta
                avatar={getFileIcon(file.filename)}
                title={file.filename}
                description={<Tag color="orange">未处理</Tag>}
              />
            </List.Item>
          )}
        />
      </div>
    );
  };

  return (
    <Layout style={{ background: '#fff', borderRadius: 8, padding: 16, minHeight: 'calc(100vh - 112px)' }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space align="center">
            <Button 
              icon={<ArrowLeftOutlined />} 
              type="text"
              onClick={() => navigate('/knowledge')}
            />
            <Title level={4} style={{ margin: 0 }}>{currentKnowledgeBase.name}</Title>
            <Tag color={currentKnowledgeBase.embedding_type === 'local' ? 'green' : 'geekblue'}>
              {currentKnowledgeBase.embedding_type === 'local' ? '本地嵌入' : '远程嵌入'}
            </Tag>
          </Space>
          
          <Space>
            <Button 
              icon={<EditOutlined />} 
              onClick={showEditModal}
            >
              编辑
            </Button>
            <Popconfirm
              title="确定要删除此知识库吗？"
              description="删除后无法恢复，包括所有文档和向量数据库。"
              onConfirm={handleDeleteKnowledgeBase}
              okText="是"
              cancelText="否"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        </div>
        
        <Paragraph type="secondary">
          {currentKnowledgeBase.description || '无描述'}
        </Paragraph>
        
        <Tabs defaultActiveKey="1">
          <TabPane tab="文档管理" key="1">
            <Card title="文档处理" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 上传区域 - 包含了文字说明和上传控件 */}
                <div style={{ 
                  border: '1px dashed #d9d9d9',
                  borderRadius: '8px',
                  padding: '16px',
                  background: '#fafafa'
                }}>
                  <Dragger
                    name="file"
                    multiple={true}
                    fileList={fileList}
                    onChange={handleUploadChange}
                    customRequest={customUpload}
                    accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
                    style={{ maxHeight: '120px' }}
                  >
                    <div style={{ padding: '0' }}>
                      <p className="ant-upload-drag-icon" style={{ marginTop: 0, marginBottom: '-5px' }}>
                        <InboxOutlined />
                      </p>
                      <p className="ant-upload-text" style={{ marginBottom: '-10px' }}>点击或拖拽文件到此区域上传</p>
                      <p className="ant-upload-hint" style={{ fontSize: '12px', marginBottom: 0 }}>
                        支持PDF、Word、Excel、TXT等多种格式
                      </p>
                    </div>
                  </Dragger>

                  {/* 待处理文件区域 */}
                  {renderPendingFiles()}
                </div>
                
                {/* 处理按钮 */}
                <div style={{ textAlign: 'center', marginTop: '12px' }}>
                  <Space>
                    <Button 
                      type="primary" 
                      icon={<SyncOutlined />} 
                      onClick={() => handleProcessKnowledgeBase(false)}
                      loading={isProcessing}
                      disabled={pendingFiles.length === 0}
                    >
                      处理新文档
                    </Button>
                    <Button 
                      icon={<SyncOutlined />} 
                      onClick={() => handleProcessKnowledgeBase(true)}
                      loading={isProcessing}
                    >
                      重新处理全部
                    </Button>
                  </Space>
                </div>
              </div>
            </Card>
            
            <Card 
              title={`文档列表 (${currentKnowledgeBase.documents?.filter(doc => doc.processed).length || 0})`}
              style={{ marginBottom: 20 }} 
            >
              {currentKnowledgeBase.documents?.filter(doc => doc.processed).length > 0 ? (
                <List
                  dataSource={currentKnowledgeBase.documents.filter(doc => doc.processed)}
                  renderItem={doc => (
                    <List.Item
                      key={doc.id}
                      actions={[
                        <Popconfirm
                          title="确定要删除此文档吗？"
                          onConfirm={() => handleDeleteDocument(doc.id)}
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
                      ]}
                    >
                      <List.Item.Meta
                        avatar={getFileIcon(doc.filename)}
                        title={doc.filename}
                        description={
                          <Space>
                            <Tag color="success">已处理</Tag>
                            <Text type="secondary">
                              上传时间: {new Date(doc.uploaded_at).toLocaleString()}
                            </Text>
                            {doc.processing_error && (
                              <Tag color="error">处理错误</Tag>
                            )}
                          </Space>
                        }
                      />
                      {doc.processing_error && (
                        <div style={{ color: 'red', fontSize: '12px' }}>
                          {doc.processing_error}
                        </div>
                      )}
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="暂无已处理文档" />
              )}
            </Card>
          </TabPane>
          
          <TabPane tab="知识库配置信息" key="2">
            <Card style={{ marginBottom: 20 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text strong>嵌入模型类型:</Text>
                  <Paragraph>
                    {currentKnowledgeBase.embedding_type === 'local' 
                      ? '本地嵌入 (Ollama) - 支持长文本，最多8K token' 
                      : '远程嵌入 (SiliconFlow) - 支持短文本，最多8K token'}
                  </Paragraph>
                </div>
                
                <div>
                  <Text strong>块大小:</Text>
                  <Paragraph>{currentKnowledgeBase.chunk_size}</Paragraph>
                </div>
                
                <div>
                  <Text strong>块重叠大小:</Text>
                  <Paragraph>{currentKnowledgeBase.chunk_overlap}</Paragraph>
                </div>
                
                <div>
                  <Text strong>合并行数:</Text>
                  <Paragraph>{currentKnowledgeBase.merge_rows}</Paragraph>
                </div>
                
                <div>
                  <Text strong>创建时间:</Text>
                  <Paragraph>{new Date(currentKnowledgeBase.created_at).toLocaleString()}</Paragraph>
                </div>
                
                <div>
                  <Text strong>最后更新:</Text>
                  <Paragraph>{new Date(currentKnowledgeBase.updated_at).toLocaleString()}</Paragraph>
                </div>
              </Space>
            </Card>
          </TabPane>
        </Tabs>
      </Space>
      
      {/* 编辑知识库表单 */}
      <Modal
        title="编辑知识库"
        open={isEditModalVisible}
        onOk={handleEditSubmit}
        onCancel={handleEditCancel}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
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
              <Radio value="remote">远程嵌入 (SiliconFlow - bge-m3 )</Radio>
              <Radio value="local">本地嵌入 (Ollama - bge-m3)</Radio>
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
      
      {/* 处理进度弹窗 */}
      <ProcessingModal
        visible={isProcessingModalVisible}
        onClose={handleCloseProcessingModal}
        knowledgeBaseId={currentKnowledgeBase.id}
        taskId={currentTaskId}
        onCancel={handleCancelProcessing}
      />
      
      {/* 文件预览模态框 */}
      <Modal
        title={previewFile ? previewFile.filename || previewFile.name : '文件预览'}
        open={isPreviewModalVisible}
        onCancel={() => setIsPreviewModalVisible(false)}
        footer={null}
        width={800}
        centered
      >
        {renderPreviewContent()}
      </Modal>
    </Layout>
  );
};

export default KnowledgeBaseDetailPage;