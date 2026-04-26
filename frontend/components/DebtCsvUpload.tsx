import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { DocumentArrowUpIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { DebtAccount } from '../types';
import { apiService } from '../services/api';

interface Props {
  onUploadSuccess: (accounts: DebtAccount[]) => void;
}

const DebtCsvUpload: React.FC<Props> = ({ onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    setUploading(true);
    setUploadStatus('Uploading…');
    setUploadSuccess(false);
    try {
      const result = await apiService.uploadDebtCsv(file);
      setUploadStatus(`Successfully imported ${result.imported_count} account${result.imported_count !== 1 ? 's' : ''}${result.skipped_count > 0 ? `, skipped ${result.skipped_count} rows` : ''}.`);
      setUploadSuccess(true);
      onUploadSuccess(result.accounts);
      setTimeout(() => setUploadStatus(null), 5000);
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Upload failed';
      setUploadStatus(msg);
      setUploadSuccess(false);
      setTimeout(() => setUploadStatus(null), 5000);
    } finally {
      setUploading(false);
    }
  }, [onUploadSuccess]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    maxFiles: 1,
    maxSize: 16 * 1024 * 1024,
    disabled: uploading,
  });

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Import Credit Card Accounts via CSV</h2>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : uploading
              ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 cursor-not-allowed'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }`}
        >
          <input {...getInputProps()} />
          <DocumentArrowUpIcon
            style={{ width: '48px', height: '48px', minWidth: '48px', minHeight: '48px' }}
            className="mx-auto text-gray-400 dark:text-gray-500 mb-4"
          />
          {uploading ? (
            <div className="text-gray-500 dark:text-gray-400">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
              Processing file…
            </div>
          ) : isDragActive ? (
            <p className="text-blue-600 dark:text-blue-400">Drop the CSV file here…</p>
          ) : (
            <div>
              <p className="text-gray-600 dark:text-gray-300 mb-2">Drag and drop a CSV file here, or click to select</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Maximum file size: 16MB</p>
            </div>
          )}
        </div>

        {fileRejections.length > 0 && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
            <div className="flex">
              <ExclamationTriangleIcon
                style={{ width: '20px', height: '20px', minWidth: '20px', minHeight: '20px' }}
                className="text-red-400 dark:text-red-500"
              />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-300">File Upload Error</h3>
                <div className="mt-1 text-sm text-red-700 dark:text-red-400">
                  {fileRejections.map(({ file, errors }) => (
                    <div key={file.name}>
                      <strong>{file.name}:</strong>
                      <ul className="list-disc list-inside ml-4">
                        {errors.map(e => <li key={e.code}>{e.message}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {uploadStatus && (
          <div className={`mt-4 p-4 rounded-md ${
            uploadSuccess
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : uploadStatus.includes('failed') || uploadStatus.includes('Error') || uploadStatus.includes('error')
              ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
          }`}>
            <p className={`text-sm ${
              uploadSuccess
                ? 'text-green-700 dark:text-green-300'
                : uploadStatus.includes('failed') || uploadStatus.includes('Error') || uploadStatus.includes('error')
                ? 'text-red-700 dark:text-red-400'
                : 'text-blue-700 dark:text-blue-400'
            }`}>
              {uploadStatus}
            </p>
          </div>
        )}

        <div className="mt-6 bg-gray-50 dark:bg-gray-700/50 rounded-md p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Required CSV Format</h3>
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
            <div>
              <strong>Required columns:</strong> Account Name, Balance, APR, Min Payment
            </div>
            <div>
              <strong>Optional columns:</strong> Promo Balance, Promo APR, Promo Expiry
            </div>
            <div className="mt-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 p-2 font-mono text-xs text-gray-600 dark:text-gray-300 overflow-x-auto">
              Account Name,Balance,APR,Min Payment,Promo Balance,Promo APR,Promo Expiry<br />
              Chase Sapphire,4250.00,22.99,85.00,,,<br />
              Citi Double Cash,1800.00,19.24,36.00,1000.00,0.0,2026-12-31
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              This importer creates credit card accounts only. Add mortgages and student loans manually via the Accounts tab.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebtCsvUpload;
