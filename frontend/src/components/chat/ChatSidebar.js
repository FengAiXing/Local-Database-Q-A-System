// 完整修复版 ChatSidebar.js
import React, { useEffect, useState, useCallback } from 'react';
import { List, Typography, Button, Popconfirm, Input, message } from 'antd';
import { 
  MessageOutlined, 
  DeleteOutlined, 
  MoreOutlined, 
  EditOutlined 
} from '@ant-design/icons';
import useChatStore from '../../store/chat';

const { Text } = Typography;

const ChatSidebar = ({ onSelectChat }) => {
  const { 
    chatHistories, 
    currentChatId, 
    loadChatHistories, 
    deleteChatHistory,
    updateChatHistory,
    startNewChat
  } = useChatStore();

  // 添加状态用于重命名和菜单控制
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [menuOpen, setMenuOpen] = useState({});

  useEffect(() => {
    loadChatHistories();
  }, [loadChatHistories]);

  // 处理聊天选择
  const handleSelect = useCallback((id) => {
    // 如果正在编辑，不处理选择事件
    if (editingChatId !== null) return;
    
    if (onSelectChat) {
      onSelectChat(id);
    }
  }, [editingChatId, onSelectChat]);

  // 处理删除确认
  const handleDeleteConfirm = useCallback((id, e) => {
    // 阻止事件冒泡和默认行为
    if (e) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
    }
    
    // 执行删除
    deleteChatHistory(id).then(success => {
      if (success) {
        message.success('聊天已删除');
        
        // 关闭菜单
        setMenuOpen(prev => ({...prev, [id]: false}));
        
        if (id === parseInt(currentChatId)) {
          // 先创建一个新聊天
          startNewChat();
          // 然后通知父组件切换到新聊天 (null 表示新聊天)
          if (onSelectChat) {
            onSelectChat(null);
          }
        }
      }
    });
    
    return false; // 确保不会继续传播事件
  }, [currentChatId, deleteChatHistory, onSelectChat, startNewChat]);

  // 处理删除取消
  const handleDeleteCancel = useCallback((id, e) => {
    // 阻止事件冒泡和默认行为
    if (e) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
    }
    
    // 关闭菜单
    setMenuOpen(prev => ({...prev, [id]: false}));
    
    return false; // 确保不会继续传播事件
  }, []);

  // 开始重命名
  const handleStartRename = useCallback((chat, e) => {
    // 阻止事件冒泡和默认行为
    if (e) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
    }
    
    setEditingChatId(chat.id);
    setEditingTitle(chat.title || '');
    
    // 关闭菜单
    setMenuOpen(prev => ({...prev, [chat.id]: false}));
    
    return false; // 确保不会继续传播事件
  }, []);

  // 提交重命名
  const handleRenameSubmit = useCallback((e) => {
    // 阻止事件冒泡和默认行为
    if (e) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
    }
    
    if (editingTitle.trim() && editingChatId) {
      updateChatHistory(editingChatId, { title: editingTitle.trim() })
        .then((result) => {
          if (result) {
            setEditingChatId(null);
            message.success('重命名成功');
          } else {
            message.error('重命名失败');
            setEditingChatId(null);
          }
        })
        .catch(() => {
          message.error('重命名失败');
          setEditingChatId(null);
        });
    } else {
      setEditingChatId(null);
    }
    
    return false; // 确保不会继续传播事件
  }, [editingChatId, editingTitle, updateChatHistory]);

  // 取消重命名
  const handleRenameCancel = useCallback((e) => {
    // 阻止事件冒泡和默认行为
    if (e) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
    }
    
    setEditingChatId(null);
    
    return false; // 确保不会继续传播事件
  }, []);

  // 处理输入框按键事件
  const handleInputKeyDown = useCallback((e) => {
    e.stopPropagation();
    
    if (e.key === 'Enter') {
      handleRenameSubmit(e);
    } else if (e.key === 'Escape') {
      handleRenameCancel(e);
    }
  }, [handleRenameSubmit, handleRenameCancel]);

  // 处理菜单按钮点击
  const handleMenuClick = useCallback((chatId, e) => {
    // 阻止事件冒泡和默认行为
    if (e) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
    }
    
    // 切换菜单状态
    setMenuOpen(prev => {
      const newState = {...prev};
      // 关闭所有其他菜单
      Object.keys(newState).forEach(key => {
        newState[key] = false;
      });
      // 切换当前菜单
      newState[chatId] = !prev[chatId];
      return newState;
    });
    
    return false; // 确保不会继续传播事件
  }, []);

  // 阻止输入框点击事件冒泡
  const handleInputClick = useCallback((e) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    return false;
  }, []);

  return (
    <div style={{ padding: '16px 0' }}>
      <List
        dataSource={chatHistories}
        renderItem={chat => (
          <List.Item
            style={{ 
              cursor: 'pointer',
              padding: '8px 16px',
              backgroundColor: chat.id === parseInt(currentChatId) ? '#e6f7ff' : 'transparent',
              borderRadius: 4,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            onClick={() => handleSelect(chat.id)}
          >
            <div style={{ flex: 1, maxWidth: 'calc(100% - 30px)', overflow: 'hidden' }}>
              {editingChatId === chat.id ? (
                // 编辑模式
                <Input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={handleInputKeyDown}
                  onClick={handleInputClick}
                  autoFocus
                  size="small"
                  style={{ width: '100%' }}
                />
              ) : (
                // 显示模式
                <List.Item.Meta
                  title={<Text ellipsis style={{ maxWidth: '100%' }}>{chat.title}</Text>}
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(chat.created_at).toLocaleString()}
                    </Text>
                  }
                />
              )}
            </div>
            
            {/* 操作菜单 */}
            <div style={{ position: 'relative' }}>
              <Button 
                type="text" 
                icon={<MoreOutlined />} 
                size="small"
                onClick={(e) => handleMenuClick(chat.id, e)}
                style={{ marginLeft: 8 }}
              />
              
              {/* 下拉菜单 */}
              {menuOpen[chat.id] && (
                <div 
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    zIndex: 1000,
                    background: 'white',
                    boxShadow: '0 3px 6px rgba(0,0,0,0.16)',
                    borderRadius: '4px',
                    minWidth: '120px',
                    padding: '4px 0'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 重命名选项 */}
                  <div 
                    style={{ 
                      padding: '8px 12px', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onClick={(e) => handleStartRename(chat, e)}
                  >
                    <EditOutlined /> 重命名
                  </div>
                  
                  {/* 删除选项 */}
                  <Popconfirm
                    title="确定要删除这个对话吗？"
                    onConfirm={(e) => handleDeleteConfirm(chat.id, e)}
                    onCancel={(e) => handleDeleteCancel(chat.id, e)}
                    okText="是"
                    cancelText="否"
                    placement="right"
                  >
                    <div 
                      style={{ 
                        padding: '8px 12px', 
                        cursor: 'pointer',
                        color: '#ff4d4f',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DeleteOutlined /> 删除
                    </div>
                  </Popconfirm>
                </div>
              )}
            </div>
          </List.Item>
        )}
      />
    </div>
  );
};

export default ChatSidebar;