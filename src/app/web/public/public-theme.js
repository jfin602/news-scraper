/* global HTMLInputElement, document, window */

(() => {
  'use strict';

  const storageKey = 'news-scraper.reader-theme';
  const systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  let selectedMode = readStoredMode();

  applyMode(selectedMode);

  function readStoredMode() {
    try {
      const storedMode = window.localStorage.getItem(storageKey);
      if (storedMode === null) return 'system';
      if (storedMode === 'light' || storedMode === 'dark') return storedMode;
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // An invalid preference still degrades to System when removal fails.
      }
    } catch {
      // Storage can be unavailable even when the page itself is usable.
    }
    return 'system';
  }

  function effectiveMode(mode) {
    return mode === 'system'
      ? systemPreference.matches
        ? 'dark'
        : 'light'
      : mode;
  }

  function applyMode(mode) {
    selectedMode = mode;
    root.dataset.themeSelection = mode;
    root.dataset.themeEffective = effectiveMode(mode);
    if (mode === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.dataset.theme = mode;
    }
  }

  function persistMode(mode) {
    try {
      if (mode === 'system') {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, mode);
      }
    } catch {
      // The in-page choice remains useful even if persistence is unavailable.
    }
  }

  function initializeControl() {
    const options = Array.from(
      document.querySelectorAll('[data-theme-option]'),
    ).filter((option) => option instanceof HTMLInputElement);
    if (options.length !== 3) return;

    for (const option of options) {
      option.checked = option.value === selectedMode;
      option.addEventListener('change', () => {
        if (!option.checked) return;
        if (
          option.value !== 'system' &&
          option.value !== 'light' &&
          option.value !== 'dark'
        ) {
          return;
        }
        applyMode(option.value);
        persistMode(option.value);
      });
    }
  }

  systemPreference.addEventListener('change', () => {
    if (selectedMode === 'system') applyMode('system');
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeControl, {
      once: true,
    });
  } else {
    initializeControl();
  }
})();
