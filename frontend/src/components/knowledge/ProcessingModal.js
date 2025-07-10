import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Typography, Space } from 'antd';
import { SyncOutlined, CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { knowledgeAPI } from '../../api/knowledge';

const { Text, Paragraph } = Typography;

const ProcessingModal = ({ 
  visible, 
  onClose, 
  knowledgeBaseId, 
  taskId, 
  onCancel
}) => {
  const [status, setStatus] = useState('initializing');
  const [message, setMessage] = useState('正在初始化...');
  const [error, setError] = useState(null);
  const intervalRef = useRef(null); // 使用useRef存储interval ID
  const isCompletedRef = useRef(false); // 追踪是否已完成
  const retryCountRef = useRef(0); // 重试计数器

  // 启动和停止轮询
  useEffect(() => {
    // 创建清理轮询的函数
    const clearPolling = () => {
      if (intervalRef.current) {
        console.log('停止轮询');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    if (visible && knowledgeBaseId && taskId) {
      console.log('开始轮询进度信息:', knowledgeBaseId, taskId);
      isCompletedRef.current = false; // 重置完成标志
      retryCountRef.current = 0; // 重置重试计数器
      setError(null); // 清除之前的错误
      setStatus('initializing'); // 重置状态
      setMessage('正在初始化...'); // 重置消息
      
      // 立即查询一次进度
      fetchProgress();
      
      // 设置轮询间隔
      if (!intervalRef.current) {
        intervalRef.current = setInterval(fetchProgress, 1000);
      }
    } else {
      // 如果modal不可见，停止轮询
      clearPolling();
    }
    
    // 组件卸载时清理
    return clearPolling;
  }, [visible, knowledgeBaseId, taskId]);

  // 获取进度信息
  const fetchProgress = async () => {
    // 如果已完成或组件不可见，不再请求
    if (isCompletedRef.current || !visible || !knowledgeBaseId || !taskId) return;
    
    try {
      const response = await knowledgeAPI.getProcessingProgress(knowledgeBaseId, taskId);
      const data = response.data;
      
      console.log('获取进度信息:', data);
      retryCountRef.current = 0; // 成功获取数据，重置重试计数
      
      if (data.status) {
        setStatus(data.status);
      }
      
      if (data.message) {
        setMessage(data.message);
      }
      
      // 如果处理已完成或出错，停止轮询
      if (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled') {
        console.log(`任务已${data.status}，停止轮询`);
        
        // 标记为已完成
        isCompletedRef.current = true;
        
        // 明确停止轮询
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        
        if (data.status === 'error') {
          setError(data.message);
        }
      } else if (data.status === 'not_found') {
        // 如果多次获取不到任务，可能是后端尚未创建任务记录
        // 我们提供一个更友好的消息，并增加重试次数
        if (retryCountRef.current < 3) {
          console.log(`任务未找到，将继续重试，当前重试次数: ${retryCountRef.current}`);
          retryCountRef.current++;
          setMessage('正在启动处理任务...');
        } else {
          console.log('多次尝试后仍找不到任务，停止轮询');
          setMessage('找不到指定的任务，请重试');
          setStatus('not_found');
          isCompletedRef.current = true;
          
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }
    } catch (error) {
      console.error('获取进度信息失败:', error);
      retryCountRef.current++;
      
      if (retryCountRef.current > 5) {
        setError('获取进度信息失败，请重试');
        setStatus('error');
        
        // 出错次数过多时停止轮询
        isCompletedRef.current = true;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }
  };

  // 处理取消按钮点击
  const handleCancelProcess = async () => {
    try {
      await knowledgeAPI.cancelProcessing(knowledgeBaseId, taskId);
      setStatus('cancelled');
      setMessage('处理已取消');
      
      // 停止轮询
      isCompletedRef.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // 调用取消回调
      if (onCancel) {
        onCancel(taskId);
      }
    } catch (error) {
      // console.error('取消处理失败:', error);
      // setError('取消处理失败');
      
      // 即使取消失败，也设置状态为已取消
      setStatus('cancelled');
      setMessage('已取消处理');
      
      // 标记完成状态
      isCompletedRef.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  };

  // 处理模态框关闭
  const handleClose = () => {
    // 确保关闭时停止轮询
    isCompletedRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // 调用外部关闭回调
    if (onClose) {
      onClose();
    }
  };

  // 获取图标
  const getStatusIcon = () => {
    switch(status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 24 }} />;
      case 'error':
      case 'cancelled':
      // case 'not_found':
        return <CloseCircleOutlined style={{ color: '#f5222d', fontSize: 24 }} />;
      default:
        return <SyncOutlined spin style={{ color: '#1890ff', fontSize: 24 }} />;
    }
  };

  return (
    <Modal
      title="文档处理进度"
      open={visible}
      onCancel={handleClose}
      footer={[
        status === 'completed' || status === 'error' || status === 'cancelled' || status === 'not_found' ? (
          <Button key="ok" type="primary" onClick={handleClose}>
            确定
          </Button>
        ) : (
          <Button key="cancel" danger onClick={handleCancelProcess}>
            取消处理
          </Button>
        )
      ]}
      centered
      maskClosable={status === 'completed' || status === 'error' || status === 'cancelled' || status === 'not_found'}
      width={500}
    >
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {getStatusIcon()}
          
          <Paragraph>
            <Text strong>{message}</Text>
          </Paragraph>
          
          {error && (
            <Paragraph type="danger" style={{ marginTop: 16 }}>
              <InfoCircleOutlined /> 错误: {error}
            </Paragraph>
          )}
        </Space>
      </div>
    </Modal>
  );
};

export default ProcessingModal;