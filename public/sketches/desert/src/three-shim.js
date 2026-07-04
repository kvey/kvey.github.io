// Re-export three from the same absolute URL the page importmap uses. Module
// workers don't get the page's importmap, so any module a worker loads cannot
// resolve the bare `three` specifier. Files that need to run in BOTH the main
// thread and the geometry worker import THREE from here instead — the URL
// matches the importmap exactly, so the browser resolves both to one cached
// module (a single shared THREE instance, no duplication).
export * from 'https://unpkg.com/three@0.160.0/build/three.module.js';
