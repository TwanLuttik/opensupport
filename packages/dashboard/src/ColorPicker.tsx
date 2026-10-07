import { useEffect, useId, useRef, useState } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return [17, 24, 39];
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (h < 60) [rn, gn, bn] = [c, x, 0];
  else if (h < 120) [rn, gn, bn] = [x, c, 0];
  else if (h < 180) [rn, gn, bn] = [0, c, x];
  else if (h < 240) [rn, gn, bn] = [0, x, c];
  else if (h < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return [(rn + m) * 255, (gn + m) * 255, (bn + m) * 255];
}

export function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#111827";
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const hsv = rgbToHsv(...hexToRgb(safe));

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function paint(h: number, s: number, v: number) {
    onChange(rgbToHex(...hsvToRgb(h, s, v)));
  }

  function drag(event: React.PointerEvent<HTMLElement>, mode: "sv" | "hue") {
    const el = event.currentTarget;
    function move(pointer: PointerEvent) {
      const box = el.getBoundingClientRect();
      const x = clamp((pointer.clientX - box.left) / box.width, 0, 1);
      const y = clamp((pointer.clientY - box.top) / box.height, 0, 1);
      if (mode === "hue") paint(x * 360, hsv[1], hsv[2]);
      else paint(hsv[0], x, 1 - y);
    }
    move(event.nativeEvent);
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="theme-color" ref={root}>
      <label htmlFor={id}>{label}</label>
      <span className="color-row">
        <button
          type="button"
          className="color-swatch"
          style={{ background: safe }}
          aria-label={`Pick ${label}`}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        />
        <input
          className="input"
          id={id}
          value={value}
          spellCheck={false}
          pattern="#[0-9a-fA-F]{6}"
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
      {open ? (
        <div className="color-pop" role="dialog" aria-label={`${label} color`}>
          <div
            className="color-sv"
            style={{ background: `hsl(${hsv[0]} 100% 50%)` }}
            onPointerDown={(event) => drag(event, "sv")}
          >
            <span className="color-knob" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }} />
          </div>
          <div className="color-hue" onPointerDown={(event) => drag(event, "hue")}>
            <span className="color-knob" style={{ left: `${(hsv[0] / 360) * 100}%`, top: "50%" }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
