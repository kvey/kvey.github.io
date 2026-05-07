import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

const h = React.createElement;
const DAY_PEAK_ELEVATION = 80;
const NIGHT_MIN_ELEVATION = -18;
const DEFAULT_TIME_OF_YEAR = 80;
const TUCSON_LATITUDE_DEG = 32.2226;
const TUCSON_LONGITUDE_DEG = -110.9747;
const ARIZONA_TIME_ZONE_OFFSET = -7;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RATE_MAX = 1024;
const RATE_STEP = 4;

export function mountDesertUi(container, options = {}) {
  const root = createRoot(container);
  let setProgressState = () => {};
  let setSunControlsState = () => {};

  function setGenerationProgress(progress, visible = true, phase = '') {
    setProgressState({
      progress: clamp(progress, 0, 1),
      visible,
      phase,
    });
  }

  function setSunControls(next) {
    setSunControlsState(current => ({ ...current, ...next }));
  }

  root.render(h(DesertUi, {
    bindProgressSetter: setter => { setProgressState = setter; },
    bindSunControlsSetter: setter => { setSunControlsState = setter; },
    ...options,
  }));

  return { setGenerationProgress, setSunControls };
}

export function sunElevationFromTimeOfDay(timeOfDay) {
  const hour = ((timeOfDay % 24) + 24) % 24;
  const cycle = Math.sin(((hour - 6) / 12) * Math.PI);
  return cycle >= 0
    ? cycle * DAY_PEAK_ELEVATION
    : cycle * -NIGHT_MIN_ELEVATION;
}

export function timeOfDayFromSunElevation(elevation, previousTimeOfDay = 7) {
  const wasAfternoon = previousTimeOfDay > 12 && previousTimeOfDay < 24;
  const wasLateNight = previousTimeOfDay >= 18 || previousTimeOfDay < 6;
  if (elevation >= 0) {
    const offset = Math.asin(clamp(elevation / DAY_PEAK_ELEVATION, 0, 1)) * 12 / Math.PI;
    return wasAfternoon ? 18 - offset : 6 + offset;
  }

  const offset = Math.asin(clamp(-elevation / -NIGHT_MIN_ELEVATION, 0, 1)) * 12 / Math.PI;
  return wasLateNight ? wrapTimeOfDay(18 + offset) : wrapTimeOfDay(6 - offset);
}

export function tucsonSolarPosition(timeOfDay, timeOfYear = DEFAULT_TIME_OF_YEAR) {
  const dayOfYear = clamp(Math.round(timeOfYear), 1, 365);
  const localHour = wrapTimeOfDay(timeOfDay);
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (localHour - 12) / 24);
  const equationOfTime = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  );
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const timeOffset = equationOfTime + 4 * TUCSON_LONGITUDE_DEG - 60 * ARIZONA_TIME_ZONE_OFFSET;
  let trueSolarMinutes = (localHour * 60 + timeOffset) % 1440;
  if (trueSolarMinutes < 0) trueSolarMinutes += 1440;

  let hourAngleDeg = trueSolarMinutes / 4 - 180;
  if (hourAngleDeg < -180) hourAngleDeg += 360;

  const latitude = degToRad(TUCSON_LATITUDE_DEG);
  const hourAngle = degToRad(hourAngleDeg);
  const sinElevation =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = radToDeg(Math.asin(clamp(sinElevation, -1, 1)));
  const cosElevation = Math.max(0.0001, Math.cos(degToRad(elevation)));
  const sinAzimuth = -Math.cos(declination) * Math.sin(hourAngle) / cosElevation;
  const cosAzimuth =
    (Math.sin(declination) - Math.sin(degToRad(elevation)) * Math.sin(latitude)) /
    (cosElevation * Math.cos(latitude));
  const azimuth = normalizeDegrees(radToDeg(Math.atan2(sinAzimuth, cosAzimuth)));

  return { sunAzimuth: azimuth, sunElevation: elevation };
}

