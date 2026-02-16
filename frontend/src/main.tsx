import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Initialize Kakao SDK
const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY
if (KAKAO_KEY && (window as any).Kakao && !(window as any).Kakao.isInitialized()) {
  ; (window as any).Kakao.init(KAKAO_KEY)
  console.log('Kakao SDK Initialized')
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
