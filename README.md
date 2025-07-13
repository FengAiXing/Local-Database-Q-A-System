基于RAG框架和本地知识库的私有问答系统

项目概述

这是一个支持私有化部署的智能问答平台，使用RAG架构，结合本地知识库和大语言模型，提供安全可控的专业问答服务。系统支持多格式文档上传、语义检索、多模型调用，可根据硬件需求灵活选择部署方式、支持知识库向量更新、知识库嵌入参数调整、支持模型流式输出、自定义提示词、多轮对话和上下文记忆、思考与回答分离等功能。

核心特性

技术架构

前端：React + Ant Design + Zustand状态管理

后端：Django REST Framework + SQLite

向量数据库：FAISS（支持CPU/GPU加速）

嵌入模型：支持BGE-M3本地部署及SiliconFlow远程API（可以根据自己需求更改）

语言模型：兼容DeepSeek-r1（本地Ollama部署）及GPT-4等云端模型（可以根据需求更改）

功能模块

知识库管理

支持PDF/Word/Excel/TXT/图片等多格式文档上传

自动执行OCR识别、文本提取、语义分块处理

增量式向量库构建与更新

法律文档结构化解析（章节条款自动识别）

智能问答

混合检索策略（语义向量+关键词+法律条款精确匹配）

BGE-Reranker-V2重排序优化

多轮对话上下文保持

答案来源追溯与思考过程可视化



系统管理

JWT身份认证与RBAC权限控制

多租户数据隔离

模型服务动态接入（本地/云端）

异步任务管理与进度监控



部署要求

硬件环境

设备性能要求(可以根据自己需要，如果是本地部署的模型配置要求会更高，调用的话相对要求会低一点)：

RAM >= 16G，最好有独显可以加快推理速度



软件依赖

基础环境：

Python 3.9+

Node.js 16+

Redis 6.0+



核心的一些Python包：

django==4.2

djangorestframework==3.14

faiss-cpu==1.7.3  # 或faiss-gpu

langchain==0.1.0

pymupdf==1.22

pytesseract==0.3.10



安装指南

后端
创建虚拟环境：

python -m venv venv

source venv/bin/activate  # Linux/Mac

venv\Scripts\activate  # Windows

安装依赖：

pip install -r requirements.txt

数据库迁移：

python manage.py migrate

启动：

python manage.py runserver 0.0.0.0:8000

前端
安装依赖：

cd frontend

npm install

环境配置：

创建和配置.env文件：

REACT_APP_API_BASE_URL=http://localhost:8000/api

启动：

npm start



使用说明

先将rag_project/settings.py里面的API Key补全,或者完全使用本地模型(基础模型包括推理模型、嵌入模型、重排序模型)，可以按需配置



初始化配置

管理员账户创建：

python manage.py createsuperuser

模型服务配置：

在管理后台（/admin）添加：

本地Ollama模型端点

云端API密钥（比如ChatGPT或是SiliconFlow这些提供大模型的平台）



典型工作流

创建知识库：

设置分块大小

配置重叠长度

选择嵌入模型类型



文档处理：

上传PDF/Word等文档



问答测试：

启用RAG模式并选择目标知识库

输入相关问题

系统返回：

生成答案

参考文档片段

模型推理过程



许可与声明

本项目采用Apache License 2.0开源协议，禁止用于任何违反法律法规的用途。法律文档示例数据需确保已脱敏处理。
