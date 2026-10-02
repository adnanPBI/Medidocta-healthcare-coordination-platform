export const BREAKPOINTS = Object.freeze({
  phoneMax: 767,
  tabletMax: 1199
});

export function layoutModeForWidth(width) {
  const value = Number(width);
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError('width must be a positive finite number');
  }
  if (value <= BREAKPOINTS.phoneMax) return 'phone';
  if (value <= BREAKPOINTS.tabletMax) return 'tablet';
  return 'desktop';
}

export function responsiveContract(width) {
  const mode = layoutModeForWidth(width);

  if (mode === 'phone') {
    return {
      mode,
      navigation: 'drawer',
      primaryFlow: 'stacked',
      search: 'cards-filter-drawer',
      availability: 'agenda-day-strip',
      details: 'stacked',
      calendarDensity: 'agenda-first',
      concurrencySensitiveWrites: 'online-server-authoritative'
    };
  }

  if (mode === 'tablet') {
    return {
      mode,
      navigation: 'adaptive-rail-drawer',
      primaryFlow: 'hybrid',
      search: 'split-filters-results',
      availability: 'calendar-list-hybrid',
      details: 'two-column-when-space-allows',
      calendarDensity: 'day-week-hybrid',
      concurrencySensitiveWrites: 'online-server-authoritative'
    };
  }

  return {
    mode,
    navigation: 'persistent-sidebar',
    primaryFlow: 'multi-column',
    search: 'persistent-filter-rail',
    availability: 'week-calendar-detail-panel',
    details: 'multi-column-side-panel',
    calendarDensity: 'dense-day-week',
    concurrencySensitiveWrites: 'online-server-authoritative'
  };
}
