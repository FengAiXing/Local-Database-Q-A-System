// frontend/src/components/chat/MessageItem.js
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Typography, Avatar, Space, Tag, Collapse, Button, message as antMessage, Input, Modal } from 'antd';
import { 
  UserOutlined, 
  RobotOutlined, 
  FileOutlined, 
  BulbOutlined, 
  CopyOutlined,
  EditOutlined,
  RedoOutlined,
  CloseOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  FileImageOutlined,
  FileUnknownOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import useChatStore from '../../store/chat';
import CodeBlock from './CodeBlock'; // 导入我们新创建的CodeBlock组件
import api from '../../api/index'; // 直接导入 API 客户端

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;
const { TextArea } = Input;

const MessageItem = ({ message, onEdit }) => {
  const isUser = message.role === 'user';
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [actionsOpacity, setActionsOpacity] = useState(0);
  const [forceRender, setForceRender] = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const { regenerateResponse, editUserMessage } = useChatStore();
  const textAreaRef = useRef(null);
  const messageRef = useRef(null);
  const contentRef = useRef(null);
  const timeoutRef = useRef(null);
  const animationRef = useRef(null);
  const attachmentsRef = useRef(null);
  
  // 添加局部状态来管理内容和思考过程的显示
  const [localContent, setLocalContent] = useState(message.content);
  const [localThinking, setLocalThinking] = useState(message.thinking_process);
  const [regenerating, setRegenerating] = useState(false);
  
  // 使用useMemo来确保附件数据的稳定性
  const attachments = useMemo(() => {
    return message.attachments || [];
  }, [message.attachments]);

  // 强制重新渲染当前组件的函数
  const forceRerender = () => {
    setForceRender(prev => prev + 1);
  };

  // 自定义Markdown渲染组件
  const renderers = {
    // 代码块渲染 - 使用新的CodeBlock组件
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      
      return !inline ? (
        <CodeBlock className={className}>
          {String(children).replace(/\n$/, '')}
        </CodeBlock>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    // 表格渲染增强
    table({ node, children, ...props }) {
      return (
        <div style={{ overflowX: 'auto', margin: '1em 0' }}>
          <table style={{ 
            borderCollapse: 'collapse', 
            width: '100%',
            border: '1px solid #ddd'
          }} {...props}>
            {children}
          </table>
        </div>
      );
    },
    tableHead({ node, children, ...props }) {
      return <thead style={{ backgroundColor: '#f9f9f9' }} {...props}>{children}</thead>;
    },
    tableRow({ node, children, ...props }) {
      return <tr style={{ borderBottom: '1px solid #ddd' }} {...props}>{children}</tr>;
    },
    tableCell({ node, children, isHeader, ...props }) {
      return (
        <td style={{ 
          padding: '8px 12px', 
          borderRight: '1px solid #eee',
          textAlign: isHeader ? 'center' : 'left'
        }} {...props}>
          {children}
        </td>
      );
    },
    // 增强引用块
    blockquote({ node, children, ...props }) {
      return (
        <blockquote
          style={{
            borderLeft: '4px solid #ddd',
            paddingLeft: '16px',
            marginLeft: 0,
            color: '#666',
            fontStyle: 'italic'
          }}
          {...props}
        >
          {children}
        </blockquote>
      );
    }
  };

  // 处理公式显示
  useEffect(() => {
    // 在组件挂载后，使用MathJax渲染页面上的公式
    if (window.MathJax && contentRef.current) {
      try {
        // 确保MathJax已加载完成
        if (window.MathJax.typesetPromise) {
          window.MathJax.typesetPromise([contentRef.current])
            .catch(err => console.error("MathJax处理错误:", err));
        } else if (window.MathJax.typeset) {
          window.MathJax.typeset([contentRef.current]);
        }
      } catch (err) {
        console.error("MathJax渲染错误:", err);
      }
    }
  }, [localContent, forceRender]);

  // 确保附件可见性
  useEffect(() => {
    if (!attachments || attachments.length === 0) return;

    // 确保附件显示的函数
    const ensureAttachmentsVisible = () => {
      if (messageRef.current && attachmentsRef.current) {
        // 设置附件容器样式
        attachmentsRef.current.style.display = 'flex';
        attachmentsRef.current.style.visibility = 'visible';
        attachmentsRef.current.style.opacity = '1';
        
        // 设置每个附件项的样式
        const attachmentEls = attachmentsRef.current.querySelectorAll('.attachment-item');
        attachmentEls.forEach(el => {
          el.style.display = 'flex';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
        });
      }
    };

    // 初始立即执行
    ensureAttachmentsVisible();
    
    // 设置多个定时器确保附件显示
    const timers = [];
    [10, 50, 100, 300, 500, 1000, 2000, 3000].forEach(delay => {
      const timer = setTimeout(() => {
        ensureAttachmentsVisible();
        forceRerender();
      }, delay);
      timers.push(timer);
    });

    // 使用MutationObserver监听DOM变化
    const observer = new MutationObserver(() => {
      ensureAttachmentsVisible();
      forceRerender();
    });
    
    // 使用ResizeObserver监听尺寸变化
    const resizeObserver = new ResizeObserver(() => {
      ensureAttachmentsVisible();
      forceRerender();
    });
    
    // 开始监听
    if (messageRef.current) {
      observer.observe(messageRef.current, { 
        childList: true, 
        subtree: true,
        attributes: true,
        characterData: true
      });
      resizeObserver.observe(messageRef.current);
    }
    
    // 设置定期检查的间隔器
    const interval = setInterval(() => {
      ensureAttachmentsVisible();
      forceRerender();
    }, 1000); // 每秒检查一次
    
    // 滚动事件处理
    const scrollHandler = () => {
      ensureAttachmentsVisible();
      forceRerender();
    };
    
    // 添加滚动事件监听
    window.addEventListener('scroll', scrollHandler, { passive: true });
    document.addEventListener('visibilitychange', scrollHandler);
    
    // 清理函数
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      clearInterval(interval);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('scroll', scrollHandler);
      document.removeEventListener('visibilitychange', scrollHandler);
    };
  }, [attachments, forceRender]);
  
  // 处理页面可见性变化
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 页面变为可见时，强制重新渲染
        forceRerender();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
  
  // 滚动/页面尺寸变化时触发更新
  useEffect(() => {
    const handleUpdate = () => {
      forceRerender();
    };
    
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate);
    
    // 初始加载后强制更新一次
    const initialTimer = setTimeout(handleUpdate, 500);
    
    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate);
      clearTimeout(initialTimer);
    };
  }, []);
  
  // 添加淡入效果的操作按钮
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    if (hovered) {
      // 快速淡入 - 0.1秒
      timeoutRef.current = setTimeout(() => {
        setActionsOpacity(1);
      }, 100);
    } else {
      // 立即淡出
      setActionsOpacity(0);
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [hovered]);

  // 更新本地状态 - 当消息内容变化时
  useEffect(() => {
    setLocalContent(message.content);
    setLocalThinking(message.thinking_process);
  }, [message.content, message.thinking_process]);

  // 前处理Markdown内容
  const processContent = (content) => {
    if (!content) return '';
    
    // 清理<think>标签
    content = content.replace(/<think>.*?<\/think>/gs, '').replace(/<\/?think>/g, '');
    
    // 确保数学公式与markdown格式兼容
    content = content.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
    content = content.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
    
    return content;
  };
  
  const handleCopy = () => {
    const content = processContent(localContent);
    navigator.clipboard.writeText(content)
      .then(() => {
        antMessage.success('内容已复制到剪贴板');
      })
      .catch(() => {
        antMessage.error('复制失败，请手动复制');
      });
  };
  
  // 增强的重新生成功能 - 直接使用API调用
  const handleRegenerate = async () => {
    if (!isUser && !regenerating) {
      setRegenerating(true);
      try {
        // 设置状态为"正在重新生成回答..."
        setLocalContent("正在重新生成回答...");
        
        // 找到对应的用户消息 - 先尝试从DOM中查找
        let userMessage = null;
        const allMessages = document.querySelectorAll('.message-item');
        let currentIndex = -1;
        
        // 在DOM中查找当前消息位置
        allMessages.forEach((el, idx) => {
          if (el.dataset.messageId === message.id) {
            currentIndex = idx;
          }
        });
        
        // 往前查找最近的用户消息
        if (currentIndex > 0) {
          for (let i = currentIndex - 1; i >= 0; i--) {
            const el = allMessages[i];
            const role = el.classList.contains('user-message') ? 'user' : 'assistant';
            if (role === 'user') {
              // 从元素中提取消息内容
              const contentEl = el.querySelector('.markdown-content');
              if (contentEl) {
                userMessage = contentEl.textContent.trim();
                break;
              }
            }
          }
        }
        
        // 如果DOM中找不到，尝试从store中获取
        if (!userMessage) {
          const chatStore = useChatStore.getState();
          const messages = chatStore.messages || [];
          const msgIndex = messages.findIndex(m => m.id === message.id);
          
          if (msgIndex > 0) {
            // 向前查找用户消息
            for (let i = msgIndex - 1; i >= 0; i--) {
              if (messages[i].role === 'user') {
                userMessage = messages[i].content;
                break;
              }
            }
          }
        }
        
        // 如果还是找不到，使用默认消息
        if (!userMessage) {
          console.warn('找不到对应的用户消息，使用默认消息');
          userMessage = "请继续";
        }
        
        // 获取当前会话配置和ID
        const historyId = window.location.pathname.split('/').pop();
        const chatStore = useChatStore.getState();
        const chatHistories = chatStore.chatHistories || [];
        let config = {};
        
        // 尝试从聊天历史中获取配置
        if (historyId && !isNaN(historyId)) {
          const currentChat = chatHistories.find(h => h.id === parseInt(historyId));
          if (currentChat && currentChat.config) {
            config = currentChat.config;
          }
        }
        
        // 创建请求数据
        const requestData = {
          message: userMessage,
          history_id: historyId !== 'chat' ? historyId : null,
          model: config.model || 'deepseek-r1',
          use_rag: config.use_rag || false,
          knowledge_base: config.knowledge_base || '',
          system_prompt_id: config.system_prompt_id || null
        };
        
        console.log('开始调用API重新生成回复...', requestData);
        
        // 直接调用API
        const response = await api.post('/chat/', requestData);
        
        // 处理响应
        if (response && response.data) {
          console.log('API调用成功，更新消息内容');
          setLocalContent(response.data.message);
          
          // 更新思考过程
          if (response.data.thinking_process) {
            setLocalThinking(response.data.thinking_process);
          }
          
          // 同时更新消息对象（如果需要）
          message.content = response.data.message;
          if (response.data.thinking_process) {
            message.thinking_process = response.data.thinking_process;
          }
          
          antMessage.success('回答已重新生成');
        } else {
          console.log('API返回数据格式不正确');
          antMessage.error('重新生成失败：数据格式不正确');
          // 恢复原始内容
          setLocalContent(message.content);
        }
      } catch (error) {
        console.error('重新生成回复失败:', error);
        antMessage.error('重新生成回复失败');
        
        // 恢复原始内容
        setLocalContent(message.content);
      } finally {
        setRegenerating(false);
      }
    }
  };
  
  const handleEdit = () => {
    if (isUser) {
      setEditing(true);
      setEditedContent(message.content);
      setTimeout(() => {
        if (textAreaRef.current) {
          textAreaRef.current.focus();
        }
      }, 0);
    }
  };
  
  const handleSaveEdit = async () => {
    if (editedContent.trim() === message.content.trim()) {
      // 如果内容没有变化，直接取消编辑
      setEditing(false);
      return;
    }
    
    try {
      antMessage.loading({
        content: '保存中...',
        key: 'savingEdit',
        duration: 0
      });
      
      // 调用编辑消息函数
      await editUserMessage(message.id, editedContent);
      
      setEditing(false);
      antMessage.success({
        content: '编辑成功',
        key: 'savingEdit',
        duration: 2
      });
    } catch (error) {
      antMessage.error({
        content: '编辑失败',
        key: 'savingEdit',
        duration: 2
      });
    }
  };
  
  const handleCancelEdit = () => {
    setEditing(false);
  };
  
  // 处理图片预览 - 优化图片URL获取逻辑
  const handleImagePreview = (file) => {
    const fileUrl = getFileUrl(file);
    setPreviewImage(fileUrl);
    setPreviewVisible(true);
  };
  
  // 辅助函数：获取文件URL
  const getFileUrl = (file) => {
    // 优先使用url字段
    if (file.url) {
      return file.url;
    }
    
    // 如果有path尝试构建URL
    if (file.path) {
      // 确保返回绝对URL
      if (file.path.startsWith('http')) {
        return file.path;
      } else if (file.path.startsWith('/')) {
        return `${window.location.origin}${file.path}`;
      } else {
        return `${window.location.origin}/media/chat_uploads/${file.path.split('/').pop()}`;
      }
    }
    
    // 如果有preview使用preview
    if (file.preview) {
      return file.preview;
    }
    
    // 如果有originFileObj尝试创建URL
    if (file.originFileObj) {
      return URL.createObjectURL(file.originFileObj);
    }
    
    // 返回空字符串表示无法获取URL
    return '';
  };
  
  // 关闭图片预览
  const handlePreviewCancel = () => {
    setPreviewVisible(false);
  };
  
  const renderThinkingProcess = () => {
    if (!localThinking) {
      return null;
    }
    
    return (
      <div style={{ marginBottom: 8 }}>
        <Collapse ghost defaultActiveKey={[]}>
          <Panel 
            header={
              <Tag color="purple" icon={<BulbOutlined />}>思考过程</Tag>
            } 
            key="thinking-process"
          >
            <div 
              style={{ 
                background: '#f9f0ff', 
                borderRadius: '6px',
                padding: '12px 16px'
              }}
            >
              <ReactMarkdown
                components={renderers}
              >
                {localThinking}
              </ReactMarkdown>
            </div>
          </Panel>
        </Collapse>
      </div>
    );
  };
  
  const renderRelatedDocs = () => {
    if (!message.related_docs || message.related_docs.length === 0) {
      return null;
    }
    
    return (
      <div style={{ marginTop: 8 }}>
        <Collapse ghost>
          <Panel 
            header={
              <Tag color="blue">检索到 {message.related_docs.length} 条相关内容</Tag>
            } 
            key="related-docs"
          >
            {message.related_docs.map((doc, index) => (
              <div 
                key={index} 
                style={{ 
                  padding: '8px 12px',
                  marginBottom: 8,
                  background: '#f5f5f5',
                  borderRadius: '6px'
                }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space>
                    <FileOutlined />
                    <Text strong>相关内容 {index + 1}</Text>
                  </Space>
                  <Paragraph style={{ margin: 0 }}>
                    {doc.content || doc.page_content}
                  </Paragraph>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {doc.metadata?.score && `相关度: ${(doc.metadata.score * 100).toFixed(1)}%`}
                  </Text>
                </Space>
              </div>
            ))}
          </Panel>
        </Collapse>
      </div>
    );
  };

  // 获取文件图标 - 优化图标选择逻辑
  const getFileIcon = (fileType) => {
    if (!fileType) return <FileUnknownOutlined style={{ fontSize: 20, color: '#8c8c8c' }} />;
    
    if (fileType.startsWith('image/')) {
      return <FileImageOutlined style={{ fontSize: 20, color: '#f759ab' }} />;
    } else if (fileType.includes('pdf')) {
      return <FilePdfOutlined style={{ fontSize: 20, color: '#f5222d' }} />;
    } else if (fileType.includes('word') || fileType.includes('doc')) {
      return <FileWordOutlined style={{ fontSize: 20, color: '#1890ff' }} />;
    } else if (fileType.includes('excel') || fileType.includes('sheet') || fileType.includes('csv')) {
      return <FileExcelOutlined style={{ fontSize: 20, color: '#52c41a' }} />;
    } else if (fileType.includes('text')) {
      return <FileTextOutlined style={{ fontSize: 20, color: '#faad14' }} />;
    }
    
    return <FileUnknownOutlined style={{ fontSize: 20, color: '#8c8c8c' }} />;
  };
  
  // 修改后的附件渲染函数 - 关键优化点
  const renderAttachments = () => {
    // 防止没有附件时渲染
    if (!attachments || attachments.length === 0) {
      return null;
    }
    
    return (
      <div 
        ref={attachmentsRef}
        style={{ 
          marginTop: 8, 
          marginBottom: 8,
          width: '100%',
          position: 'relative',
          zIndex: 5,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          opacity: 1,
          visibility: 'visible'
        }}
        className="attachments-container"
      >
        {attachments.map((file, index) => {
          // 处理文件URL - 使用辅助函数获取URL
          const fileUrl = getFileUrl(file);
          
          const isImage = file.type && file.type.startsWith('image/');
          const key = `attachment-${message.id}-${index}-${file.id || index}-${forceRender}`;
          
          if (isImage && fileUrl) {
            // 图片类型
            return (
              <div 
                key={key}
                className="attachment-item"
                onClick={() => handleImagePreview(file)}
                style={{ 
                  position: 'relative',
                  cursor: 'pointer',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  width: '100px',
                  height: '100px',
                  border: '1px solid #e0e0e0',
                  backgroundColor: '#f9f9f9',
                  flexShrink: 0,
                  opacity: 1,
                  zIndex: 10,
                  visibility: 'visible',
                  display: 'flex'
                }}
              >
                <img 
                  src={fileUrl}
                  alt={file.name || "附件图片"}
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    opacity: 1,
                    visibility: 'visible'
                  }}
                  onError={(e) => {
                    // 显示错误占位图标
                    e.target.style.display = 'none';
                    e.target.parentNode.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#f5f5f5;"><span style="font-size:24px;color:#bfbfbf">📷</span></div>`;
                  }}
                />
              </div>
            );
          } else {
            // 其他文件类型
            return (
              <div 
                key={key}
                className="attachment-item"
                style={{ 
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid #e6e6e6',
                  background: '#f9f9f9',
                  padding: '10px',
                  minWidth: '180px',
                  maxWidth: '300px',
                  flexShrink: 0,
                  opacity: 1,
                  zIndex: 10,
                  visibility: 'visible',
                  display: 'flex'
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center'
                }}>
                  {getFileIcon(file.type)}
                  <div style={{ 
                    marginLeft: '8px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '150px'
                  }}>
                    {file.name}
                  </div>
                </div>
              </div>
            );
          }
        })}
      </div>
    );
  };
  
  // 操作按钮 - 固定在右下角
  const renderActions = () => {
    if (editing) return null;
    
    return (
      <div 
        style={{ 
          position: 'absolute',
          right: '16px',
          bottom: '8px', 
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          zIndex: 50,
          transition: 'opacity 0.1s ease',
          opacity: actionsOpacity,
          backgroundColor: 'white',
          borderRadius: '4px',
          padding: '2px 4px',
          boxShadow: actionsOpacity > 0 ? '0 2px 8px rgba(0,0,0,0.15)' : 'none'
        }}
      >
        <Button 
          type="text" 
          size="small" 
          icon={<CopyOutlined />} 
          onClick={handleCopy}
        >
          复制
        </Button>
        
        {isUser ? (
          <Button 
            type="text" 
            size="small" 
            icon={<EditOutlined />} 
            onClick={handleEdit}
          >
            编辑
          </Button>
        ) : (
          <Button 
            type="text" 
            size="small" 
            icon={<RedoOutlined />} 
            onClick={handleRegenerate}
            loading={regenerating}
          >
            重新回答
          </Button>
        )}
      </div>
    );
  };
  
  if (editing) {
    // 编辑状态下，显示类似ChatGPT的编辑框
    return (
      <div style={{ 
        width: '100%',
        backgroundColor: '#f1f1f1',
        borderRadius: '12px',
        padding: '16px',
        margin: '8px 0 30px 0',
        border: 'none' // 去掉蓝色边框
      }}>
        <div>
          <TextArea
            ref={textAreaRef}
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            autoSize={{ minRows: 1, maxRows: 6 }}
            placeholder="你是谁"
            style={{ 
              border: 'none',
              width: '100%',
              backgroundColor: 'transparent',
              padding: '0',
              fontSize: '16px',
              resize: 'none',
              boxShadow: 'none', // 去除TextArea的默认聚焦样式
              outline: 'none' // 去除浏览器默认聚焦样式
            }}
          />
        </div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end',
          marginTop: '16px'
        }}>
          <Button 
            style={{ 
              marginRight: '8px',
              borderRadius: '20px',
              backgroundColor: 'white',
              color: '#000',
              fontWeight: 'normal',
              border: 'none',
              padding: '0 16px',
              height: '36px'
            }}
            onClick={handleCancelEdit}
          >
            取消
          </Button>
          <Button 
            type="primary"
            style={{ 
              backgroundColor: '#1e1e1e',
              borderRadius: '20px',
              color: 'white',
              fontWeight: 'normal',
              border: 'none',
              padding: '0 16px',
              height: '36px'
            }}
            onClick={handleSaveEdit}
          >
            发送
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      ref={messageRef}
      style={{
        position: 'relative',
        width: '100%',
        padding: '8px 16px',
        paddingBottom: '32px', // 为底部操作按钮留出空间
        marginBottom: '16px',
        background: isUser ? 'transparent' : '#f7f7f8',
        minHeight: '70px', // 确保有足够空间显示内容和按钮
        zIndex: 1
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={isUser ? "message-item user-message" : "message-item assistant-message"}
      data-message-id={message.id}
      data-has-attachments={attachments?.length > 0 ? 'true' : 'false'}
      data-force-render={forceRender} // 添加forceRender属性辅助重渲染
    >
      <div style={{
        display: 'flex',
        maxWidth: '90%',
        margin: '0 auto',
      }}>
        {/* 头像 */}
        <div style={{ marginRight: '12px', marginTop: '4px', flexShrink: 0 }}>
          <Avatar 
            icon={isUser ? <UserOutlined /> : <RobotOutlined />}
            style={{ 
              backgroundColor: isUser ? '#1890ff' : '#52c41a',
              width: '36px',
              height: '36px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              fontSize: '18px'
            }}
          />
        </div>
        
        {/* 消息内容 */}
        <div
          ref={contentRef}
          style={{ 
            flex: 1, 
            overflow: 'visible', // 确保内容不被裁剪
            width: '100%',
            position: 'relative', // 加强定位
            zIndex: 2
          }}
          className="message-content"
        >
          {/* 渲染思考过程(仅助手) */}
          {!isUser && renderThinkingProcess()}
          
          {/* 渲染文件附件(如果存在) - 确保必须放在顶部，不会被下面的内容覆盖 */}
          {isUser && attachments && attachments.length > 0 && (
            <div style={{ position: 'relative', zIndex: 20 }}>
              {renderAttachments()}
            </div>
          )}
          
          {/* 主要消息内容 */}
          <div 
            style={{ 
              padding: '0',
              wordBreak: 'break-word',
              overflow: 'visible',
              position: 'relative',
              zIndex: 1
            }}
            className="markdown-content"
          >
            <ReactMarkdown
              components={renderers}
            >
              {processContent(localContent)}
            </ReactMarkdown>
          </div>
          
          {/* 渲染相关文档(仅用户消息) */}
          {isUser && renderRelatedDocs()}
        </div>
      </div>
      
      {/* 操作按钮区域（固定在消息右下角） */}
      {renderActions()}
      
      {/* 图片预览模态框 */}
      <Modal
        open={previewVisible}
        title={null}
        footer={null}
        onCancel={handlePreviewCancel}
        width="70%"
        centered
        closeIcon={<CloseOutlined style={{ color: 'white', fontSize: '20px' }} />}
        style={{ top: 0 }}
        bodyStyle={{ 
          padding: 0,
          overflow: 'hidden',
          height: 'calc(100vh - 100px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'rgba(0, 0, 0, 0.85)'
        }}
      >
        <img 
          alt="预览图片" 
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%',
            objectFit: 'contain'
          }} 
          src={previewImage} 
        />
      </Modal>
    </div>
  );
};

export default MessageItem;