import React, { useState } from 'react';
import { Upload, Button, Modal, message } from 'antd';
import { 
  DeleteOutlined, 
  CloseOutlined,
  FileImageOutlined, 
  FilePdfOutlined, 
  FileWordOutlined, 
  FileExcelOutlined, 
  FileTextOutlined, 
  FileUnknownOutlined,
  PlusOutlined 
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';

const FileUploader = ({ onFileAdd, onFileRemove, fileList, setFileList, disabled = false }) => {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState('');

  const handleCancel = () => setPreviewVisible(false);

  const handlePreview = async (file) => {
    if (file.type && file.type.startsWith('image/')) {
      setPreviewImage(file.url || file.preview);
      setPreviewVisible(true);
    }
  };

  const handleChange = ({ fileList: newFileList }) => {
    // 过滤支持的文件类型
    const supportedFileList = newFileList.filter(file => {
      const fileType = file.type;
      const fileName = file.name.toLowerCase();
      
      // 图片类型
      const isImage = fileType && fileType.startsWith('image/');
      
      // 文档类型
      const isDocument = 
        fileName.endsWith('.pdf') || 
        fileName.endsWith('.doc') || 
        fileName.endsWith('.docx') ||
        fileName.endsWith('.txt') || 
        fileName.endsWith('.csv') || 
        fileName.endsWith('.xls') || 
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.md') || 
        fileName.endsWith('.json') || 
        fileName.endsWith('.xml') ||
        fileName.endsWith('.html');
        
      // 如果是不支持的类型，显示提示
      if (!(isImage || isDocument)) {
        message.error(`不支持的文件类型: ${file.name}`);
        return false;
      }
      
      // 检查文件大小 (限制为20MB)
      if (file.size > 20 * 1024 * 1024) {
        message.error(`文件过大: ${file.name}，限制20MB以内`);
        return false;
      }
      
      return true;
    });
    
    const processedFileList = supportedFileList.map(file => {
      if (file.originFileObj && !file.id) {
        file.id = uuidv4(); // 为每个文件生成唯一ID
        file.status = 'done'; // 将状态设为完成

        // 创建预览URL
        if (file.type && file.type.startsWith('image/')) {
          file.preview = URL.createObjectURL(file.originFileObj);
        }
      }
      return file;
    });
    
    setFileList(processedFileList);
    
    // 通知父组件
    if (processedFileList.length > fileList.length) {
      const newFile = processedFileList[processedFileList.length - 1];
      if (newFile) {
        onFileAdd(newFile);
      }
    } else if (processedFileList.length < fileList.length) {
      const removedFile = fileList.find(file => 
        !processedFileList.some(newFile => newFile.id === file.id)
      );
      if (removedFile) {
        onFileRemove(removedFile);
      }
    }
  };

  // 获取文件图标
  const getFileIcon = (file) => {
    const fileType = file.type;
    
    if (fileType && fileType.startsWith('image/')) {
      return <FileImageOutlined style={{ fontSize: 24, color: '#f759ab' }} />;
    } else if (fileType && fileType.includes('pdf')) {
      return <FilePdfOutlined style={{ fontSize: 24, color: '#f5222d' }} />;
    } else if (fileType && (fileType.includes('word') || fileType.includes('doc'))) {
      return <FileWordOutlined style={{ fontSize: 24, color: '#1890ff' }} />;
    } else if (fileType && (fileType.includes('excel') || fileType.includes('sheet') || fileType.includes('csv'))) {
      return <FileExcelOutlined style={{ fontSize: 24, color: '#52c41a' }} />;
    } else if (fileType && fileType.includes('text')) {
      return <FileTextOutlined style={{ fontSize: 24, color: '#faad14' }} />;
    }
    
    return <FileUnknownOutlined style={{ fontSize: 24, color: '#8c8c8c' }} />;
  };

  return (
    <>
      <Upload
        name="files[]"
        fileList={fileList}
        onPreview={handlePreview}
        onChange={handleChange}
        beforeUpload={() => false}
        multiple
        disabled={disabled}
        showUploadList={false}
      >
        {fileList.length < 10 && (
          <Button 
            icon={<PlusOutlined />} 
            type="dashed"
            size="small"
            disabled={disabled}
            style={{
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              padding: '0 10px',
              height: '28px',
              marginBottom: fileList.length > 0 ? '8px' : 0
            }}
          >
            <span style={{ marginLeft: '4px' }}>添加文件</span>
          </Button>
        )}
      </Upload>
      
      {/* 文件列表显示  */}
      {fileList.length > 0 && (
        <div style={{ 
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          marginTop: '10px'
        }}>
          {fileList.map(file => {
            if (file.type && file.type.startsWith('image/') && file.preview) {
              // 图片类型
              return (
                <div 
                  key={file.id || file.uid}
                  onClick={() => handlePreview(file)}
                  style={{ 
                    position: 'relative',
                    cursor: 'pointer',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    width: '100px',
                    height: '100px',
                    border: '1px solid #e0e0e0',
                    backgroundColor: '#f9f9f9'
                  }}
                >
                  <img 
                    src={file.preview} 
                    alt=""
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover' 
                    }}
                  />
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileRemove(file);
                    }}
                    disabled={disabled}
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
                </div>
              );
            } else {
              // 其他文件类型
              return (
                <div 
                  key={file.id || file.uid}
                  style={{ 
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid #e6e6e6',
                    background: '#f9f9f9',
                    padding: '10px',
                    minWidth: '180px',
                    maxWidth: '300px'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    justifyContent: 'space-between' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {getFileIcon(file)}
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
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => onFileRemove(file)}
                      disabled={disabled}
                      style={{
                        marginLeft: '8px',
                        padding: 0,
                        height: '24px',
                        width: '24px'
                      }}
                    />
                  </div>
                  {/* 移除了格式信息显示 */}
                </div>
              );
            }
          })}
        </div>
      )}
      
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
    </>
  );
};

export default FileUploader;