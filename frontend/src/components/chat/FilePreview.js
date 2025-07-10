import React, { useState } from 'react';
import { Button, Modal } from 'antd';
import { 
  DeleteOutlined, 
  CloseOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  FileImageOutlined,
  FileUnknownOutlined
} from '@ant-design/icons';

const FilePreview = ({ fileList, onRemove }) => {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState('');

  if (!fileList || fileList.length === 0) {
    return null;
  }

  // 优化：获取文件URL的辅助函数
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

  // 处理预览图片
  const handlePreview = (file) => {
    if (file.type && file.type.startsWith('image/')) {
      const fileUrl = getFileUrl(file);
      setPreviewImage(fileUrl);
      setPreviewVisible(true);
    }
  };

  // 关闭预览
  const handleCancel = () => {
    setPreviewVisible(false);
  };

  // 获取文件图标
  const getFileIcon = (fileType) => {
    if (!fileType) return <FileUnknownOutlined style={{ fontSize: 24, color: '#8c8c8c' }} />;
    
    if (fileType.startsWith('image/')) {
      return <FileImageOutlined style={{ fontSize: 24, color: '#f759ab' }} />;
    } else if (fileType.includes('pdf')) {
      return <FilePdfOutlined style={{ fontSize: 24, color: '#f5222d' }} />;
    } else if (fileType.includes('word') || fileType.includes('doc')) {
      return <FileWordOutlined style={{ fontSize: 24, color: '#1890ff' }} />;
    } else if (fileType.includes('excel') || fileType.includes('sheet') || fileType.includes('csv')) {
      return <FileExcelOutlined style={{ fontSize: 24, color: '#52c41a' }} />;
    } else if (fileType.includes('text')) {
      return <FileTextOutlined style={{ fontSize: 24, color: '#faad14' }} />;
    }
    
    return <FileUnknownOutlined style={{ fontSize: 24, color: '#8c8c8c' }} />;
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexWrap: 'wrap', 
      gap: '8px',
      margin: '8px 0' 
    }}>
      {fileList.map((file, index) => {
        const isImage = file.type?.startsWith('image/');
        const fileUrl = getFileUrl(file);
        const key = `file-preview-${file.id || index}`;
        
        if (isImage && fileUrl) {
          // 图片类型
          return (
            <div 
              key={key}
              onClick={() => handlePreview(file)}
              style={{ 
                position: 'relative',
                cursor: 'pointer',
                borderRadius: '10px',
                overflow: 'hidden',
                width: '100px',
                height: '100px',
                border: '1px solid #e0e0e0',
                backgroundColor: '#f9f9f9',
                opacity: 1,
                visibility: 'visible',
                display: 'block'
              }}
            >
              <img 
                src={fileUrl}
                alt={file.name || "附件图片"}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover',
                  opacity: 1,
                  visibility: 'visible',
                  display: 'block'
                }}
                onError={(e) => {
                  // 显示错误占位图标
                  e.target.style.display = 'none';
                  e.target.parentNode.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#f5f5f5;"><span style="font-size:24px;color:#bfbfbf">📷</span></div>`;
                }}
              />
              {onRemove && (
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(file);
                  }}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
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
                />
              )}
            </div>
          );
        } else {
          // 其他文件类型
          return (
            <div 
              key={key}
              style={{ 
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid #e6e6e6',
                background: '#f9f9f9',
                padding: '10px',
                minWidth: '180px',
                maxWidth: '300px',
                opacity: 1,
                visibility: 'visible',
                display: 'flex'
              }}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%'
              }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
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
                {onRemove && (
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => onRemove(file)}
                    style={{
                      marginLeft: '8px',
                      padding: 0,
                      height: '24px',
                      width: '24px'
                    }}
                  />
                )}
              </div>
            </div>
          );
        }
      })}
      
      {/* 图片预览模态框 */}
      <Modal
        open={previewVisible}
        title={null}
        footer={null}
        onCancel={handleCancel}
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

export default FilePreview;