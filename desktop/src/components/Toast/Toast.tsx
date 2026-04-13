import React from 'react'
import styles from './Toast.module.css'

interface ToastProps {
  message: string | null
  onClose: () => void
}

export default function Toast({ message, onClose }: ToastProps) {
  if (!message) return null
  return (
    <div className={styles.toast}>
      <span className={styles.icon}>⚠</span>
      <span className={styles.msg}>{message}</span>
      <button className={styles.close} onClick={onClose}>✕</button>
    </div>
  )
}
