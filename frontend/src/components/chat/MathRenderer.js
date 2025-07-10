// frontend/src/components/chat/MathRenderer.js
import React, { useEffect, useRef } from 'react';

const MathRenderer = ({ formula, isBlock = false }) => {
  const containerRef = useRef(null);
  
  useEffect(() => {
    // 当组件挂载或公式改变时渲染公式
    if (window.MathJax && containerRef.current) {
      try {
        if (window.MathJax.typesetPromise) {
          window.MathJax.typesetPromise([containerRef.current])
            .catch(err => console.error("MathJax处理错误:", err));
        } else if (window.MathJax.typeset) {
          window.MathJax.typeset([containerRef.current]);
        }
      } catch (err) {
        console.error("MathJax渲染错误:", err);
      }
    }
  }, [formula]);

  // 规范化公式，确保正确格式化
  const normalizeFormula = (raw) => {
    let normalized = raw.trim();
    
    // 处理行内公式
    if (!isBlock) {
      if (!normalized.startsWith('$')) normalized = '$' + normalized;
      if (!normalized.endsWith('$')) normalized = normalized + '$';
    } 
    // 处理块级公式
    else {
      if (!normalized.startsWith('$$')) normalized = '$$' + normalized;
      if (!normalized.endsWith('$$')) normalized = normalized + '$$';
    }
    
    return normalized;
  };

  return (
    <div 
      ref={containerRef}
      className={isBlock ? "math-block" : "math-inline"}
      style={isBlock ? { 
        margin: '1em 0',
        padding: '0.5em 0',
        overflow: 'auto'
      } : {
        display: 'inline',
        padding: '0 0.1em'
      }}
    >
      {normalizeFormula(formula)}
    </div>
  );
};

export default MathRenderer;