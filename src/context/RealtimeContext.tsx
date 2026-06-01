import React, { createContext, useEffect, useState, PropsWithChildren } from 'react';
import { io, Socket } from 'socket.io-client';

type RealtimeContextType = {
  socket: Socket | null;
};

const RealtimeContext = createContext<RealtimeContextType>({ socket: null });

export const RealtimeProvider = ({ children }: PropsWithChildren) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const base = (import.meta.env.VITE_API_BASE_URL as string) || '';
    const url = base.replace(/\/+$/, '') || window.location.origin;
    const s = io(url, { autoConnect: true, withCredentials: true });
    setSocket(s);

    s.on('connect', () => window.dispatchEvent(new CustomEvent('d7:realtime:connect')));
    s.on('disconnect', () => window.dispatchEvent(new CustomEvent('d7:realtime:disconnect')));

    s.on('patient.created', (payload: any) => window.dispatchEvent(new CustomEvent('d7:patient.created', { detail: payload })));
    s.on('patient.updated', (payload: any) => window.dispatchEvent(new CustomEvent('d7:patient.updated', { detail: payload })));
    s.on('hospitalization.created', (payload: any) => window.dispatchEvent(new CustomEvent('d7:hospitalization.created', { detail: payload })));
    s.on('notification.created', (payload: any) => window.dispatchEvent(new CustomEvent('d7:notification.created', { detail: payload })));

    return () => {
      try {
        s.removeAllListeners();
        s.disconnect();
      } catch (e) {
        // ignore
      }
    };
  }, []);

  return <RealtimeContext.Provider value={{ socket }}>{children}</RealtimeContext.Provider>;
};

export default RealtimeContext;
