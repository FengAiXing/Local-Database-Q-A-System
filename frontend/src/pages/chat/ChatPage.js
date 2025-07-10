// 修改后的 frontend/src/pages/chat/ChatPage.js 文件

import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, List, Typography, Spin, Space, message, Tooltip } from 'antd';
import { 
  SendOutlined, 
  PlusOutlined, 
  DeleteOutlined, 
  FileImageOutlined,
  FileOutlined,
  PaperClipOutlined
} from '@ant-design/icons';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import useChatStore from '../../store/chat';
import useSettingsStore from '../../store/settings'; // 添加引入设置存储
import MessageItem from '../../components/chat/MessageItem';
import { v4 as uuidv4 } from 'uuid';
import FilePreview from '../../components/chat/FilePreview';
import AlertService from '../../utils/AlertService';

const { TextArea } = Input;
const { Title } = Typography;

const ChatPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const messageListRef = useRef(null);
  const textAreaRef = useRef(null);
  const inputAreaRef = useRef(null); // 添加一个新的ref用于整个输入区域
  
  // 从MainLayout获取配置状态
  const { 
    selectedModel, 
    setSelectedModel,
    useRAG, 
    setUseRAG,
    selectedKB,
    setSelectedKB,
    selectedPrompt,
    setSelectedPrompt,
    modelOptions
  } = useOutletContext();

  // 从设置存储中获取用户默认设置
  const { userSettings, loadUserSettings } = useSettingsStore();
  
  // 添加状态来强制重新渲染
  const [forceRender, setForceRender] = useState(0);
  
  // 聊天状态
  const { 
    messages, 
    currentChatId, 
    chatHistories,
    isLoading, 
    error,
    sendMessage,
    loadChatHistory,
    loadChatHistories,
    startNewChat,
  } = useChatStore();
  
  // 本地状态
  const [input, setInput] = useState('');
  const [fileList, setFileList] = useState([]);
  const [dropActive, setDropActive] = useState(false);
  const [textAreaHeight, setTextAreaHeight] = useState(72); // 初始高度为两行
  const [chatTitle, setChatTitle] = useState('新聊天');
  const [isSending, setIsSending] = useState(false); // 添加发送状态
  
  // 初始化
  useEffect(() => {
    // 加载聊天历史列表
    loadChatHistories();
    
    // 加载用户设置
    loadUserSettings();
    
    // 如果URL中有ID，加载该聊天历史
    if (id) {
      loadChatHistory(id);
    } else if (currentChatId) {
      navigate(`/chat/${currentChatId}`);
    } else {
      // 确保开始一个新聊天
      startNewChat();
      setChatTitle('新聊天');
    }
  }, [id, forceRender]); 
  
  // 当用户设置加载完成后，设置默认值
  useEffect(() => {
    if (userSettings) {
      // 如果有用户默认设置且当前没有选中模型，则使用默认设置
      if (userSettings.default_model && (!selectedModel || selectedModel === '')) {
        setSelectedModel(userSettings.default_model);
      }
      
      // 设置默认RAG状态
      if (userSettings.default_rag !== undefined && useRAG === undefined) {
        setUseRAG(userSettings.default_rag);
      }
      
      // 设置默认知识库（如果设置了）
      if (userSettings.knowledge_base && (!selectedKB || selectedKB === '')) {
        setSelectedKB(userSettings.knowledge_base);
      }
      
      // 设置默认系统提示词（如果设置了）
      if (userSettings.system_prompt_id && (!selectedPrompt || selectedPrompt === null)) {
        setSelectedPrompt(userSettings.system_prompt_id);
      }
    }
  }, [userSettings]);
  
  // 确保selectedModel有值，在modelOptions加载后检查一次
  useEffect(() => {
    // 如果modelOptions有数据但selectedModel没有值，尝试使用默认设置或第一个模型
    if (modelOptions && modelOptions.length > 0 && (!selectedModel || selectedModel === '')) {
      if (userSettings && userSettings.default_model) {
        // 检查默认模型是否在可用模型列表中
        const modelExists = modelOptions.some(model => model.name === userSettings.default_model);
        
        if (modelExists) {
          setSelectedModel(userSettings.default_model);
        } else {
          // 如果默认模型不可用，使用第一个可用模型
          setSelectedModel(modelOptions[0].name);
          AlertService.warning('您的默认模型不可用，已为您切换到其他可用模型');
        }
      } else {
        // 没有默认设置，使用第一个可用模型
        setSelectedModel(modelOptions[0].name);
      }
    }
  }, [modelOptions, selectedModel, userSettings]);
  
  // 监听currentChatId的变化，更新标题
  useEffect(() => {
    updateChatTitle();
  }, [currentChatId, chatHistories]);
  
  // 单独提取更新标题函数，方便重用
  const updateChatTitle = () => {
    if (!currentChatId) {
      setChatTitle('新聊天');
      return;
    }
    
    // 查找当前聊天记录
    const chat = chatHistories.find(c => c.id === parseInt(currentChatId));
    if (!chat) {
      setChatTitle('聊天');
      return;
    }
    
    const title = chat.title || '聊天';
    // 计算字符数，中文字符计为1，其他字符计为0.5
    const charCount = [...title].reduce((count, char) => {
      return count + (/[\u4e00-\u9fa5]/.test(char) ? 1 : 0.5);
    }, 0);
    
    if (charCount <= 6) {
      setChatTitle(title);
    } else {
      // 截取字符，保留约6个字符的长度
      let result = '';
      let currentCount = 0;
      
      for (const char of title) {
        const charWidth = /[\u4e00-\u9fa5]/.test(char) ? 1 : 0.5;
        if (currentCount + charWidth <= 5) { // 留1个字符的空间给"..."
          result += char;
          currentCount += charWidth;
        } else {
          break;
        }
      }
      
      setChatTitle(result + '...');
    }
  };
  
  // 在加载聊天历史后更新标题
  useEffect(() => {
    if (messages && messages.length > 0) {
      updateChatTitle();
    }
  }, [messages]);
  
  // 消息列表滚动到底部
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);
  
  // 更新输入框高度
  useEffect(() => {
    // 根据文件数量和输入内容调整输入框高度
    let baseHeight = 72; // 基础高度 - 两行
    const filesHeight = fileList.length > 0 ? Math.ceil(fileList.length / 4) * 70 : 0; // 文件预览高度，每行最多4个文件
    setTextAreaHeight(baseHeight + filesHeight);
  }, [fileList]);
  
  // 添加剪贴板事件监听
  useEffect(() => {
    const handlePaste = (e) => {
      if (!inputAreaRef.current) return;
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      let hasFiles = false;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // 处理图片
        if (item.type.indexOf('image/') === 0) {
          e.preventDefault(); // 阻止默认粘贴行为
          hasFiles = true;
          
          const blob = item.getAsFile();
          if (!blob) continue;
          
          // 创建类似FileList对象中的File对象
          const file = {
            id: uuidv4(),
            name: `粘贴的图片_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
            type: blob.type,
            size: blob.size,
            originFileObj: blob,
            preview: URL.createObjectURL(blob)
          };
          
          setFileList(prev => [...prev, file]);
          message.success('已添加图片');
        }
        // 处理文件
        else if (item.kind === 'file') {
          e.preventDefault(); // 阻止默认粘贴行为
          hasFiles = true;
          
          const blob = item.getAsFile();
          if (!blob) continue;
          
          const file = {
            id: uuidv4(),
            name: blob.name || `粘贴的文件_${new Date().toISOString().replace(/[:.]/g, '-')}`,
            type: blob.type,
            size: blob.size,
            originFileObj: blob,
            preview: blob.type.startsWith('image/') ? URL.createObjectURL(blob) : null
          };
          
          setFileList(prev => [...prev, file]);
          message.success('已添加文件');
        }
      }
      
      // 如果有处理文件，不需要处理文本
      if (!hasFiles && items.length > 0) {
        // 允许默认的文本粘贴行为继续进行
        return;
      }
    };
    
    // 为整个输入区域添加粘贴事件
    const inputArea = inputAreaRef.current;
    if (inputArea) {
      inputArea.addEventListener('paste', handlePaste);
    }
    
    return () => {
      if (inputArea) {
        inputArea.removeEventListener('paste', handlePaste);
      }
    };
  }, []);

  // 发送消息
  const handleSend = async () => {
    if ((!input.trim() && fileList.length === 0) || isSending) return;
    
    // 检查是否选择了模型，如果没有选择，使用默认模型或第一个可用模型
    let modelToUse = selectedModel;
    if (!modelToUse) {
      if (userSettings && userSettings.default_model) {
        modelToUse = userSettings.default_model;
      } else if (modelOptions && modelOptions.length > 0) {
        modelToUse = modelOptions[0].name;
      }
      
      if (!modelToUse) {
        AlertService.warning('请先选择一个模型');
        return;
      }
      
      // 更新选择的模型
      setSelectedModel(modelToUse);
    }

    const trimmedInput = input.trim();
    const filesToSend = [...fileList]; // 创建文件列表副本
    
    // 立即清空输入框和文件列表
    setInput('');
    setFileList([]);
    setIsSending(true); // 设置发送状态为true
    
    try {
      // 调用API发送文件
      await sendMessage(
        trimmedInput,
        modelToUse,
        useRAG,
        selectedKB,
        selectedPrompt ? { id: selectedPrompt, type: 'system_prompt' } : null,
        filesToSend
      );
      
      // 如果是新聊天且成功创建了会话，更新URL
      if (!id && currentChatId) {
        navigate(`/chat/${currentChatId}`, { replace: true });
        updateChatTitle(); // 确保标题更新
      }
    } catch (err) {
      console.error('发送消息失败:', err);
      AlertService.error('发送消息失败，请重试');
      
      // 如果发送失败，恢复输入内容和文件
      if (trimmedInput) setInput(trimmedInput);
      if (filesToSend.length > 0) setFileList(filesToSend);
    } finally {
      setIsSending(false); // 无论成功失败都重置发送状态
    }
  };
  
  // 处理消息编辑
  const handleEditMessage = (content) => {
    setInput(content);
    if (textAreaRef.current) {
      textAreaRef.current.focus();
    }
  };
  
  // 处理文件上传
  const handleFileUpload = (event) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      const newFiles = files.map(file => ({
        id: uuidv4(),
        name: file.name,
        type: file.type,
        size: file.size,
        originFileObj: file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      }));
      
      setFileList([...fileList, ...newFiles]);
    }
    
    // 清空input value，允许相同的文件被选择多次
    if (event.target) {
      event.target.value = null;
    }
  };
  
  // 处理文件删除
  const handleFileRemove = (fileToRemove) => {
    setFileList(fileList.filter(file => file.id !== fileToRemove.id));
  };
  
  // 处理拖放事件
  const handleDragOver = (e) => {
    e.preventDefault();
    setDropActive(true);
  };
  
  const handleDragLeave = () => {
    setDropActive(false);
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    setDropActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const newFiles = droppedFiles.map(file => ({
        id: uuidv4(),
        name: file.name,
        type: file.type,
        size: file.size,
        originFileObj: file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      }));
      
      setFileList([...fileList, ...newFiles]);
    }
  };
  
  // 处理文件添加
  const handleFileAdd = (file) => {
    console.log("文件已添加:", file.name);
  };
  
  // 渲染文件预览
  const renderFilePreview = () => {
    if (fileList.length === 0) return null;
    
    return (
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '8px',
        padding: '8px 0' 
      }}>
        {fileList.map(file => (
          <div 
            key={file.id} 
            style={{ 
              position: 'relative',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid #e6e6e6',
              background: '#f9f9f9',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {file.type.startsWith('image/') ? (
              <div style={{ position: 'relative', width: '70px' }}>
                <img 
                  src={file.preview} 
                  alt={file.name}
                  style={{
                    width: '70px',
                    height: '70px',
                    objectFit: 'cover'
                  }}
                />
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    background: 'rgba(255,255,255,0.8)',
                    borderRadius: '50%',
                    padding: 0,
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '10px'
                  }}
                  onClick={() => handleFileRemove(file)}
                />
              </div>
            ) : (
              <div style={{
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                maxWidth: '180px'
              }}>
                <FileOutlined style={{ fontSize: '18px' }} />
                <span style={{ 
                  fontSize: '12px', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  maxWidth: '120px'
                }}>
                  {file.name}
                </span>
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  style={{
                    padding: 0,
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '10px'
                  }}
                  onClick={() => handleFileRemove(file)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      background: '#ffffff'
    }}>
      {/* 聊天标题 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 0 16px 0',
        borderBottom: '1px solid #f0f0f0',
        marginBottom: '16px',
        flexShrink: 0
      }}>
        <Title level={4} style={{ margin: 0 }}>
          {chatTitle}
        </Title>
      </div>
      
      {/* 消息区域 */}
      <div 
        ref={messageListRef}
        style={{ 
          flex: 1,
          overflowY: 'auto',
          marginBottom: '16px',
          padding: '0 4px'
        }}
      >
        {messages && messages.length > 0 ? (
          <List
            itemLayout="horizontal"
            dataSource={messages}
            renderItem={message => (
              <MessageItem 
                message={message} 
                onEdit={handleEditMessage} 
              />
            )}
          />
        ) : (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100%' 
          }}>
            <div style={{ textAlign: 'center', color: '#999' }}>
              <div style={{ fontSize: 50, marginBottom: 20 }}>🌟</div>
              <div>开始聊天</div>
            </div>
          </div>
        )}
        
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Spin tip="思考中..." />
          </div>
        )}
      </div>
      
      {/* 底部输入区域 */}
      <div style={{
        padding: '10px 0',
        borderTop: '1px solid #f0f0f0',
        flexShrink: 0,
        marginLeft: 'auto',
        marginRight: 'auto',
        width: '92%', // 使输入框不那么宽
        maxWidth: '800px'
      }}>
        <div 
          ref={inputAreaRef} // 添加 ref 到整个输入区域
          style={{ 
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            border: dropActive ? '2px dashed #1890ff' : '1px solid #e0e0e0',
            borderRadius: '12px',
            minHeight: `${textAreaHeight}px`,
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            padding: '8px 12px 8px 52px', // 增加左边距，为加号按钮留出空间
            backgroundColor: '#fff'
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* 文件预览区域 */}
          {renderFilePreview()}
          
          {/* 输入框 */}
          <TextArea
            ref={textAreaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="发送消息或粘贴图片..."
            autoSize={{ minRows: 3, maxRows: 6 }} // 两行高度
            onPressEnter={e => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            style={{ 
              border: 'none',
              resize: 'none',
              boxShadow: 'none',
              outline: 'none',
              padding: '4px 0',
              fontSize: '16px',
              lineHeight: '1.5',
              backgroundColor: 'transparent'
            }}
            bordered={false}
            disabled={isSending} // 发送时禁用输入框
          />
          
          {/* 上传按钮 - 圆形边框样式 */}
          <div style={{ 
            position: 'absolute', 
            left: '16px', 
            bottom: '16px',
            zIndex: 1 
          }}>
            <Tooltip title="上传文件">
              <button
                style={{ 
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: '1px solid #d9d9d9',
                  background: 'white',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  cursor: isSending ? 'not-allowed' : 'pointer',
                  padding: 0,
                  transition: 'background-color 0.3s',
                  opacity: isSending ? 0.5 : 1
                }}
                onClick={() => document.getElementById('file-upload').click()}
                onMouseOver={(e) => !isSending && (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                disabled={isSending}
              >
                <PlusOutlined style={{ fontSize: '16px', color: '#595959' }} />
              </button>
            </Tooltip>
            <input
              id="file-upload"
              type="file"
              multiple
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              disabled={isSending}
            />
          </div>
          
          {/* 发送按钮 */}
          <div style={{ 
            position: 'absolute', 
            right: '12px', 
            bottom: '16px',
            zIndex: 1 
          }}>
            <Button 
              type="primary" 
              shape="circle"
              icon={<SendOutlined />} 
              onClick={handleSend} 
              loading={isLoading || isSending}
              disabled={(!input.trim() && fileList.length === 0) || isSending}
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '32px',
                height: '32px'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;