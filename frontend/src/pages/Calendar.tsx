import { useState, useRef, useEffect, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { EventInput, DateSelectArg, EventClickArg } from "@fullcalendar/core";
import { Modal } from "../components/ui/modal";
import { useModal } from "../hooks/useModal";
import PageMeta from "../components/common/PageMeta";

interface CalendarEvent extends EventInput {
  extendedProps: Record<string, any>;
}

const Calendar: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  // removed generic eventTitle in favor of appointment fields
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventLevel, setEventLevel] = useState("");
  // Appointment-specific fields
  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [doctor, setDoctor] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [appointmentType, setAppointmentType] = useState<"InPerson" | "Telemed" | "Urgent">("InPerson");
  const [notes, setNotes] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const calendarRef = useRef<FullCalendar>(null);
  const { isOpen, openModal, closeModal } = useModal();
  // Show only current patient's appointments by default
  const [currentPatientName, setCurrentPatientName] = useState<string>("");
  const [onlyMine, setOnlyMine] = useState(true);

  // calendar color presets removed (not used)

  useEffect(() => {
    // Initialize with some events
    setEvents([
      {
        id: "1",
        title: "Event Conf.",
        start: new Date().toISOString().split("T")[0],
        extendedProps: { calendar: "Danger" },
      },
      {
        id: "2",
        title: "Meeting",
        start: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        extendedProps: { calendar: "Success" },
      },
      {
        id: "3",
        title: "Workshop",
        start: new Date(Date.now() + 172800000).toISOString().split("T")[0],
        end: new Date(Date.now() + 259200000).toISOString().split("T")[0],
        extendedProps: { calendar: "Primary" },
      },
    ]);
  }, []);

  // load current patient name from localStorage (if available)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("patientName") || "";
      if (saved) setCurrentPatientName(saved);
    } catch (e) {
      // ignore (SSR/dev)
    }
  }, []);

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    resetModalFields();
    setEventStartDate(selectInfo.startStr);
    setEventEndDate(selectInfo.endStr || selectInfo.startStr);
    openModal();
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const event = clickInfo.event;
    setSelectedEvent(event as unknown as CalendarEvent);
    // populate appointment fields from event extendedProps
    const props = (event as any).extendedProps || {};
    setPatientName(props.patientName || "");
    setPhone(props.phone || "");
    setEmail(props.email || "");
    setDepartment(props.department || "");
    setDoctor(props.doctor || "");
    setAppointmentType(props.appointmentType || "InPerson");
    setNotes(props.notes || "");
    if (event.start) {
      const iso = event.start.toISOString();
      setEventStartDate(iso.split("T")[0]);
      const time = iso.split("T")[1];
      if (time) setAppointmentTime(time.slice(0,5));
    }
    setEventEndDate(event.end?.toISOString().split("T")[0] || "");
    setEventLevel((event as any).extendedProps?.calendar || "");
    openModal();
  };

  const handleAddOrUpdateEvent = () => {
    // Basic validation for appointment
    if (!patientName.trim()) {
      alert("Veuillez saisir le nom du patient.");
      return;
    }
    if (!department) {
      alert("Veuillez sélectionner un service.");
      return;
    }
    if (!eventStartDate) {
      alert("Veuillez choisir une date de rendez-vous.");
      return;
    }

    const title = `RDV: ${department}${doctor ? ` - ${doctor}` : ""}`;
    // Use time if provided to create a datetime
    const start = appointmentTime ? `${eventStartDate}T${appointmentTime}` : eventStartDate;

    if (selectedEvent) {
      // update existing appointment
      setEvents((prevEvents) =>
        prevEvents.map((event) =>
          event.id === selectedEvent.id
            ? {
                ...event,
                title,
                start,
                end: eventEndDate || start,
                extendedProps: {
                  calendar: eventLevel || "Primary",
                  patientName,
                  phone,
                  email,
                  department,
                  doctor,
                  appointmentType,
                  notes,
                },
              }
            : event
        )
      );
    } else {
      // add new appointment
      const newEvent: CalendarEvent = {
        id: Date.now().toString(),
        title,
        start,
        end: eventEndDate || start,
        allDay: !appointmentTime,
        extendedProps: {
          calendar: eventLevel || "Primary",
          patientName,
          phone,
          email,
          department,
          doctor,
          appointmentType,
          notes,
        },
      };
      setEvents((prev) => [...prev, newEvent]);
    }

    closeModal();
    resetModalFields();
  };

  const resetModalFields = () => {
    setEventStartDate("");
    setEventEndDate("");
    setEventLevel("");
    setSelectedEvent(null);
    setPatientName("");
    setPhone("");
    setEmail("");
    setDepartment("");
    setDoctor("");
    setAppointmentTime("");
    setAppointmentType("InPerson");
    setNotes("");
  };

  return (
    <>
      <PageMeta
        title="Calendrier - D7 Clinique"
        description="Gérez vos rendez-vous et événements médicaux avec notre calendrier interactif. Prenez, modifiez ou annulez des rendez-vous en quelques clics, et visualisez tous vos engagements à venir pour une meilleure organisation de votre emploi du temps médical."
      />
      <div className="rounded-2xl border  border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="custom-calendar">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Mes rendez-vous</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Affiche uniquement les rendez-vous du patient connecté</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600 dark:text-gray-400">Afficher uniquement mes RDV</label>
              <input type="checkbox" checked={onlyMine} onChange={() => setOnlyMine((s) => !s)} />
            </div>
          </div>

          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next addEventButton",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            events={useMemo(() => {
              if (onlyMine && currentPatientName) {
                return events.filter((e) => {
                  const pn = (e as any).extendedProps?.patientName || "";
                  return pn === currentPatientName;
                });
              }
              return events;
            }, [events, onlyMine, currentPatientName])}
            selectable={true}
            select={handleDateSelect}
            eventClick={handleEventClick}
            eventContent={renderEventContent}
            customButtons={{
              addEventButton: {
                text: "Nouveau RDV",
                click: openModal,
              },
            }}
          />
        </div>
        <Modal
          isOpen={isOpen}
          onClose={closeModal}
          className="max-w-[700px] p-6 lg:p-10"
        >
          <div className="flex flex-col px-2 overflow-y-auto custom-scrollbar">
            <div>
              <h5 className="mb-2 font-semibold text-gray-800 modal-title text-theme-xl dark:text-white/90 lg:text-2xl">
                {selectedEvent ? "Modifier le rendez-vous" : "Prendre un rendez-vous"}
              </h5>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Remplissez le formulaire pour prendre un rendez-vous à l'hôpital.
              </p>
            </div>
            <div className="mt-8 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Nom du patient</label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Votre nom complet"
                  className="h-11 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Téléphone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+243 99 999 9999"
                    className="h-11 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Email (optionnel)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="exemple@domaine.com"
                    className="h-11 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Service</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    <option value="">Sélectionner un service</option>
                    <option value="Radiologie">Radiologie</option>
                    <option value="Cardiologie">Cardiologie</option>
                    <option value="Biologie médicale">Biologie médicale</option>
                    <option value="Neurologie">Neurologie</option>
                    <option value="Imagerie médicale">Imagerie médicale</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Médecin (optionnel)</label>
                  <input
                    type="text"
                    value={doctor}
                    onChange={(e) => setDoctor(e.target.value)}
                    placeholder="Nom du médecin"
                    className="h-11 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Date du rendez-vous</label>
                  <input
                    type="date"
                    value={eventStartDate}
                    onChange={(e) => setEventStartDate(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Heure (optionnel)</label>
                  <input
                    type="time"
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Type de rendez-vous</label>
                <div className="flex gap-3">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" checked={appointmentType === 'InPerson'} onChange={() => setAppointmentType('InPerson')} />
                    <span className="ml-1">En personne</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" checked={appointmentType === 'Telemed'} onChange={() => setAppointmentType('Telemed')} />
                    <span className="ml-1">Téléconsultation</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" checked={appointmentType === 'Urgent'} onChange={() => setAppointmentType('Urgent')} />
                    <span className="ml-1">Urgent</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Motif / Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  placeholder="Décrivez brièvement la raison de la consultation"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6 modal-footer sm:justify-end">
              <button
                onClick={closeModal}
                type="button"
                className="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] sm:w-auto"
              >
                Annuler
              </button>
              <button
                onClick={handleAddOrUpdateEvent}
                type="button"
                className="btn btn-success btn-update-event flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 sm:w-auto"
              >
                {selectedEvent ? "Mettre à jour" : "Prendre rendez-vous"}
              </button>
            </div>
          </div>
        </Modal>
      </div>
      {/* Upcoming appointments for the current patient */}
      <div className="mt-6 p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Prochains rendez-vous</h4>
        <div className="space-y-3">
          {useMemo(() => {
            const list = events
              .filter((e) => {
                if (onlyMine && currentPatientName) {
                  return ((e as any).extendedProps?.patientName || "") === currentPatientName;
                }
                return true;
              })
              .sort((a, b) => (new Date(a.start as string).getTime() || 0) - (new Date(b.start as string).getTime() || 0))
              .slice(0, 5);
            return list.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-white/90">{ev.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{new Date(ev.start as string).toLocaleString()}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{(ev as any).extendedProps?.doctor || ""}</div>
                </div>
                <div className="text-xs text-gray-500">{(ev as any).extendedProps?.appointmentType || ""}</div>
              </div>
            ));
          }, [events, onlyMine, currentPatientName])}
        </div>
      </div>
    </>
  );
};

const renderEventContent = (eventInfo: any) => {
  const props = eventInfo.event.extendedProps || {};
  const colorClass = `fc-bg-${(props.calendar || "primary").toLowerCase()}`;
  return (
    <div className={`event-fc-color flex fc-event-main ${colorClass} p-1 rounded-sm`}>
      <div className="fc-daygrid-event-dot"></div>
      <div className="flex flex-col">
        <div className="fc-event-time">{eventInfo.timeText}</div>
        <div className="fc-event-title">{eventInfo.event.title}</div>
        {props.patientName && (
          <div className="text-xs text-gray-600 dark:text-gray-400">{props.patientName} {props.appointmentType ? `· ${props.appointmentType}` : ""}</div>
        )}
      </div>
    </div>
  );
};

export default Calendar;

