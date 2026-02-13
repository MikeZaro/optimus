import { useEffect, useMemo, useRef, useState } from 'react';
import AppNav from './components/AppNav';
import './CalendarApp.css';

const API_URL = 'http://localhost:3001/api';
const GOOGLE_EVENT_EDIT_URL = 'https://calendar.google.com/calendar/u/0/r/eventedit';
const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toGoogleDateTime = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hour}${minute}${second}`;
};

function CalendarApp() {
  const calendarUrl = import.meta.env.VITE_CALENDAR_URL || 'https://calendar.google.com';
  const [todayBase] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [selectedDate, setSelectedDate] = useState(todayBase);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState('');
  const [feedConnected, setFeedConnected] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventStart, setNewEventStart] = useState('09:00');
  const [newEventEnd, setNewEventEnd] = useState('10:00');
  const [newEventDetails, setNewEventDetails] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [googleConnected, setGoogleConnected] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [googleAuthUrl, setGoogleAuthUrl] = useState('');
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [eventFeedback, setEventFeedback] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [visibleMonthLabel, setVisibleMonthLabel] = useState(
    todayBase.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  );
  const leftPanelRef = useRef(null);
  const dateRowRefs = useRef([]);

  const dayList = useMemo(() => (
    Array.from({ length: 90 }, (_, index) => {
      const date = new Date(todayBase);
      date.setDate(todayBase.getDate() + index);
      return date;
    })
  ), [todayBase]);

  useEffect(() => {
    let cancelled = false;

    const loadEvents = async () => {
      try {
        setEventsLoading(true);
        setEventsError('');
        const response = await fetch(`${API_URL}/calendar/events?date=${toDateKey(selectedDate)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || `Calendar events error (${response.status})`);
        }

        if (!cancelled) {
          setFeedConnected(true);
          const nextEvents = data.events || [];
          setEvents(nextEvents);
          setSelectedEvent((prev) => {
            if (!prev) return nextEvents[0] || null;
            const match = nextEvents.find((event) => event.id === prev.id);
            return match || nextEvents[0] || null;
          });
        }
      } catch (error) {
        if (!cancelled) {
          setEvents([]);
          setSelectedEvent(null);
          setEventsError(error.message || 'Failed to load calendar feed');
          if ((error.message || '').includes('not configured')) {
            setFeedConnected(false);
          }
        }
      } finally {
        if (!cancelled) {
          setEventsLoading(false);
        }
      }
    };

    loadEvents();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  useEffect(() => {
    let cancelled = false;

    const loadGoogleStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/calendar/google/status`);
        const data = await response.json();
        if (!response.ok) return;
        if (cancelled) return;
        setGoogleConnected(Boolean(data.connected));
        setOauthConfigured(Boolean(data.oauthConfigured));
        setGoogleAuthUrl(data.authUrl || '');
      } catch {
        if (!cancelled) {
          setGoogleConnected(false);
        }
      }
    };

    loadGoogleStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDateLabel = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const formatMonthLabel = (date) => date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const formatDateWeekday = (date) => date.toLocaleDateString('en-US', {
    weekday: 'long',
  });

  const formatDateMonthDay = (date) => date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });

  const isSameDay = (a, b) => (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );

  const handleDayListScroll = () => {
    const container = leftPanelRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop + 4;
    let nextVisibleDate = dayList[0];

    for (let i = 0; i < dateRowRefs.current.length; i += 1) {
      const rowEl = dateRowRefs.current[i];
      if (!rowEl) continue;
      if (rowEl.offsetTop + rowEl.offsetHeight > scrollTop) {
        nextVisibleDate = dayList[i];
        break;
      }
    }

    const nextLabel = formatMonthLabel(nextVisibleDate);
    setVisibleMonthLabel((prev) => (prev === nextLabel ? prev : nextLabel));
  };

  const buildGoogleEventUrl = () => {
    const startDate = new Date(selectedDate);
    const endDate = new Date(selectedDate);

    const [startHour, startMinute] = (newEventStart || '09:00').split(':').map(Number);
    const [endHour, endMinute] = (newEventEnd || '10:00').split(':').map(Number);

    startDate.setHours(startHour || 9, startMinute || 0, 0, 0);
    endDate.setHours(endHour || 10, endMinute || 0, 0, 0);

    if (endDate <= startDate) {
      endDate.setTime(startDate.getTime() + (60 * 60 * 1000));
    }

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: newEventTitle || 'New event',
      dates: `${toGoogleDateTime(startDate)}/${toGoogleDateTime(endDate)}`,
      details: newEventDetails || '',
      location: newEventLocation || '',
      ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });

    return `${GOOGLE_EVENT_EDIT_URL}?${params.toString()}`;
  };

  const handleAddEvent = () => {
    const eventUrl = buildGoogleEventUrl();
    window.open(eventUrl, '_blank', 'noopener,noreferrer');
  };

  const handleConnectGoogle = async () => {
    try {
      const response = await fetch(`${API_URL}/calendar/google/auth-url`);
      const data = await response.json();
      if (response.ok && data.authUrl) {
        window.location.href = data.authUrl;
        return;
      }
      setEventFeedback(data?.error || 'Failed to start Google connection.');
    } catch {
      setEventFeedback('Failed to start Google connection.');
    }
  };

  const handleSaveEventDirectly = async () => {
    if (!newEventTitle.trim()) {
      setEventFeedback('Event title is required.');
      return;
    }

    setIsSavingEvent(true);
    setEventFeedback('');
    try {
      const response = await fetch(`${API_URL}/calendar/google/create-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEventTitle.trim(),
          date: toDateKey(selectedDate),
          startTime: newEventStart,
          endTime: newEventEnd,
          details: newEventDetails.trim(),
          location: newEventLocation.trim(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (data?.authUrl) {
          setEventFeedback('Connect Google Calendar first, then save again.');
          setGoogleAuthUrl(data.authUrl);
          setGoogleConnected(false);
          return;
        }
        throw new Error(data?.error || 'Failed to create event');
      }

      setEventFeedback('Event saved to Google Calendar.');
      setGoogleConnected(true);

      const refresh = await fetch(`${API_URL}/calendar/events?date=${toDateKey(selectedDate)}`);
      const refreshData = await refresh.json();
      if (refresh.ok) {
        const nextEvents = refreshData.events || [];
        setEvents(nextEvents);
        setSelectedEvent(nextEvents[0] || null);
      }
    } catch (error) {
      setEventFeedback(error.message || 'Failed to create event');
    } finally {
      setIsSavingEvent(false);
    }
  };

  return (
    <div className="calendar-page">
      <AppNav currentApp="calendar" />

      <main className="calendar-page-content page">
        <h1>Calendar</h1>
        <p>Left: month view. Right: what is on your calendar for the selected day.</p>

        <section className="main-grid">
          <div className="calendar-panel month-card left-panel" ref={leftPanelRef} onScroll={handleDayListScroll}>
                <div className="month-header">
                  <h2>{visibleMonthLabel}</h2>
                  <a href={calendarUrl} target="_blank" rel="noreferrer">Open Personal Calendar</a>
                </div>

                <div className="date-list">
                  {dayList.map((date, index) => (
                    <button
                      type="button"
                      key={date.toISOString()}
                      ref={(element) => {
                        dateRowRefs.current[index] = element;
                      }}
                      className={`date-row ${isSameDay(date, selectedDate) ? 'active' : ''}`}
                      onClick={() => setSelectedDate(date)}
                    >
                      <span className="date-row-weekday">{formatDateWeekday(date)}</span>
                      <span className="date-row-monthday">{formatDateMonthDay(date)}</span>
                    </button>
                  ))}
                </div>
          </div>

          <div className="calendar-day-panel events-card middle-panel">
              <div className="calendar-day-panel-head">
                <h2>{selectedDateLabel}</h2>
                {feedConnected ? <span>Live from your feed</span> : <span>No feed connected</span>}
              </div>

              <div className="calendar-google-status">
                <span className={`calendar-status-pill ${googleConnected ? 'connected' : 'disconnected'}`}>
                  {googleConnected ? 'Google Connected' : 'Google Not Connected'}
                </span>
                {!googleConnected && oauthConfigured && (
                  <button type="button" className="calendar-connect-btn" onClick={handleConnectGoogle}>
                    Connect Google
                  </button>
                )}
                {!oauthConfigured && (
                  <span className="calendar-oauth-missing">Set Google OAuth env vars on server.</span>
                )}
              </div>

              <div className="calendar-add-event">
                <button
                  type="button"
                  className="calendar-add-btn"
                  onClick={() => setShowAddForm((prev) => !prev)}
                >
                  {showAddForm ? 'Hide Add Event' : 'Add Event'}
                </button>
              </div>

              {showAddForm && (
                <div className="calendar-add-form">
                  <input
                    type="text"
                    placeholder="Event title"
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                  />
                  <div className="calendar-add-time-row">
                    <label>
                      Start
                      <input
                        type="time"
                        value={newEventStart}
                        onChange={(e) => setNewEventStart(e.target.value)}
                      />
                    </label>
                    <label>
                      End
                      <input
                        type="time"
                        value={newEventEnd}
                        onChange={(e) => setNewEventEnd(e.target.value)}
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder="Location (optional)"
                    value={newEventLocation}
                    onChange={(e) => setNewEventLocation(e.target.value)}
                  />
                  <textarea
                    placeholder="Details (optional)"
                    rows={2}
                    value={newEventDetails}
                    onChange={(e) => setNewEventDetails(e.target.value)}
                  />
                  <button type="button" className="calendar-add-submit" onClick={handleAddEvent}>
                    Open in Google Calendar
                  </button>
                  <button
                    type="button"
                    className="calendar-add-submit calendar-add-submit-direct"
                    onClick={handleSaveEventDirectly}
                    disabled={isSavingEvent}
                  >
                    {isSavingEvent ? 'Saving...' : 'Save to Calendar'}
                  </button>
                  {eventFeedback && <p className="calendar-add-feedback">{eventFeedback}</p>}
                  {!googleConnected && googleAuthUrl && oauthConfigured && (
                    <button type="button" className="calendar-connect-inline-btn" onClick={() => (window.location.href = googleAuthUrl)}>
                      Connect now to save directly
                    </button>
                  )}
                </div>
              )}

            {eventsLoading && <p className="calendar-day-message">Loading events...</p>}
            {!eventsLoading && eventsError && <p className="calendar-day-message">{eventsError}</p>}

              {!eventsLoading && !eventsError && events.length === 0 && (
                <p className="calendar-day-message">No events scheduled for this day.</p>
              )}

              {!eventsLoading && !eventsError && events.length > 0 && (
                <div className="calendar-day-events">
                  <div className="calendar-events-header">
                    <h3>Today's Schedule</h3>
                    <span className="calendar-events-count">{events.length} {events.length === 1 ? 'event' : 'events'}</span>
                  </div>
                  <div className="calendar-events-list">
                    {events.map((event, idx) => (
                      <button
                        type="button"
                        key={`${event.id || event.title}-${event.start || idx}-${idx}`}
                        className={`calendar-event-item ${selectedEvent?.id === event.id ? 'active' : ''}`}
                        onClick={() => setSelectedEvent(event)}
                      >
                        <div className="calendar-event-time-marker">{event.timeLabel || 'All day'}</div>
                        <div className="calendar-event-details">
                          <h4>{event.title || 'Untitled event'}</h4>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!feedConnected && (
              <div className="calendar-day-setup">
                <p>Add these to `optimus/.env.local` to show events on the right panel:</p>
                  <code>GOOGLE_CALENDAR_API_KEY=... and GOOGLE_CALENDAR_ID=...</code>
              </div>
            )}
          </div>

          <div className="details-panel right-panel">
            {selectedEvent ? (
              <>
                <h2>{selectedEvent.title}</h2>

                <div className="detail-row">
                  <strong>Time:</strong>
                  <span>{selectedEvent.startTime || 'All day'} - {selectedEvent.endTime || 'All day'}</span>
                </div>

                <div className="detail-row">
                  <strong>Date:</strong>
                  <span>{selectedEvent.date || toDateKey(selectedDate)}</span>
                </div>

                <div className="detail-row">
                  <strong>Description:</strong>
                  <span>{selectedEvent.description || 'No description'}</span>
                </div>

                <div className="detail-row">
                  <strong>Location:</strong>
                  <span>{selectedEvent.location || 'None'}</span>
                </div>
              </>
            ) : (
              <div className="empty-state">
                Click an event to see details
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default CalendarApp;
