import { createContext, useContext, useEffect, useState, PropsWithChildren } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

type RealtimeContextType = {
  socket: Socket | null;
};

const RealtimeContext = createContext<RealtimeContextType>({ socket: null });

export const RealtimeProvider = ({ children }: PropsWithChildren) => {
  const { currentUser } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!currentUser?.id) {
      setSocket(null);
      return;
    }

    const socketUrl = import.meta.env.DEV
      ? "http://localhost:3000"
      : window.location.origin;

    console.log("SOCKET URL =", socketUrl);

    const s = io(socketUrl, {
      autoConnect: true,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      upgrade: true,
      auth: { userId: currentUser.id },
      query: { userId: currentUser.id },
    });
    setSocket(s);

    s.on('connect', () => {
      s.emit('user.join', { userId: currentUser.id });
      window.dispatchEvent(new CustomEvent('d7:realtime:connect'));
    });
    s.on('disconnect', () => window.dispatchEvent(new CustomEvent('d7:realtime:disconnect')));

    s.on('patient.created', (payload: any) => window.dispatchEvent(new CustomEvent('d7:patient.created', { detail: payload })));
    s.on('patient.updated', (payload: any) => window.dispatchEvent(new CustomEvent('d7:patient.updated', { detail: payload })));
    s.on('hospitalization.created', (payload: any) => window.dispatchEvent(new CustomEvent('d7:hospitalization.created', { detail: payload })));
    s.on('notification.created', (payload: any) => window.dispatchEvent(new CustomEvent('d7:notification.created', { detail: payload })));
    s.on('lab.request.created', (payload: any) => window.dispatchEvent(new CustomEvent('d7:lab.request.created', { detail: payload })));
    s.on('lab.result.created', (payload: any) => window.dispatchEvent(new CustomEvent('d7:lab.result.created', { detail: payload })));
    s.on('message.received', (payload: any) => window.dispatchEvent(new CustomEvent('d7:message.received', { detail: payload })));
    s.on('message.sent', (payload: any) => window.dispatchEvent(new CustomEvent('d7:message.sent', { detail: payload })));
    s.on('message.status', (payload: any) => window.dispatchEvent(new CustomEvent('d7:message.status', { detail: payload })));
    s.on('message.read', (payload: any) => window.dispatchEvent(new CustomEvent('d7:message.read', { detail: payload })));
    s.on('message.typing', (payload: any) => window.dispatchEvent(new CustomEvent('d7:message.typing', { detail: payload })));
    s.on('user.presence', (payload: any) => window.dispatchEvent(new CustomEvent('d7:user.presence', { detail: payload })));
    s.on('db.changed', (payload: any) => {
      window.dispatchEvent(new CustomEvent('d7:db.changed', { detail: payload }));
      if (payload?.model === 'Patient') {
        window.dispatchEvent(new CustomEvent('d7:patientRecordsUpdated', { detail: payload }));
        window.dispatchEvent(new CustomEvent('d7:patient.updated', { detail: payload }));
      }
      if (payload?.model === 'Appointment') {
        window.dispatchEvent(new CustomEvent('d7:appointmentsUpdated', { detail: payload }));
        window.dispatchEvent(new CustomEvent('d7:patientRecordsUpdated', { detail: payload }));
      }
      if (['Invoice', 'Payment'].includes(payload?.model)) {
        window.dispatchEvent(new CustomEvent('d7:billingDataUpdated', { detail: payload }));
        window.dispatchEvent(new CustomEvent('d7:patientRecordsUpdated', { detail: payload }));
      }
      if (['VitalSign', 'Consultation', 'Prescription', 'LabRequest', 'LabResult', 'ImagingRequest', 'ImagingReport', 'Hospitalization'].includes(payload?.model)) {
        window.dispatchEvent(new CustomEvent('d7:clinicalDataUpdated', { detail: payload }));
        window.dispatchEvent(new CustomEvent('d7:patientRecordsUpdated', { detail: payload }));
      }
      if (['User', 'Employee', 'EmployeeContract', 'Service', 'ServiceStaff', 'ServiceResponsable', 'ServiceTarif', 'Department', 'ServiceUnit', 'Room', 'Bed', 'OperatingRoom', 'Surgery', 'Medication', 'MedicationStock', 'StockLot', 'StockMovement', 'StockTransaction', 'Supplier', 'PurchaseOrder', 'GoodsReceipt', 'PharmacyDispense', 'Attendance', 'LeaveRequest', 'Payroll', 'AuditTrail'].includes(payload?.model)) {
        window.dispatchEvent(new CustomEvent('d7:administrationUpdated', { detail: payload }));
      }
    });

    return () => {
      try {
        s.removeAllListeners();
        s.disconnect();
      } catch (e) {
        // ignore
      }
    };
  }, [currentUser?.id]);

  return <RealtimeContext.Provider value={{ socket }}>{children}</RealtimeContext.Provider>;
};

export const useRealtime = () => useContext(RealtimeContext);

export default RealtimeContext;
