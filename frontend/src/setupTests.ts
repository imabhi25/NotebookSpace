import '@testing-library/jest-dom';
import { beforeAll } from 'vitest';
import { preloadViews } from './lazyView';

// Load every code-split view up front so tests render synchronously, as they did before splitting.
beforeAll(async () => {
  await import('./App');
  await preloadViews();
});
