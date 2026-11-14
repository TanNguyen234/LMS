import { useCallback, useEffect, useRef, useState } from 'react';
import { buildWsUrl, issueWsTicket } from '../api/realtime';
import { getAuthToken } from '../api/http';

export type WebSocketStatus = 'connecting' | 'open' | 'closed';

export interface UseWebSocketOptions {
  path: string | null;
  enabled?: boolean;
  reconnect?: boolean;
  maxRetries?: number;
  onMessage?: (data: any) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
}

export interface UseWebSocketResult {
  status: WebSocketStatus;
  lastError: string | null;
  sendJson: (payload: unknown) => boolean;
  reconnectNow: () => void;
}

export function useWebSocket({
  path,
  enabled = true,
  reconnect = true,
  maxRetries = 8,
  onMessage,
  onOpen,
  onClose,
}: UseWebSocketOptions): UseWebSocketResult {
  const [status, setStatus] = useState<WebSocketStatus>('closed');
  const [lastError, setLastError] = useState<string | null>(null);
  const [manualTrigger, setManualTrigger] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const generationRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);

  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const reconnectNow = useCallback(() => {
    attemptRef.current = 0;
    setManualTrigger((n) => n + 1);
  }, []);

  const hasToken = Boolean(getAuthToken());
  const isActive = Boolean(enabled && path && hasToken);

  useEffect(() => {
    const token = getAuthToken();
    if (!enabled || !path || !token) {
      generationRef.current += 1;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close(1000, 'disabled');
        wsRef.current = null;
      }
      return;
    }

    const generation = ++generationRef.current;
    let unmounted = false;

    const connect = async () => {
      if (unmounted || generation !== generationRef.current) return;
      clearTimers();
      await Promise.resolve();
      if (unmounted || generation !== generationRef.current) return;
      setStatus('connecting');
      setLastError(null);

      try {
        const ticketRes = await issueWsTicket();
        if (unmounted || generation !== generationRef.current) return;

        const wsUrl = buildWsUrl(path, ticketRes.ticket);
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (unmounted || generation !== generationRef.current) {
            socket.close(1000, 'stale');
            return;
          }
          attemptRef.current = 0;
          setStatus('open');
          setLastError(null);
          onOpenRef.current?.();

          heartbeatTimerRef.current = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              try {
                socket.send(JSON.stringify({ type: 'ping' }));
              } catch {
                // ignore heartbeat send errors; onclose handles recovery
              }
            }
          }, 25000);
        };

        socket.onmessage = (event) => {
          if (unmounted || generation !== generationRef.current) return;
          try {
            const parsed = JSON.parse(event.data);
            if (parsed?.type === 'pong') return;
            onMessageRef.current?.(parsed);
          } catch {
            // ignore non-JSON frames
          }
        };

        socket.onerror = () => {
          if (unmounted || generation !== generationRef.current) return;
          setLastError('Lỗi kết nối thời gian thực');
        };

        socket.onclose = (event) => {
          if (heartbeatTimerRef.current !== null) {
            window.clearInterval(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
          }
          if (wsRef.current === socket) {
            wsRef.current = null;
          }
          if (unmounted || generation !== generationRef.current) return;

          setStatus('closed');
          onCloseRef.current?.(event);

          const shouldRetry =
            reconnect &&
            event.code !== 1000 &&
            event.code !== 1008 &&
            attemptRef.current < maxRetries;

          if (shouldRetry) {
            const delayMs =
              Math.min(30000, 1000 * Math.pow(2, attemptRef.current)) +
              Math.floor(Math.random() * 400);
            attemptRef.current += 1;
            reconnectTimerRef.current = window.setTimeout(() => {
              void connect();
            }, delayMs);
          }
        };
      } catch (err) {
        if (unmounted || generation !== generationRef.current) return;
        setStatus('closed');
        setLastError(err instanceof Error ? err.message : 'Không thể cấp vé kết nối WebSocket');
        if (reconnect && attemptRef.current < maxRetries) {
          const delayMs =
            Math.min(30000, 1000 * Math.pow(2, attemptRef.current)) +
            Math.floor(Math.random() * 400);
          attemptRef.current += 1;
          reconnectTimerRef.current = window.setTimeout(() => {
            void connect();
          }, delayMs);
        }
      }
    };

    void connect();

    return () => {
      unmounted = true;
      generationRef.current += 1;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close(1000, 'cleanup');
        wsRef.current = null;
      }
    };
  }, [path, enabled, reconnect, maxRetries, manualTrigger, clearTimers]);

  const sendJson = useCallback((payload: unknown): boolean => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    status: isActive ? status : 'closed',
    lastError,
    sendJson,
    reconnectNow,
  };
}
