import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { DocumentArrowUpIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface FileUploadProps {
  onFileUpload: (file: File) => Promise<any>;
  loading: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, loading }) => {
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    setUploadStatus('Uploading...');
    
    try {
      const result = await onFileUpload(file);
      const message = result?.duplicate_transactions > 0 
        ? `Successfully uploaded ${file.name}. Added ${result.saved_transactions} new transactions, skipped ${result.duplicate_transactions} duplicates.`
        : `Successfully uploaded ${file.name}`;
      setUploadStatus(message);
      setTimeout(() => setUploadStatus(null), 5000);
    } catch (error) {
      setUploadStatus('Upload failed');
      setTimeout(() => setUploadStatus(null), 5000);
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv']
    },
    maxFiles: 1,
    maxSize: 16 * 1024 * 1024, // 16MB
    disabled: loading
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Upload CSV File</h2>
        
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-blue-400 bg-blue-50'
              : loading
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input {...getInputProps()} />
          <DocumentArrowUpIcon style={{width: '48px', height: '48px', minWidth: '48px', minHeight: '48px', maxWidth: '48px', maxHeight: '48px'}} className="mx-auto text-gray-400 mb-4" />
          
          {loading ? (
            <div className="text-gray-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
              Processing file...
            </div>
          ) : isDragActive ? (
            <p className="text-blue-600">Drop the CSV file here...</p>
          ) : (
            <div>
              <p className="text-gray-600 mb-2">
                Drag and drop a CSV file here, or click to select
              </p>
              <p className="text-sm text-gray-500">
                Maximum file size: 16MB
              </p>
            </div>
          )}
        </div>

        {/* File Rejections */}
        {fileRejections.length > 0 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <ExclamationTriangleIcon style={{width: '20px', height: '20px', minWidth: '20px', minHeight: '20px', maxWidth: '20px', maxHeight: '20px'}} className="text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">File Upload Error</h3>
                <div className="mt-1 text-sm text-red-700">
                  {fileRejections.map(({ file, errors }) => (
                    <div key={file.name}>
                      <strong>{file.name}:</strong>
                      <ul className="list-disc list-inside ml-4">
                        {errors.map((error) => (
                          <li key={error.code}>{error.message}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upload Status */}
        {uploadStatus && (
          <div className={`mt-4 p-4 rounded-md ${
            uploadStatus.includes('Successfully') 
              ? 'bg-green-50 border border-green-200' 
              : uploadStatus.includes('failed')
              ? 'bg-red-50 border border-red-200'
              : 'bg-blue-50 border border-blue-200'
          }`}>
            <p className={`text-sm ${
              uploadStatus.includes('Successfully') 
                ? 'text-green-700' 
                : uploadStatus.includes('failed')
                ? 'text-red-700'
                : 'text-blue-700'
            }`}>
              {uploadStatus}
            </p>
          </div>
        )}

        {/* Supported Formats */}
        <div className="mt-6 bg-gray-50 rounded-md p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Supported CSV Formats</h3>
          <div className="text-sm text-gray-600 space-y-2">
            <div>
              <strong>Format 1:</strong> Transaction Date, Post Date, Description, Category, Type, Amount, Memo
            </div>
            <div>
              <strong>Format 2:</strong> Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
            </div>
            <p className="text-xs text-gray-500 mt-2">
              The app will automatically detect which format your CSV uses.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;