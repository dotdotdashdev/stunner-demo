import { useCallback, useEffect, useRef, useState } from 'react'

export type SocketState = 'connecting' | 'open' | 'closed' | 'error'

const MAX_MESSAGE_PREVIEW_LENGTH = 160

function toPreviewPayload(payload: unknown): string {
  const text = typeof payload === 'string' ? payload : '[binary payload]'
  return text.length <= MAX_MESSAGE_PREVIEW_LENGTH
    ? text
    : `${text.slice(0, MAX_MESSAGE_PREVIEW_LENGTH)}...`
}

export function useGameSocket(url: string) {
  const socketRef = useRef<WebSocket | null>(null)
  const [socketState, setSocketState] = useState<SocketState>('connecting')
  const [lastMessage, setLastMessage] = useState<string>('No traffic yet.')
  const [receivedAt, setReceivedAt] = useState<number | null>(null)

  useEffect(() => {
    setSocketState('connecting')

    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onopen = () => {
      setSocketState('open')
    }

    socket.onmessage = (event) => {
      setLastMessage(toPreviewPayload(event.data))
      setReceivedAt(Date.now())
    }

    socket.onerror = () => {
      setSocketState('error')
    }

    socket.onclose = () => {
      setSocketState('closed')
    }

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [url])

  const sendJson = useCallback((payload: unknown): boolean => {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false
    }

    socket.send(JSON.stringify(payload))
    return true
  }, [])

  return {
    socketState,
    lastMessage,
    receivedAt,
    sendJson,
  }
}