function DesertUi({
  bindProgressSetter,
  bindSunControlsSetter,
  initialTimeOfDay = 7,
  initialTimeOfYear = DEFAULT_TIME_OF_YEAR,
  initialSunAzimuth = 145,
  onControlModeChange = () => {},
  onSunControlsChange = () => {},
}) {
  const [activePanel, setActivePanel] = useState(null);
  const [isFullControls, setIsFullControls] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [sunControls, setSunControls] = useState({
    timeOfDay: initialTimeOfDay,
    timeOfYear: initialTimeOfYear,
    sunAzimuth: initialSunAzimuth,
  });
  const [progress, setProgress] = useState({ progress: 0, visible: false, phase: '' });
  const leftToolbarRef = useRef(null);
  const sunControlsRef = useRef(sunControls);
  const onSunControlsChangeRef = useRef(onSunControlsChange);
  const rateRef = useRef(rate);
  sunControlsRef.current = sunControls;
  onSunControlsChangeRef.current = onSunControlsChange;
  rateRef.current = rate;

  useEffect(() => {
    bindProgressSetter(setProgress);
    bindSunControlsSetter(setSunControls);
  }, [bindProgressSetter, bindSunControlsSetter]);

  useEffect(() => {
    onControlModeChange(isFullControls);
  }, [isFullControls, onControlModeChange]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    let rafId;
    let lastTime = performance.now();
    const tick = now => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const current = sunControlsRef.current;
      const nextTimeOfDay = wrapTimeOfDay(current.timeOfDay + (dt * rateRef.current) / 3600);
      const next = { ...current, timeOfDay: nextTimeOfDay };
      const solar = tucsonSolarPosition(next.timeOfDay, next.timeOfYear);
      sunControlsRef.current = next;
      setSunControls(next);
      onSunControlsChangeRef.current({
        timeOfDay: next.timeOfDay,
        timeOfYear: next.timeOfYear,
        sunAzimuth: solar.sunAzimuth,
        sunElevation: solar.sunElevation,
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  useEffect(() => {
    if (!activePanel) return undefined;
    function onPointerDown(event) {
      if (leftToolbarRef.current && !leftToolbarRef.current.contains(event.target)) {
        setActivePanel(null);
      }
    }
    function onKey(event) {
      if (event.key === 'Escape') setActivePanel(null);
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [activePanel]);

  function applySunControls(nextPartial) {
    const next = { ...sunControls, ...nextPartial };
    const solarPosition = tucsonSolarPosition(next.timeOfDay, next.timeOfYear);
    setSunControls(next);
    onSunControlsChange({
      timeOfDay: next.timeOfDay,
      timeOfYear: next.timeOfYear,
      sunAzimuth: solarPosition.sunAzimuth,
      sunElevation: solarPosition.sunElevation,
    });
  }

  function togglePanel(name) {
    setActivePanel(current => (current === name ? null : name));
  }

  function rewind() {
    setIsPlaying(true);
    setRate(current => {
      if (current > 0) return -1;
      return Math.max(-RATE_MAX, current * RATE_STEP);
    });
  }

  function fastForward() {
    setIsPlaying(true);
    setRate(current => {
      if (current < 0) return 1;
      return Math.min(RATE_MAX, current * RATE_STEP);
    });
  }

  function resetToNow() {
    const now = new Date();
    const nextTimeOfDay = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const nextTimeOfYear = dayOfYearFromDate(now);
    setRate(1);
    setIsPlaying(false);
    applySunControls({ timeOfDay: nextTimeOfDay, timeOfYear: nextTimeOfYear });
  }

  return h('div', {
    className: 'glass-ui',
    onPointerDown: stopPropagation,
    onPointerMove: stopPropagation,
    onWheel: stopPropagation,
  },
    h('div', { className: 'gui-toolbar gui-toolbar-left', ref: leftToolbarRef },
      h('div', { className: 'gui-glass gui-pill' },
        h(IconButton, {
          icon: BackIcon,
          label: 'Back',
          onClick: () => { window.location.href = '/sketches'; },
        }),
        h('div', { className: 'gui-pill-divider' }),
        h(IconButton, {
          icon: HelpIcon,
          label: 'Help',
          isActive: activePanel === 'help',
          onClick: () => togglePanel('help'),
        }),
        h('div', { className: 'gui-pill-divider' }),
        h(IconButton, {
          icon: InfoIcon,
          label: 'About',
          isActive: activePanel === 'about',
          onClick: () => togglePanel('about'),
        }),
      ),
      activePanel === 'help' && h('div', { className: 'gui-glass gui-panel' }, h(HelpContent)),
      activePanel === 'about' && h('div', { className: 'gui-glass gui-panel' }, h(AboutContent)),
    ),

    h('div', { className: 'gui-toolbar gui-toolbar-right' },
      h('div', { className: 'gui-glass gui-pill' },
        h('button', {
          className: 'gui-toggle',
          type: 'button',
          'aria-pressed': isFullControls,
          onClick: () => setIsFullControls(value => !value),
        },
          h('span', { className: isFullControls ? '' : 'is-active' }, 'Simple'),
          h('span', { className: isFullControls ? 'is-active' : '' }, 'Full'),
        ),
      ),
      !isFullControls && h('div', { className: 'gui-glass gui-controls' },
        h(SimpleSunControls, {
          timeOfDay: sunControls.timeOfDay,
          timeOfYear: sunControls.timeOfYear,
          isPlaying,
          rate,
          onTogglePlay: () => setIsPlaying(value => !value),
          onRewind: rewind,
          onFastForward: fastForward,
          onReset: resetToNow,
          onTimeChange: value => applySunControls({ timeOfDay: value }),
          onTimeOfYearChange: value => applySunControls({ timeOfYear: value }),
        }),
      ),
    ),

    progress.visible && h('div', { className: 'gui-glass gui-progress' }, h(ProgressView, progress)),
  );
}

function IconButton({ icon: Icon, label, isActive, onClick }) {
  return h('button', {
    className: `gui-icon-button${isActive ? ' is-active' : ''}`,
    type: 'button',
    'aria-pressed': isActive,
    onClick,
  },
    h(Icon),
    h('span', null, label),
  );
}

function HelpContent() {
  return h('div', null,
    h('div', { className: 'gui-panel-eyebrow' }, 'Controls'),
    h('h2', { className: 'gui-panel-title' }, 'Move through the desert'),
    h('div', { className: 'gui-keys' },
      h('div', { className: 'gui-keys-label' }, 'Fly forward / strafe'),
      h('div', { className: 'gui-keys-row' },
        h('span', { className: 'gui-key' }, 'W'),
        h('span', { className: 'gui-key' }, 'A'),
        h('span', { className: 'gui-key' }, 'S'),
        h('span', { className: 'gui-key' }, 'D'),
      ),
      h('div', { className: 'gui-keys-label' }, 'Vertical'),
      h('div', { className: 'gui-keys-row' },
        h('span', { className: 'gui-key' }, 'Space'),
        h('span', { className: 'gui-key-sep' }, '/'),
        h('span', { className: 'gui-key' }, '⇧'),
        h('span', { className: 'gui-key' }, 'Space'),
      ),
      h('div', { className: 'gui-keys-label' }, 'Look around'),
      h('div', { className: 'gui-keys-row' },
        h('span', { className: 'gui-key' }, 'Drag'),
      ),
      h('div', { className: 'gui-keys-label' }, 'Zoom'),
      h('div', { className: 'gui-keys-row' },
        h('span', { className: 'gui-key' }, 'Scroll'),
      ),
    ),
    h('div', { className: 'gui-panel-foot' },
      h('span', null, 'Esc to close'),
    ),
  );
}

function AboutContent() {
  return h('div', null,
    h('div', { className: 'gui-panel-eyebrow' }, 'Sketch · 2026'),
    h('h2', { className: 'gui-panel-title' }, 'Tucson Desert'),
    h('div', { className: 'gui-panel-body' },
      h('p', null,
        'A zen garden, built out of love for Tucson and the desert. I was born and raised here.'
      ),
      h('p', null,
        'In memory of:'
      ),
      h('div', { className: 'gui-memorial' },
        h('div', { className: 'gui-memorial-name' },
          h('strong', null, 'Larry William Pierson'),
          h('span', { className: 'gui-memorial-dates' }, '1966 – 2025'),
        ),
        h('div', { className: 'gui-memorial-name' },
          h('strong', null, 'Alice Gutierrez'),
          h('span', { className: 'gui-memorial-dates' }, '1949 – 2026'),
        ),
      ),
      h('p', null,
        'The sun follows real Tucson coordinates — ', h('strong', null, '32.22°N, 110.97°W'),
        '. Built with Three.js, simplex-noise, and custom GLSL shaders. Switch to ',
        h('strong', null, 'Full'), ' to tune every parameter.'
      ),
    ),
    h('div', { className: 'gui-panel-foot' },
      h('span', null, 'by Colton Pierson'),
      h('a', { href: '/sketches', }, 'More sketches →'),
    ),
  );
}

function SimpleSunControls({
  timeOfDay, timeOfYear, isPlaying, rate,
  onTogglePlay, onRewind, onFastForward, onReset,
  onTimeChange, onTimeOfYearChange,
}) {
  return h('div', null,
    h('div', { className: 'gui-controls-head' },
      h('span', { className: 'gui-controls-location' }, 'Tucson · 32.22°N'),
      h('button', {
        className: 'gui-controls-reset',
        type: 'button',
        title: 'Reset to current Tucson time',
        onClick: onReset,
      },
        h(ResetIcon),
        h('span', null, 'Now'),
      ),
    ),
    h(SliderControl, {
      label: 'Time of day',
      icon: SunIcon,
      trackClass: 'gui-slider-day',
      valueLabel: formatTimeOfDay(timeOfDay),
      value: timeOfDay,
      min: 0,
      max: 24,
      step: 0.25,
      onChange: onTimeChange,
    }),
    h('div', { className: 'gui-media-row' },
      h('button', {
        className: 'gui-media-button',
        type: 'button',
        'aria-label': 'Rewind',
        title: 'Rewind',
        onClick: onRewind,
      }, h(RewindIcon)),
      h('button', {
        className: `gui-media-button gui-media-play${isPlaying ? ' is-playing' : ''}`,
        type: 'button',
        'aria-pressed': isPlaying,
        'aria-label': isPlaying ? 'Pause time' : 'Play time',
        title: isPlaying ? 'Pause' : 'Play',
        onClick: onTogglePlay,
      }, isPlaying ? h(PauseIcon) : h(PlayIcon)),
      h('button', {
        className: 'gui-media-button',
        type: 'button',
        'aria-label': 'Fast forward',
        title: 'Fast forward',
        onClick: onFastForward,
      }, h(FastForwardIcon)),
      h('span', {
        className: `gui-rate-badge${rate !== 1 || isPlaying ? ' is-active' : ''}`,
      }, formatRate(rate)),
    ),
    h(SliderControl, {
      label: 'Time of year',
      icon: LeafIcon,
      trackClass: 'gui-slider-year',
      valueLabel: formatTimeOfYear(timeOfYear),
      value: timeOfYear,
      min: 1,
      max: 365,
      step: 1,
      onChange: onTimeOfYearChange,
    }),
  );
}

function SliderControl({ label, icon: Icon, trackClass, valueLabel, value, min, max, step, onChange, action }) {
  return h('label', { className: 'gui-slider' },
    h('div', { className: 'gui-slider-head' },
      h('span', { className: 'gui-slider-label' },
        Icon && h(Icon),
        h('span', null, label),
      ),
      h('span', { className: 'gui-slider-meta' },
        h('span', { className: 'gui-slider-value' }, valueLabel),
        action,
      ),
    ),
    h('div', { className: `gui-slider-track ${trackClass || ''}`.trim() },
      h('input', {
        type: 'range',
        min,
        max,
        step,
        value,
        onChange: event => onChange(Number(event.target.value)),
      }),
    ),
  );
}

function ProgressView({ progress, phase }) {
  return h('div', null,
    h('div', { className: 'gui-progress-label' },
      h('span', null, phase || 'Generating'),
      h('span', null, `${Math.round(progress * 100)}%`),
    ),
    h('div', { className: 'gui-progress-track' },
      h('div', {
        className: 'gui-progress-bar',
        style: { width: `${progress * 100}%` },
      }),
    ),
  );
}

/* ---------- Icons ---------- */
function BackIcon() {
  return h('svg', {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true,
  },
    h('path', { d: 'M19 12H5' }),
    h('path', { d: 'M12 19l-7-7 7-7' }),
  );
}

function HelpIcon() {
  return h('svg', {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true,
  },
    h('circle', { cx: 12, cy: 12, r: 9.5 }),
    h('path', { d: 'M9 9.5c0-1.7 1.34-3 3-3s3 1.3 3 3c0 1.5-3 2-3 4.2' }),
    h('circle', { cx: 12, cy: 17, r: 0.6, fill: 'currentColor', stroke: 'none' }),
  );
}

function InfoIcon() {
  return h('svg', {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true,
  },
    h('circle', { cx: 12, cy: 12, r: 9.5 }),
    h('path', { d: 'M12 11v5.5' }),
    h('circle', { cx: 12, cy: 7.5, r: 0.6, fill: 'currentColor', stroke: 'none' }),
  );
}

function SunIcon() {
  return h('svg', {
    width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true,
  },
    h('circle', { cx: 12, cy: 12, r: 4 }),
    h('path', { d: 'M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19' }),
  );
}

function PlayIcon() {
  return h('svg', {
    width: 11, height: 11, viewBox: '0 0 24 24', fill: 'currentColor',
    'aria-hidden': true,
  },
    h('path', { d: 'M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z' }),
  );
}

function PauseIcon() {
  return h('svg', {
    width: 11, height: 11, viewBox: '0 0 24 24', fill: 'currentColor',
    'aria-hidden': true,
  },
    h('rect', { x: 6, y: 4.5, width: 4, height: 15, rx: 1 }),
    h('rect', { x: 14, y: 4.5, width: 4, height: 15, rx: 1 }),
  );
}

function RewindIcon() {
  return h('svg', {
    width: 12, height: 12, viewBox: '0 0 24 24', fill: 'currentColor',
    'aria-hidden': true,
  },
    h('path', { d: 'M11 5L2 12l9 7V5z' }),
    h('path', { d: 'M22 5l-9 7 9 7V5z' }),
  );
}

function FastForwardIcon() {
  return h('svg', {
    width: 12, height: 12, viewBox: '0 0 24 24', fill: 'currentColor',
    'aria-hidden': true,
  },
    h('path', { d: 'M2 5l9 7-9 7V5z' }),
    h('path', { d: 'M13 5l9 7-9 7V5z' }),
  );
}

function ResetIcon() {
  return h('svg', {
    width: 11, height: 11, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true,
  },
    h('path', { d: 'M3 4v6h6' }),
    h('path', { d: 'M3.51 15a9 9 0 1 0 2.13-9.36L3 8' }),
  );
}

function LeafIcon() {
  return h('svg', {
    width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true,
  },
    h('path', { d: 'M20 4c-9 0-15 5-15 12 0 2 .8 3.6 1.6 4.4' }),
    h('path', { d: 'M6.5 20.5C9 14 14 9 20 8' }),
  );
}

/* ---------- Helpers ---------- */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapTimeOfDay(timeOfDay) {
  return ((timeOfDay % 24) + 24) % 24;
}

function formatTimeOfDay(timeOfDay) {
  const totalMinutes = Math.round(wrapTimeOfDay(timeOfDay) * 60);
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatRate(rate) {
  const sign = rate < 0 ? '−' : '';
  return `${sign}${Math.abs(rate)}×`;
}

function dayOfYearFromDate(date) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const here = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((here - start) / 86400000);
}

function formatTimeOfYear(dayOfYear) {
  const date = new Date(Date.UTC(2025, 0, clamp(Math.round(dayOfYear), 1, 365)));
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function degToRad(degrees) {
  return degrees * Math.PI / 180;
}

function radToDeg(radians) {
  return radians * 180 / Math.PI;
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function stopPropagation(event) {
  event.stopPropagation();
}
