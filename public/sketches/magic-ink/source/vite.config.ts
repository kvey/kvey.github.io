import { defineConfig } from 'vite';

// This sketch is served statically at /sketches/magic-ink/, so assets must be
// referenced relatively rather than from the site root.
export default defineConfig({
  base: './',
});
