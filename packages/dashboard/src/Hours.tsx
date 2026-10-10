import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "./api.js";
import { Status } from "./components.js";
import type { DayHours, OfficeHours, SettingsView } from "./types.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

interface ZoneOption {
  id: string;
  offset: number;
  label: string;
  search: string;
}

function blankWeek(): DayHours[] {
  return DAYS.map((_, index) => (index < 5 ? { open: 9 * 60, close: 17 * 60 } : { open: null, close: null }));
}

function timeZones(): string[] {
  const supported = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const zones = supported.supportedValuesOf?.("timeZone") ?? ["UTC"];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

/** Current offset in minutes, including daylight saving. */
function zoneOffset(zone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"));
  return Math.round((asUtc - now.getTime()) / 60000);
}

function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  return `UTC${sign}${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function zoneOptions(zones: string[], now: Date): ZoneOption[] {
  return zones
    .map((id) => {
      let offset = 0;
      try {
        offset = zoneOffset(id, now);
      } catch {
        return null;
      }
      const place = id.replace(/_/g, " ");
      const label = `${offsetLabel(offset)}  ${place}`;
      return { id, offset, label, search: `${label} ${id}`.toLowerCase() };
    })
    .filter((zone): zone is ZoneOption => zone !== null)
    .sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id));
}

export function Hours() {
  const [hours, setHours] = useState<OfficeHours | null>(null);
  const [zones, setZones] = useState<string[]>([]);
  const [status, setStatus] = useState({ text: "", ok: false });
  const now = useMemo(() => new Date(), []);
  const options = useMemo(() => zoneOptions(zones, now), [zones, now]);

  useEffect(() => {
    api<{ settings: SettingsView }>("/api/dashboard/settings")
      .then((data) => setHours(data.settings.hours))
      .catch((error) => setStatus({ text: error instanceof Error ? error.message : "Could not load hours.", ok: false }));
    setZones(timeZones());
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
          <ZoneSelect
            id="timezone"
            zones={options}
            value={hours.timezone}
            onChange={(timezone) => setHours({ ...hours, timezone })}
          />
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
                  <TimeSelect label={`${DAYS[index]} opens`} disabled={closed} value={day.open} onChange={(open) => setDay(index, { open })} />
                  <TimeSelect label={`${DAYS[index]} closes`} disabled={closed} value={day.close} onChange={(close) => setDay(index, { close })} />
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

function TimeSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (minutes: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const minutes = value ?? 9 * 60;
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  const minuteChoices = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commit(nextHour12: number, nextMinute: number, nextPeriod: "AM" | "PM") {
    const base = nextHour12 % 12;
    const hour = nextPeriod === "PM" ? base + 12 : base;
    onChange(hour * 60 + nextMinute);
  }

  return (
    <div className={open ? "time-select is-open" : "time-select"} ref={root}>
      <button className="time-face" type="button" aria-label={label} aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}>
        <span>{String(hour12).padStart(2, "0")}</span>
        <span className="time-colon">:</span>
        <span>{String(minute).padStart(2, "0")}</span>
        <span className="time-period">{period}</span>
      </button>
      {open && !disabled ? (
        <div className="time-pop" role="dialog" aria-label={label}>
          <div className="time-cols">
            <TimeColumn
              label="Hour"
              values={HOURS}
              selected={hour12}
              format={(item) => String(item).padStart(2, "0")}
              onPick={(item) => commit(item, minute, period)}
            />
            <TimeColumn
              label="Minute"
              values={minuteChoices}
              selected={minute}
              format={(item) => String(item).padStart(2, "0")}
              onPick={(item) => commit(hour12, item, period)}
            />
            <TimeColumn
              label="Period"
              values={["AM", "PM"]}
              selected={period}
              format={(item) => item}
              onPick={(item) => commit(hour12, minute, item)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TimeColumn<T extends string | number>({
  label,
  values,
  selected,
  format,
  onPick,
}: {
  label: string;
  values: T[];
  selected: T;
  format: (value: T) => string;
  onPick: (value: T) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const current = list.current?.querySelector<HTMLButtonElement>("[aria-selected='true']");
    current?.scrollIntoView({ block: "center" });
  }, [selected]);
  return (
    <div className="time-col">
      <span>{label}</span>
      <div ref={list} role="listbox" aria-label={label}>
        {values.map((value) => (
          <button key={String(value)} type="button" role="option" aria-selected={value === selected} onClick={() => onPick(value)}>
            {format(value)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ZoneSelect({
  id,
  zones,
  value,
  onChange,
}: {
  id: string;
  zones: ZoneOption[];
  value: string;
  onChange: (zone: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const selected = zones.find((zone) => zone.id === value);
  const shown = zones.filter((zone) => !query.trim() || zone.search.includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const current = root.current?.querySelector<HTMLButtonElement>("[aria-selected='true']");
    current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  return (
    <div className={open ? "zone-select is-open" : "zone-select"} ref={root}>
      <button
        className="zone-face"
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
      >
        <span>{selected ? offsetLabel(selected.offset) : "UTC"}</span>
        <strong>{value.replace(/_/g, " ")}</strong>
      </button>
      {open ? (
        <div className="zone-pop">
          <input
            className="input"
            type="search"
            placeholder="Search a city or offset"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="zone-list" id={listId} role="listbox" aria-label="Timezone">
            {shown.length === 0 ? <p className="muted">No timezone matches.</p> : null}
            {shown.map((zone) => (
              <button
                key={zone.id}
                type="button"
                role="option"
                aria-selected={zone.id === value}
                onClick={() => {
                  onChange(zone.id);
                  setOpen(false);
                }}
              >
                <span>{offsetLabel(zone.offset)}</span>
                <strong>{zone.id.replace(/_/g, " ")}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
