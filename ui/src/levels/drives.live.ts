/**
 * Storage-chain readouts over the mock telemetry (levels/drives · drive).
 *
 * The drive itself — its drawing, its canvas, what its colour encodes, its hover cards and the
 * capacity formats — is defined once, with its scene: `scene/Drive.svelte` (module script). This
 * module passes that on, so a level has one import, and adds what only a level needs: how a
 * kind of drive is named in a sentence.
 *
 * Nothing here is a second model: every number is read from the store, and every truth word
 * comes from mock/telemetry.ts.
 */
import type { DriveKind } from '../mock/telemetry';
import {
  DRIVE_CALLOUT,
  DRIVE_CANVAS,
  NO_DATA_WHY,
  SHARE_TRUTH,
  cap,
  capPair,
  capShort,
  driveCard,
  driveValue,
  hours,
  mbs,
  partitionCard,
  pct,
  pctText,
  readingText,
  shortModel,
} from '../scene/Drive.svelte';

export {
  DRIVE_CALLOUT,
  DRIVE_CANVAS,
  NO_DATA_WHY,
  SHARE_TRUTH,
  cap,
  capPair,
  capShort,
  driveCard,
  driveValue,
  hours,
  mbs,
  partitionCard,
  pct,
  pctText,
  readingText,
  shortModel,
};

/** How a kind of drive is named in a sentence — the level's own description, not a reading. */
export const KIND_TEXT: Record<DriveKind, string> = { nvme: 'an NVMe stick', ssd: 'a SATA SSD', hdd: 'a hard disk' };

/** "an NVMe stick, a SATA SSD and a hard disk" — the drives there are, in order, each named once. */
export function describeKinds(kinds: DriveKind[]): string {
  const names = [...new Set(kinds)].map((k) => KIND_TEXT[k]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
