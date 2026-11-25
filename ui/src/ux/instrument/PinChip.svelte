<script lang="ts">
  /**
   * The pinned part as a live readout in the stage header. The inspector is hidden on small
   * screens; this is not — and it says what is pinned when the pointer is elsewhere.
   */
  import { sel, unpin, partLabel, partReading } from './selection.svelte';

  const part = $derived(sel.part);
</script>

{#if part}
  <span class="pin" role="status">
    <i></i>
    <b>{partLabel(part)}</b>
    <span class="mono num">{partReading(part)}</span>
    <button onclick={unpin} title="Unpin — the inspector returns to the selection" aria-label="Unpin {partLabel(part)}">✕</button>
  </span>
{/if}

<style>
  .pin {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 4px 0 9px;
    border-radius: 8px;
    border: 1px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--panel));
    font-size: 12px;
    white-space: nowrap;
  }
  .pin i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent-glow);
  }
  .pin b {
    font-weight: 600;
    color: var(--ink);
  }
  .pin span {
    color: var(--ink2);
    font-size: 11.5px;
  }
  .pin button {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ink3);
    font-size: 11px;
  }
  .pin button:hover {
    color: var(--ink);
    background: var(--panel2);
  }
  /* Below this the stage has no room for the chip beside the mode switch and the scale; the
     scenes then show the reading next to their "pin" control instead. */
  @media (max-width: 1399px) {
    .pin {
      display: none;
    }
  }
</style>
