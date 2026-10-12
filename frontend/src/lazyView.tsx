import React, { ComponentType, Suspense, lazy } from 'react';

export interface LazyView<P> extends React.FC<P> {
  preload: () => Promise<void>;
}

const registry: Array<() => Promise<void>> = [];

// Loads a view's code on first render. Once the code is in, the view renders directly,
// so a preloaded view never flashes its fallback.
export function lazyView<P extends object>(
  load: () => Promise<ComponentType<P>>,
  fallback: React.ReactNode = null
): LazyView<P> {
  let Loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const loadOnce = () => {
    if (!pending) {
      pending = load().then((component) => {
        Loaded = component;
        return component;
      });
    }
    return pending;
  };
  const Lazy = lazy(() => loadOnce().then((component) => ({ default: component }))) as unknown as ComponentType<P>;

  const View = ((props: P) =>
    Loaded ? (
      <Loaded {...props} />
    ) : (
      <Suspense fallback={fallback}>
        <Lazy {...props} />
      </Suspense>
    )) as LazyView<P>;
  View.preload = () => loadOnce().then(() => undefined);
  registry.push(View.preload);
  return View;
}

// Fetches every view registered so far. Views declared inside a lazy chunk register when that chunk loads.
export async function preloadViews(): Promise<void> {
  let seen = 0;
  while (seen < registry.length) {
    const batch = registry.slice(seen);
    seen = registry.length;
    await Promise.all(batch.map((preload) => preload()));
  }
}

export function preloadWhenIdle(view: { preload: () => Promise<void> }): void {
  if (typeof window === 'undefined') return;
  const run = () => {
    view.preload().catch(() => undefined);
  };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 600);
  }
}
