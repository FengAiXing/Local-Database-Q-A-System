import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Avatar, Dropdown, Select, Switch, Space, Tag } from 'antd';
import { 
  MessageOutlined, 
  DatabaseOutlined, 
  SettingOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  DownOutlined,
  AppstoreOutlined,
  CheckOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/auth';
import useChatStore from '../../store/chat';
import useKnowledgeStore from '../../store/knowledge';
import usePromptStore from '../../store/prompt';
import useSettingsStore from '../../store/settings'; // 引入设置存储
import ChatSidebar from '../chat/ChatSidebar';
import api from '../../api/index';
import { settingsAPI } from '../../api/index';
import AlertService from '../../utils/AlertService';

const { Header, Sider, Content } = Layout;
const { Option } = Select;

const MainLayout = ({ modelStatus }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [siderVisible, setSiderVisible] = useState(true);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const { logout, user } = useAuthStore();
  const { startNewChat } = useChatStore();
  
  // 引入需要的状态
  const { knowledgeBases, loadKnowledgeBases } = useKnowledgeStore();
  const { systemPrompts, loadSystemPrompts } = usePromptStore();
  const { userSettings, loadUserSettings } = useSettingsStore(); // 引入设置存储
  
  // 添加选择状态
  const [selectedModel, setSelectedModel] = useState('');
  const [useRAG, setUseRAG] = useState(false);
  const [selectedKB, setSelectedKB] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  
  // 添加状态变量来存储模型列表
  const [modelOptions, setModelOptions] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  
  // 加载模型列表的函数
  const loadModelList = async () => {
    setLoadingModels(true);
    try {
      const response = await api.get('/models/');
      if (response.data && Array.isArray(response.data)) {
        // 只保留活跃的模型 - 后端已经按order排序
        const activeModels = response.data.filter(model => model.is_active === true);
        setModelOptions(activeModels);
        
        // 如果没有激活的模型，重置当前选择
        if (activeModels.length === 0) {
          setSelectedModel('');
          AlertService.warning('没有可用的模型，请在管理界面添加并激活LLM模型');
        }
        
        console.log("成功加载模型列表:", activeModels);
      } else {
        console.log("API返回格式不正确，没有找到模型");
        setModelOptions([]);
        setSelectedModel('');
        AlertService.warning('加载模型列表失败，请在管理界面检查模型配置');
      }
    } catch (error) {
      console.error("加载模型列表失败:", error);
      setModelOptions([]);
      setSelectedModel('');
      AlertService.error('加载模型列表失败，请检查网络连接');
    } finally {
      setLoadingModels(false);
    }
  };
  
  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // 初始加载知识库、提示词列表、用户设置和模型列表
  useEffect(() => {
    loadKnowledgeBases();
    loadSystemPrompts();
    loadUserSettings();
    loadModelList();
  }, [loadKnowledgeBases, loadSystemPrompts, loadUserSettings]);

  // 当用户设置加载完成后，设置默认选项
  useEffect(() => {
    if (userSettings) {
      console.log('加载到用户设置:', userSettings);
      
      // 如果当前没有选择模型，使用用户默认设置
      if (!selectedModel && userSettings.default_model) {
        setSelectedModel(userSettings.default_model);
      }
      
      // 设置默认RAG状态
      if (useRAG === false && userSettings.default_rag) {
        setUseRAG(userSettings.default_rag);
      }
      
      // 设置知识库
      if (!selectedKB && userSettings.knowledge_base) {
        setSelectedKB(userSettings.knowledge_base);
      }
      
      // 设置系统提示词
      if (!selectedPrompt && userSettings.system_prompt_id) {
        setSelectedPrompt(userSettings.system_prompt_id);
      }
    }
  }, [userSettings]);

  // 在模型列表加载完成后，检查是否需要自动选择
  useEffect(() => {
    if (modelOptions && modelOptions.length > 0) {
      // 如果有用户设置但没有选择模型，检查默认模型是否可用
      if (userSettings && userSettings.default_model && !selectedModel) {
        // 验证默认模型是否在可用列表中
        const defaultModelExists = modelOptions.some(
          model => model.name === userSettings.default_model && model.is_active
        );
        
        if (defaultModelExists) {
          // 使用用户默认设置
          setSelectedModel(userSettings.default_model);
          console.log(`从用户设置中自动选择模型: ${userSettings.default_model}`);
        } else {
          // 默认模型不可用，使用列表中的第一个模型
          setSelectedModel(modelOptions[0].name);
          console.log(`默认模型不可用，选择第一个可用模型: ${modelOptions[0].name}`);
        }
      } 
      // 如果没有选择模型且没有默认设置，使用第一个可用模型
      else if (!selectedModel && modelOptions.length > 0) {
        setSelectedModel(modelOptions[0].name);
        console.log(`没有默认设置，选择第一个可用模型: ${modelOptions[0].name}`);
      }
    }
  }, [modelOptions, userSettings, selectedModel]);
  
  // 获取当前选中的菜单项
  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith('/chat')) return ['1'];
    if (path.startsWith('/knowledge')) return ['2'];
    if (path.startsWith('/settings')) return ['3'];
    return ['1'];
  };
  
  // 处理模型选择，添加收费提示
  const handleModelSelect = (modelName) => {
    const selectedModelInfo = modelOptions.find(m => m.name === modelName);
    
    // 如果选择的是收费模型，显示提示
    if (selectedModelInfo && !selectedModelInfo.is_free) {
      AlertService.info('您选择的是收费模型，使用时将产生费用');
    }
    
    setSelectedModel(modelName);
  };
  
  // 新建聊天处理函数
  const handleNewChat = () => {
    console.log('主布局 - 处理新建聊天');
    
    // 检查是否有选择模型或者能够自动选择
    if (!selectedModel) {
      if (userSettings && userSettings.default_model) {
        // 验证默认模型是否在可用列表中
        const defaultModelExists = modelOptions.some(
          model => model.name === userSettings.default_model && model.is_active
        );
        
        if (defaultModelExists) {
          setSelectedModel(userSettings.default_model);
        } else if (modelOptions.length > 0) {
          setSelectedModel(modelOptions[0].name);
        } else {
          AlertService.warning('请先选择一个模型');
          return;
        }
      } else if (modelOptions.length > 0) {
        setSelectedModel(modelOptions[0].name);
      } else {
        AlertService.warning('请先选择一个模型');
        return;
      }
    }
    
    const success = startNewChat();
    if (success) {
      navigate('/chat', { replace: true });
    }
  };
  
  // 处理导航跳转 - 修复路由导航问题
  const handleNavigation = (path) => {
    console.log(`Navigating to: ${path}`);
    
    // 强制导航并刷新页面
    window.location.href = path;
    
    // 或者使用下面的代码尝试不刷新页面直接导航
    // setTimeout(() => {
    //   navigate(path, { replace: true });
    // }, 0);
  };
  
  // 用户菜单
  const userMenu = {
    items: [
      {
        key: 'profile',
        label: '个人资料',
        icon: <UserOutlined />,
        onClick: () => navigate('/profile'), 
      },
      {
        type: 'divider',
      },
      {
        key: 'logout',
        label: '退出登录',
        icon: <LogoutOutlined />,
        danger: true,
      },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') {
        logout();
        navigate('/login');
      }
    },
  };
  
  const isChatPage = location.pathname.startsWith('/chat');
  
  // 简化的侧边栏切换逻辑
  const toggleSider = () => {
    setSiderVisible(!siderVisible);
  };
  
  // 检查是否需要折叠导航栏控件
  const shouldCollapse = windowWidth < 1000;
  
  // 获取当前选中模型名称
  const getModelDisplayName = (modelKey) => {
    const foundModel = modelOptions.find(m => m.name === modelKey);
    return foundModel ? foundModel.display_name || foundModel.name : modelKey;
  };
  
  // 获取当前选中系统提示词名称
  const getPromptName = (promptId) => {
    if (!promptId) return '无系统提示词';
    const prompt = systemPrompts.find(p => p.id === promptId);
    return prompt ? prompt.name : '无系统提示词';
  };

  // 渲染导航栏控件
  const renderNavControls = () => (
    <Space size="middle" style={{ display: 'flex', flexWrap: 'nowrap' }}>
      {/* 模型选择 */}
      <Select
        value={selectedModel}
        onChange={handleModelSelect}
        style={{ width: 180 }}
        placeholder="请选择模型"
        loading={loadingModels || loadingSettings}
        notFoundContent="没有可用模型，请在管理界面添加"
      >
        {modelOptions.length > 0 ? (
          modelOptions.map(model => (
            <Option key={model.name} value={model.name}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{model.display_name || model.name}</span>
                {model.is_free ? (
                  <Tag color="green" style={{ marginLeft: 5, fontSize: '10px' }}>免费</Tag>
                ) : (
                  <Tag color="orange" style={{ marginLeft: 5, fontSize: '10px' }}>收费</Tag>
                )}
              </div>
            </Option>
          ))
        ) : (
          <Option value="" disabled>请先配置模型</Option>
        )}
      </Select>
      
      {/* 系统提示词选择 */}
      <Select
        value={selectedPrompt}
        onChange={setSelectedPrompt}
        style={{ width: 140 }}
        placeholder="选择提示词模板"
        allowClear
      >
        {systemPrompts.map(prompt => (
          <Option key={prompt.id} value={prompt.id}>{prompt.name}</Option>
        ))}
      </Select>
      
      {/*知识库问答开关 */}
      <Space>
        <Switch 
          checked={useRAG} 
          onChange={setUseRAG}
        />
        <span>知识库</span>
      </Space>
      
      {/* 知识库选择 */}
      {useRAG && (
        <Select
          value={selectedKB}
          onChange={setSelectedKB}
          style={{ width: 100 }}
          placeholder="选择知识库"
          disabled={!useRAG}
        >
          {knowledgeBases.map(kb => (
            <Option key={kb.id} value={kb.name}>{kb.name}</Option>
          ))}
        </Select>
      )}
      
      {/* 新建聊天按钮 */}
      <Button 
        type="primary" 
        onClick={handleNewChat}
        disabled={modelOptions.length === 0} // 只有在没有可用模型时才禁用
        title={modelOptions.length === 0 ? "请先添加可用模型" : ""}
      >
        新聊天
      </Button>
    </Space>
  );
  
  // 获取下拉菜单项
  const getControlsMenu = () => {
    const modelLabel = getModelDisplayName(selectedModel);
    const promptName = getPromptName(selectedPrompt);
    const ragStatus = useRAG ? '已开启' : '已关闭';
    
    const menuItems = [
      {
        key: 'model',
        label: modelLabel,
        children: modelOptions.map(model => ({
          key: model.name,
          label: (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <span>{model.display_name || model.name}</span>
              <span>
                {selectedModel === model.name && <CheckOutlined style={{ color: '#1890ff', marginRight: 5 }} />}
                {model.is_free ? (
                  <Tag color="green" style={{ fontSize: '10px' }}>免费</Tag>
                ) : (
                  <Tag color="orange" style={{ fontSize: '10px' }}>收费</Tag>
                )}
              </span>
            </div>
          ),
          onClick: () => handleModelSelect(model.name)
        }))
      },
      {
        key: 'prompts',
        label: promptName,
        children: [
          {
            key: 'prompt_none',
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span>无系统提示词</span>
                {selectedPrompt === null && <CheckOutlined style={{ color: '#1890ff' }} />}
              </div>
            ),
            onClick: () => setSelectedPrompt(null)
          },
          ...systemPrompts.map(prompt => ({
            key: `prompt_${prompt.id}`,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span>{prompt.name}</span>
                {selectedPrompt === prompt.id && <CheckOutlined style={{ color: '#1890ff' }} />}
              </div>
            ),
            onClick: () => setSelectedPrompt(prompt.id)
          }))
        ]
      },
      {
        key: 'rag',
        label: `知识库问答 (${ragStatus})`,
        onClick: () => setUseRAG(!useRAG)
      },
      {
        key: 'newChat',
        label: '新建聊天',
        onClick: handleNewChat,
        disabled: modelOptions.length === 0 // 只有在没有可用模型时才禁用
      }
    ];
    
    // 如果开启了知识库问答模式，添加知识库选择
    if (useRAG) {
      const selectedKbName = selectedKB || '请选择知识库';
      
      menuItems.splice(3, 0, {
        key: 'kb',
        label: selectedKbName,
        children: [
          ...knowledgeBases.map(kb => ({
            key: `kb_${kb.id}`,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span>{kb.name}</span>
                {selectedKB === kb.name && <CheckOutlined style={{ color: '#1890ff' }} />}
              </div>
            ),
            onClick: () => setSelectedKB(kb.name)
          }))
        ]
      });
    }
    
    return { items: menuItems };
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {siderVisible && (
        <Sider 
          trigger={null} 
          width={230}
          style={{ 
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            background: '#fff',
            borderRight: '1px solid #f0f0f0',
            zIndex: 999
          }}
        >
          <div style={{ 
            height: '64px', 
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '0 16px',
            borderBottom: '1px solid #f0f0f0'
          }}>
            <h2>RAG助手</h2>
          </div>
          
          <Menu
            mode="inline"
            selectedKeys={getSelectedKey()}
            style={{ borderRight: 0 }}
            items={[
              {
                key: '1',
                icon: <MessageOutlined />,
                label: '聊天',
                onClick: () => handleNavigation('/chat'),
              },
              {
                key: '2',
                icon: <DatabaseOutlined />,
                label: '知识库',
                onClick: () => handleNavigation('/knowledge'),
              },
              {
                key: '3',
                icon: <SettingOutlined />,
                label: '设置',
                onClick: () => handleNavigation('/settings'),
              },
            ]}
          />
          
          {isChatPage && <ChatSidebar onSelectChat={(id) => handleNavigation(`/chat/${id}`)} />}
        </Sider>
      )}
      
      <Layout style={{ 
        marginLeft: siderVisible ? 230 : 0, 
        transition: 'all 0.2s'
      }}>
        <Header style={{ 
          padding: '0 16px', 
          background: '#fff', 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 1,
          width: '100%',
          height: '64px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* 侧边栏切换按钮 */}
            <Button
              type="text"
              icon={siderVisible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={toggleSider}
              style={{ marginRight: 16 }}
            />
            
            {/* 导航栏控件，根据屏幕宽度决定是否显示 */}
            {isChatPage && (
              shouldCollapse ? (
                <Dropdown
                  menu={getControlsMenu()}
                  placement="bottomLeft"
                  trigger={['click']}
                >
                  <Button 
                    icon={<AppstoreOutlined />} 
                  >
                    设置控件
                    <DownOutlined />
                  </Button>
                </Dropdown>
              ) : (
                renderNavControls()
              )
            )}
          </div>
          
          {/* 用户菜单，始终显示在右侧 */}
          <Dropdown menu={userMenu} placement="bottomRight">
            <Avatar icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
          </Dropdown>
        </Header>
        
        <Content style={{ 
          padding: '16px', 
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 64px)'
        }}>
          <Outlet context={{ 
            selectedModel, 
            setSelectedModel: handleModelSelect, 
            useRAG, 
            setUseRAG, 
            selectedKB, 
            setSelectedKB,
            selectedPrompt,
            setSelectedPrompt,
            modelOptions
          }} />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;