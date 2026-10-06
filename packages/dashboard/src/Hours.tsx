import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api.js";
import { Status } from "./components.js";
import type { DayHours, OfficeHours, SettingsView } from "./types.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function blankWeek(): DayHours[] {
  return DAYS.map((_, index) => (index < 5 ? { open: 9 * 60, close: 17 * 60 } : { open: null, close: null }));
}

export function Hours() {
  const [hours, setHours] = useState<OfficeHours | null>(null);
  const [zones, setZones] = useState<string[]>([]);
  const [status, setStatus] = useState({ text: "", ok: false });

  useEffect(() => {
    api<{ settings: SettingsView }>("/api/dashboard/settings")
      .then((data) => setHours(data.settings.hours))
      .catch((error) => setStatus({ text: error instanceof Error ? error.message : "Could not load hours.", ok: false }));
    const supported = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    setZones(supported.supportedValuesOf?.("timeZone") ?? ["UTC"]);
  }, []);

  function setDay(index: number, patch: Partial<DayHours>) {
    setHours((current) => {
      if (!current) return current;
      const days = current.days.map((day, item) => (item === index ? { ...day, ...patch } : day)) as OfficeHours["days"];
      return { ...current, days };
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!hours) return;
    setStatus({ text: "", ok: false });
    try {
      const saved = await api<{ hours: OfficeHours }>("/api/dashboard/hours", {
        method: "PUT",
        body: JSON.stringify(hours),
      });
      setHours(saved.hours);
      setStatus({ text: "Saved.", ok: true });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "Could not save.", ok: false });
    }
  }

  if (!hours) {
    return (
      <div className="settings">
        <Status text={status.text || "Loading hours…"} ok={false} />
      </div>
    );
  }

  return (
    <div className="settings">
      <div className="page-intro">
        <p className="kicker">Desk</p>
        <h1>Open hours</h1>
        <p className="muted">Outside these hours, visitors leave an email instead of starting a live chat.</p>
      </div>
      <section className="panel">
        <form onSubmit={(event) => void save(event)}>
          <label className="switch">
            <span>
              <strong>Limit live chat to these hours</strong>
              <span className="muted">Turn this off and chat stays available all day.</span>
            </span>
            <input type="checkbox" checked={hours.enabled} onChange={(event) => setHours({ ...hours, enabled: event.target.checked })} />
          </label>
          <label className="field-label" htmlFor="timezone">Timezone</label>
          <input
            className="input"
            id="timezone"
            list="timezones"
            value={hours.timezone}
            required
            onChange={(event) => setHours({ ...hours, timezone: event.target.value })}
          />
          <datalist id="timezones">
            {zones.map((zone) => <option key={zone} value={zone} />)}
          </datalist>
          <div className="hours">
            {hours.days.map((day, index) => {
              const closed = day.open === null || day.close === null;
              return (
                <div className="hour-row" key={DAYS[index]}>
                  <strong>{DAYS[index]}</strong>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!closed}
                      onChange={(event) => setDay(index, event.target.checked ? { open: 9 * 60, close: 17 * 60 } : { open: null, close: null })}
                    />
                    Open
                  </label>
                  <input type="time" aria-label={`${DAYS[index]} opens`} disabled={closed} value={toClock(day.open)} onChange={(event) => setDay(index, { open: fromClock(event.target.value) })} />
                  <input type="time" aria-label={`${DAYS[index]} closes`} disabled={closed} value={toClock(day.close)} onChange={(event) => setDay(index, { close: fromClock(event.target.value) })} />
                </div>
              );
            })}
          </div>
          <label className="field-label" htmlFor="closed-message">Closed message</label>
          <textarea className="textarea" id="closed-message" rows={3} required value={hours.closedMessage} onChange={(event) => setHours({ ...hours, closedMessage: event.target.value })} />
          <Status text={status.text} ok={status.ok} />
          <div className="row">
            <button className="btn btn-primary" type="submit">Save hours</button>
            <button className="btn btn-outline" type="button" onClick={() => setHours({ ...hours, days: blankWeek() as OfficeHours["days"] })}>Weekdays 9 to 5</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function toClock(minutes: number | null): string {
  if (minutes === null) return "";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function fromClock(value: string): number | null {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return hour! * 60 + minute!;
}
