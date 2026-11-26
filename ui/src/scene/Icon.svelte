<script lang="ts">
  /** Minimal stroke icons (24 × 24). */
  let { name, size = 18 }: { name: string; size?: number } = $props();

  const PATHS: Record<string, string> = {
    overview: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    memory: 'M2.5 7.5h19v8h-19zM6 10.5h4M14 10.5h4M6 15.5v2.5M9 15.5v2.5M12 15.5v2.5M15 15.5v2.5M18 15.5v2.5',
    storage: 'M4 5h16v5.5H4zM4 13.5h16V19H4zM7 7.75h.01M7 16.25h.01M11 7.75h6M11 16.25h6',
    gpu: 'M3 5h18v11H3zM3 3v3M6 16v3.5M9 16v3.5M12 16v3.5M15 16v3.5M18 16v3.5M7.5 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM16 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    cpu: 'M7 7h10v10H7zM10.5 10.5h3v3h-3zM9 7V3.5M12 7V3.5M15 7V3.5M9 20.5V17M12 20.5V17M15 20.5V17M7 9H3.5M7 12H3.5M7 15H3.5M20.5 9H17M20.5 12H17M20.5 15H17',
    apps: 'M4 6.5h16M4 12h16M4 17.5h10',
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20',
    play: 'M7 4.5v15l12-7.5z',
    pause: 'M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z',
    bolt: 'M13 2.5 4.5 13.5H11l-1 8L18.5 10H12z',
    broom: 'M14.5 3.5l6 6M9 9l6 6M9 9l-6.5 9.5c2.5 2 6.5 2 9-.5L15 15M9 9l6 6',
    x: 'M6 6l12 12M18 6L6 18',
    home: 'M4 11.5 12 4.5l8 7M6.5 10v9.5h11V10',
    arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
    chevronRight: 'M9 5l7 7-7 7',
    layers: 'M12 3.5 3.5 8 12 12.5 20.5 8zM4 12.5l8 4.5 8-4.5M4 17l8 4.5 8-4.5',
  };
  const d = $derived(PATHS[name] ?? '');
</script>

<svg viewBox="0 0 24 24" width={size} height={size} class="icon" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path {d} />
</svg>

<style>
  .icon {
    display: block;
    flex: none;
  }
</style>
