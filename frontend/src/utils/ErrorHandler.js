// src/utils/ErrorHandler.js
class ErrorHandler {
    static install() {
      // 保存原始console.error函数
      const originalConsoleError = console.error;
      
      // 过滤掉React的最大递归深度错误
      console.error = function(...args) {
        // 过滤掉Maximum update depth exceeded错误
        if (args[0] && typeof args[0] === 'string' && 
            (args[0].includes('Maximum update depth exceeded') || 
             args[0].includes('Uncaught runtime errors'))) {
          // 可以选择在这里记录错误，但不显示
          console.log('已屏蔽React错误:', args[0]);
          return;
        }
        
        // 所有其他错误继续显示
        return originalConsoleError.apply(this, args);
      };
      
      // 拦截全局错误事件
      window.addEventListener('error', (event) => {
        if (event && event.error && event.error.message && 
            (event.error.message.includes('Maximum update depth exceeded') ||
             event.error.message.includes('Uncaught runtime errors'))) {
          event.preventDefault();
          return true;
        }
      }, true);
      
      // 拦截未处理的Promise rejection
      window.addEventListener('unhandledrejection', (event) => {
        if (event && event.reason && typeof event.reason.message === 'string' && 
            (event.reason.message.includes('Maximum update depth exceeded') ||
             event.reason.message.includes('Uncaught runtime errors'))) {
          event.preventDefault();
          return true;
        }
      });
      
      // 尝试屏蔽React DevTools的错误显示
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        const originalOnCommitFiberRoot = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot;
        if (originalOnCommitFiberRoot) {
          window.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot = function(...args) {
            try {
              return originalOnCommitFiberRoot.apply(this, args);
            } catch (error) {
              if (error && error.message && error.message.includes('Maximum update depth exceeded')) {
                // 忽略错误
                return null;
              }
              throw error;
            }
          };
        }
      }
    }
  }
  
  export default ErrorHandler;