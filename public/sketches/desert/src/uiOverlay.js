import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import LiquidGlass from 'liquid-glass-react';

const h = React.createElement;

export function mountDesertUi(container) {
  const root = createRoot(container);
  let setProgressState = () => {};

  function setGenerationProgress(progress, visible = true, phase = '') {
    setProgressState({
      progress: clamp(progress, 0, 1),
      visible,
      phase,
    });
  }

  root.render(h(DesertUi, {
    bindProgressSetter: setter => { setProgressState = setter; },
  }));

  return { setGenerationProgress };
}

function DesertUi({ bindProgressSetter }) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [progress, setProgress] = useState({ progress: 0, visible: false, phase: '' });

  bindProgressSetter(setProgress);

  return h('div', {
    className: 'glass-ui',
    onPointerDown: stopPropagation,
    onPointerMove: stopPropagation,
    onWheel: stopPropagation,
  },
    h(LiquidGlass, {
      displacementScale: 30,
      blurAmount: 0.08,
      saturation: 145,
      aberrationIntensity: 1.4,
      elasticity: 0.22,
      cornerRadius: 18,
      padding: '5px 11px',
      style: { position: 'fixed', top: '28px', left: '74px' },
      onClick: () => setIsHelpOpen(open => !open),
    },
      h('button', {
        className: 'glass-ui-button',
        type: 'button',
        'aria-expanded': isHelpOpen,
      }, 'Help'),
    ),
    progress.visible && h(LiquidGlass, {
      displacementScale: 28,
      blurAmount: 0.08,
      saturation: 150,
      aberrationIntensity: 1.4,
      elasticity: 0.16,
      cornerRadius: 18,
      padding: '12px 14px',
      style: { position: 'fixed', top: '34px', left: '50%' },
    }, h(ProgressView, progress)),
    isHelpOpen && h(LiquidGlass, {
      displacementScale: 22,
      blurAmount: 0.07,
      saturation: 135,
      aberrationIntensity: 1.1,
      elasticity: 0.1,
      cornerRadius: 16,
      padding: '10px 12px',
      style: { position: 'fixed', top: 'calc(100% - 42px)', left: '182px' },
    }, h('div', { className: 'glass-ui-hint' },
      h('b', null, 'WASD'), ' fly | ',
      h('b', null, 'Shift+W/S'), ' vertical | ',
      h('b', null, 'Drag'), ' look | ',
      h('b', null, 'Scroll'), ' zoom',
    )),
  );
}

function ProgressView({ progress, phase }) {
  return h('div', { className: 'glass-ui-progress' },
    h('div', { className: 'glass-ui-progress-label' },
      h('span', null, phase || 'Generating'),
      h('span', null, `${Math.round(progress * 100)}%`),
    ),
    h('div', { className: 'glass-ui-progress-track' },
      h('div', {
        className: 'glass-ui-progress-bar',
        style: { width: `${progress * 100}%` },
      }),
    ),
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stopPropagation(event) {
  event.stopPropagation();
}
