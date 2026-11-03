import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async ({ silent = true } = {}) => {
      if (!user) return;
      if (!silent) setLoading(true);
      try {
        const { data } = await api.get('/notifications', { params: { limit: 30 } });
        setNotifications(data.notifications);
        setUnread(data.unread);
        setTotal(data.total);
      } catch {
        /* notifications are non-critical */
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnread(0);
      setTotal(0);
      return undefined;
    }
    refresh();
    const timer = window.setInterval(() => refresh(), 45000);
    return () => window.clearInterval(timer);
  }, [user, refresh]);

  useEffect(() => {
    if (!user) return undefined;
    let socket;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'notification') {
            const data = payload.data || {};
            if (data.title) toast.info(data.title);
            refresh();
          }
        } catch {
          /* ignore malformed frames */
        }
      });
    } catch {
      /* websocket optional */
    }
    return () => {
      if (socket) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [user, refresh, toast]);

  const markRead = useCallback(async (id) => {
    setNotifications((current) =>
      current.map((item) => (item.id === id && !item.read_at ? { ...item, read_at: new Date().toISOString() } : item))
    );
    setUnread((current) => Math.max(0, current - 1));
    try {
      await api.post(`/notifications/${id}/read`);
    } catch {
      /* ignore */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    setUnread(0);
    try {
      await api.post('/notifications/read-all');
    } catch {
      /* ignore */
    }
  }, []);

  const markCategoryRead = useCallback(async (category) => {
    if (!category) return;
    let countToReduce = 0;
    setNotifications((current) =>
      current.map((item) => {
        const matches =
          !item.read_at &&
          (item.type === category ||
            (category === 'lab' && (item.link?.includes('lab') || item.title?.toLowerCase().includes('lab'))) ||
            (category === 'submission' && (item.link?.includes('submission') || item.title?.toLowerCase().includes('submission'))));
        if (matches) {
          countToReduce += 1;
          return { ...item, read_at: new Date().toISOString() };
        }
        return item;
      })
    );
    if (countToReduce > 0) {
      setUnread((current) => Math.max(0, current - countToReduce));
      try {
        await api.post('/notifications/read-category', { category });
      } catch {
        /* ignore */
      }
    }
  }, []);

  const value = useMemo(
    () => ({ notifications, unread, total, loading, refresh, markRead, markAllRead, markCategoryRead }),
    [notifications, unread, total, loading, refresh, markRead, markAllRead, markCategoryRead]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
}
