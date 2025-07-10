import { create } from 'zustand';
import { chatAPI } from '../api/chat';

const useChatStore = create((set, get) => ({
  currentChatId: null,
  chatHistories: [],
  messages: [],
  isLoading: false,
  error: null,
  
  // 设置当前聊天ID
  setCurrentChatId: (id) => set({ currentChatId: id }),
  
  // 设置消息
  setMessages: (messages) => set({ messages }),
  
  // 设置加载状态
  setIsLoading: (isLoading) => set({ isLoading }),
  
  // 设置错误
  setError: (error) => set({ error }),
  
  // 加载聊天历史列表
  loadChatHistories: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await chatAPI.getChatHistories();
      set({
        chatHistories: response.data,
        isLoading: false,
      });
    } catch (error) {
      console.error("加载聊天历史失败:", error);
      set({
        isLoading: false,
        error: error.response?.data?.detail || '加载聊天历史失败',
      });
    }
  },
  
  // 加载特定聊天历史
  loadChatHistory: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const response = await chatAPI.getChatHistory(id);
      set({
        currentChatId: id,
        messages: response.data.messages,
        isLoading: false,
      });
    } catch (error) {
      console.error("加载聊天记录失败:", error);
      set({
        isLoading: false,
        error: error.response?.data?.detail || '加载聊天记录失败',
      });
    }
  },

  // 更新聊天历史
  updateChatHistory: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await chatAPI.updateChatHistory(id, data);
      
      // 更新本地状态
      set(state => ({
        chatHistories: state.chatHistories.map(chat => 
          chat.id === id ? { ...chat, ...data } : chat
        ),
        isLoading: false,
      }));
      
      return response.data;
    } catch (error) {
      console.error("更新聊天历史失败:", error);
      set({
        isLoading: false,
        error: error.response?.data?.detail || '更新聊天历史失败',
      });
      return null;
    }
  },
  
  // 发送消息
  sendMessage: async (message, model, useRag, knowledgeBase, systemPrompt = null, files = []) => {
    const currentChatId = get().currentChatId;

    // 检查模型参数
    if (!model) {
      console.error('没有指定模型');
      message.error('请选择一个可用的模型');
      return null;
    }
    
    // 先添加用户消息到UI
    const tempUserMessage = { 
      role: 'user', 
      content: message, 
      id: `temp-user-${Date.now()}`,
      attachments: files 
    };
    
    set(state => ({
      messages: [...state.messages, tempUserMessage],
      isLoading: true,
      error: null,
    }));
    
    try {
      // 准备表单数据（包含文件）
      const formData = new FormData();
      formData.append('message', message);
      if (currentChatId) {
        formData.append('history_id', currentChatId);
      }
      formData.append('model', model);
      formData.append('use_rag', useRag);
      formData.append('knowledge_base', knowledgeBase || '');
      
      // 添加系统提示词
      if (systemPrompt) {
        formData.append('system_prompt_id', systemPrompt.id);
      }
      
      // 添加文件
      files.forEach((file, index) => {
        formData.append(`files[]`, file.originFileObj);
      });
      
      const response = await chatAPI.sendMessageWithFiles(formData);
      
      // 更新用户消息，添加相关文档信息
      const userMessage = {
        ...tempUserMessage,
        related_docs: response.data.related_docs || [],
        attachments: files
      };
      
      // 添加助手回复到UI
      const assistantMessage = { 
        role: 'assistant', 
        content: response.data.message, 
        id: `temp-assistant-${Date.now()}`,
        thinking_process: response.data.thinking_process
      };
      
      set(state => ({
        messages: [
          ...state.messages.filter(m => m.id !== tempUserMessage.id),
          userMessage,
          assistantMessage
        ],
        currentChatId: response.data.history_id,
        isLoading: false,
      }));
      
      // 如果是新会话，刷新历史列表
      if (!currentChatId) {
        get().loadChatHistories();
      }
      
      return response.data;
    } catch (error) {
      console.error('发送消息错误:', error);
      // 错误处理，保留用户消息但标记错误
      set(state => ({
        messages: state.messages.map(m => 
          m.id === tempUserMessage.id 
            ? { ...m, error: true } 
            : m
        ),
        isLoading: false,
        error: error.response?.data?.detail || '发送消息失败',
      }));
      return null;
    }
  },
  
  // 编辑用户消息并重新生成回答
  editUserMessage: async (messageId, newContent) => {
    set({ isLoading: true });
    
    try {
      const state = get();
      const messages = state.messages;
      const messageIndex = messages.findIndex(m => m.id === messageId);
      
      if (messageIndex === -1 || messages[messageIndex].role !== 'user') {
        set({ isLoading: false });
        return;
      }
      
      // 更新用户消息
      const updatedMessages = [...messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: newContent,
      };
      
      // 查找该用户消息后的所有消息（需要被移除）
      const messagesAfter = updatedMessages.slice(messageIndex + 1);
      
      // 只保留编辑的消息及其之前的消息
      const newMessages = updatedMessages.slice(0, messageIndex + 1);
      
      // 更新消息列表
      set({
        messages: newMessages
      });
      
      // 获取当前的聊天配置
      const config = state.currentChatId 
        ? (state.chatHistories.find(h => h.id === state.currentChatId)?.config || {})
        : {};
      
      // 发送编辑后的消息
      const response = await chatAPI.sendMessage({
        message: newContent,
        history_id: state.currentChatId,
        model: config.model || 'deepseek-r1',
        use_rag: config.use_rag || false,
        knowledge_base: config.knowledge_base || '',
        system_prompt_id: config.system_prompt_id
      });
      
      // 添加新的助手回复
      const assistantMessage = { 
        role: 'assistant', 
        content: response.data.message, 
        id: `assistant-${Date.now()}`,
        thinking_process: response.data.thinking_process
      };
      
      set(state => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false
      }));
      
      return response.data;
    } catch (error) {
      console.error('编辑消息失败:', error);
      set({ isLoading: false });
      throw error;
    }
  },
  
  // 重新生成回复
  regenerateResponse: async (messageId) => {
    set({ isLoading: true });
    
    try {
      // 找到要重新生成的消息
      const state = get();
      const messages = state.messages;
      const messageIndex = messages.findIndex(m => m.id === messageId);
      
      if (messageIndex === -1) {
        set({ isLoading: false });
        return;
      }

      // 找到用户消息
      let userMessage = null;
      for (let i = messageIndex - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          userMessage = messages[i];
          break;
        }
      }
      
      if (!userMessage) {
        set({ isLoading: false });
        return;
      }

      // 修改要重新生成的消息的内容为"正在重新生成回答..."
      const updatedMessages = [...messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: "正在重新生成回答...",
        thinking_process: null
      };
      
      set({
        messages: updatedMessages
      });

      // 获取当前的聊天配置
      const config = state.currentChatId 
        ? (state.chatHistories.find(h => h.id === state.currentChatId)?.config || {})
        : {};

      // 重新发送用户消息并获取新回答
      const response = await chatAPI.sendMessage({
        message: userMessage.content,
        history_id: state.currentChatId,
        model: config.model || 'deepseek-r1',
        use_rag: config.use_rag || false,
        knowledge_base: config.knowledge_base || '',
        system_prompt_id: config.system_prompt_id
      });

      // 更新消息列表，替换原有的助手回复
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: response.data.message,
        thinking_process: response.data.thinking_process
      };
      
      set({
        messages: updatedMessages,
        isLoading: false
      });

      return response.data;
    } catch (error) {
      console.error('重新生成回复失败:', error);
      set({ isLoading: false });
      throw error;
    }
  },
  
  // 开始新聊天
  startNewChat: () => {
    console.log('开始新聊天 - Store Action');
    set({
      currentChatId: null,
      messages: [],
      isLoading: false,
      error: null,
    });
    // 返回true表示执行成功
    return true;
  },
  
  // 删除聊天历史
  deleteChatHistory: async (id) => {
    try {
      await chatAPI.deleteChatHistory(id);
      
      set(state => ({
        chatHistories: state.chatHistories.filter(chat => chat.id !== id),
      }));
      
      // 如果删除的是当前聊天，清空当前聊天
      if (get().currentChatId === id) {
        get().startNewChat();
      }
      
      return true;
    } catch (error) {
      console.error("删除聊天失败:", error);
      set({
        error: error.response?.data?.detail || '删除聊天失败',
      });
      return false;
    }
  },
}));

export default useChatStore;