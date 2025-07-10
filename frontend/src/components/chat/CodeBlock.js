// frontend/src/components/chat/CodeBlock.js
import React, { useState, useRef } from 'react';
import { Button, message } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  oneLight
} from 'react-syntax-highlighter/dist/esm/styles/prism';

const CodeBlock = ({ className, children }) => {
  const [hovered, setHovered] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const codeRef = useRef(null);
  const language = className ? className.replace('language-', '') : '';
  
  const codeStyle = oneLight;
  
  // 自定义代码块样式
  const customStyle = {
    backgroundColor: '#f6f8fa',
    padding: '8px 12px', // 减少内边距
    borderRadius: '6px',
    fontSize: '14px',
    border: '1px solid #e1e4e8',
    margin: '0' // 确保没有内部边距
  };
  
  const handleCopyCode = (e) => {
    e.stopPropagation();
    if (codeRef.current) {
      const code = codeRef.current.textContent;
      navigator.clipboard.writeText(code)
        .then(() => {
          setCopySuccess(true);
          message.success('代码已复制');
          
          setTimeout(() => {
            setCopySuccess(false);
          }, 1500);
        })
        .catch(() => {
          message.error('复制失败，请手动复制');
        });
    }
  };
  
  return (
    <div 
      style={{ 
        position: 'relative',
        margin: '6px 0', // 大幅减少上下外部边距
        padding: 0,
        border: 'none',
        borderRadius: '6px',
        background: 'transparent',
        boxShadow: 'none'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="code-block-container"
    >
      {hovered && (
        <Button
          type={copySuccess ? "success" : "primary"}
          size="small"
          icon={copySuccess ? <CheckOutlined /> : <CopyOutlined />}
          onClick={handleCopyCode}
          style={{
            position: 'absolute',
            top: '4px', // 调整按钮位置
            right: '4px',
            backgroundColor:'grey',
            color:'white',
            zIndex: 10,
            opacity: 0.9,
            fontSize: '12px',
            padding: '2px 8px',
            height: '24px'
          }}
        >
          {copySuccess ? '复制成功' : '复制'}
        </Button>
      )}
      <div ref={codeRef} style={{ display: 'none' }}>{children}</div>
      <SyntaxHighlighter
        style={codeStyle}
        customStyle={customStyle}
        language={language || 'text'}
        PreTag="div"
        showLineNumbers={true}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodeBlock;