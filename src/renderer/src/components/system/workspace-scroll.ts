function scrollElementToTop(node: Element | null) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  if (typeof node.scrollTo === 'function') {
    node.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    return;
  }

  node.scrollTop = 0;
  node.scrollLeft = 0;
}

export function scrollWorkspaceViewportToTop() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  } catch {
    // JSDOM exposes scrollTo but does not implement it.
  }
  scrollElementToTop(document.scrollingElement);

  const mainContent = document.getElementById('main-content');
  scrollElementToTop(mainContent);
  scrollElementToTop(mainContent?.closest('[data-slot="sidebar-inset"]') ?? null);
}
