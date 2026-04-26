import '@/styles/globals.css'
import React from 'react'
import type { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '../lib/ThemeContext'

const inter = Inter({ subsets: ['latin'] })

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;

      // Parse the component stack to extract file/line info
      const stackLines = (errorInfo?.componentStack || '')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .slice(0, 6);

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            <div className="flex items-start space-x-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Something went wrong
                </h1>
                <p className="mt-1 text-gray-600 dark:text-gray-400">
                  The app hit an unexpected error while rendering. This is usually caused by a missing backend response or a bug in the frontend code.
                </p>
              </div>
            </div>

            {/* Plain English summary */}
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">
                {error?.name}: {error?.message}
              </p>
            </div>

            {/* Component stack */}
            {stackLines.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Component stack
                </p>
                <pre className="text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap">
                  {stackLines.join('\n')}
                </pre>
              </div>
            )}

            {/* JS stack trace */}
            {error?.stack && (
              <details className="mb-6">
                <summary className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
                  Full error stack trace
                </summary>
                <pre className="mt-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-xs text-gray-600 dark:text-gray-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                  {error.stack}
                </pre>
              </details>
            )}

            <div className="flex space-x-3">
              <button
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <main className={inter.className}>
          <Component {...pageProps} />
        </main>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
