import React from 'react'
import styles from './Toast.module.css'

interface ToastProps {
  message: string | null
  onClose: () => void
}

export default function Toast({ message, onClose }: ToastProps) {
  if (!message) return null
  const isSuccess = message.startsWith('✓')
  return (
    <div className={`${styles.toast} ${isSuccess ? styles.toastSuccess : ''}`}>
      <span className={styles.icon}>{isSuccess ? '✓' : '⚠'}</span>
      <span className={styles.msg}>{isSuccess ? message.slice(1).trim() : message}</span>
      <button className={styles.close} onClick={onClose}>✕</button>
    </div>
  )
}
