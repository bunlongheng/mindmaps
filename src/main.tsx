import React, { Component, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Grayscale favicon on local dev so it's easy to tell apart from prod tabs
if (import.meta.env.DEV) {
  const img = new Image()
  img.src = '/icons/favicon-32x32.png'
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.filter = 'grayscale(1)'
    ctx.drawImage(img, 0, 0)
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach(el => {
      el.href = canvas.toDataURL()
    })
  }
}


class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', color: '#dc2626' }}>
          <h2>Something went wrong</h2>
          <pre style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
            {(this.state.error as Error).message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
