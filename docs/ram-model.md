# RAM visualization model

Status: decided 2026-11 · the core model of the flagship view

The RAM scene renders a board: one line-art stick per populated slot, chips on each
stick, and a live page grid inside every chip. This document defines exactly which parts
of that picture are **measured** and which are **modeled**, and the rules for both.

## 1. What is real, what is inferred, what is modeled

| Layer | Status | Source |
| --- | --- | --- |
| Populated slots, module maker/PN/serial/speed/type/capacity/rank | **Real** | SMBIOS Type 17 (Windows), DMI/sysfs (Linux), IORegistry (Intel macOS) |
| Number of chips per stick | **Inferred** (tier 1) / **Real** (tier 2) | Tier 1: derived from SMBIOS rank + capacity heuristics. Tier 2: exact, from SPD Module Organization + Density bytes (Linux `decode-dimms`; Windows via SMBus/PawnIO if available) |
| Per-page state & use class | **Real** | Windows Superfetch PFN queries; Linux `kpageflags`/`kpagecount` |
| Per-page owner (process / file) | **Real** where available | Windows: PFN DB + FileInfo driver correlation; Linux: `/proc/<pid>/maps` + `pagemap`. macOS: not available |
| Page → DIMM → chip → grid cell placement | **Modeled** | Deterministic interleave approximation (this doc, §3) — always badged |

The UI carries a persistent small badge on the board: **"chip placement: modeled"** with a
tooltip that explains memory-controller interleaving in two sentences and links here.

## 2. Chip-count inference

### Tier 2 — exact, from SPD (when `SpdFull` capability exists)

SPD gives us:

- `Module Organization` — ranks × data width per rank (e.g. `2R × 8`)
- `Density` — capacity per DRAM die

Exact chip count:

```
chips_per_rank = module_data_width / die_data_width     # e.g. 64-bit / 8-bit = 8
total_chips    = ranks × chips_per_rank
sanity:        ranks × module_data_width / 8 × die_capacity ≈ module_capacity
```

DDR5 specifics: each DIMM is **two independent 32-bit subchannels** (2×32 = 64-bit
module width); on-die ECC is internal to the DRAM dies (no extra chips on non-ECC
UDIMMs); RDIMMs additionally carry register/PMIC/components we draw as the "hub"
component, distinct from DRAM chips.

Worked example — 32 GiB DDR5 UDIMM, dual rank, 16 Gbit x8 dies:

```
2 subchannels × 2 ranks × (32-bit / 8-bit) = 16 DRAM chips
sanity: 16 × 2 GiB = 32 GiB ✓
```

### Tier 1 — heuristic, from SMBIOS only (Windows default)

SMBIOS Type 17 gives rank count (`Attributes[3:0]`) and memory type, but *not* die
geometry. We assume x8 organization (the overwhelming default) and the die capacity that
the module's capacity/rank implies:

```
assumed_die_capacity = module_capacity / (ranks × module_data_width / 8)
chips                = ranks × (module_data_width / 8)      # 8 per rank (DDR4/DDR5 64-bit total)
```

Tier-1 chips are drawn with an "inferred" hairline style (dashed outline) and tooltip
"chip count inferred from SMBIOS organization — connect SMBus/SPD for exact"; tier-2
chips render solid. ECC modules (SMBIOS `TotalWidth > DataWidth`) add the check-bit
chips per rank when the width delta indicates them.

## 3. The interleave approximation (modeled placement)

### The truth we cannot have

Modern memory controllers hash physical addresses across channels, ranks, banks, and
chips to maximize parallelism. Neither Windows, Linux, nor macOS exposes the hash
function. Any tool claiming to show "the actual chip a page lives in" is lying. We will
not lie — but we will show a *plausible, stable, documented* placement, because the
visual value (seeing distribution, sharing, imbalance, and per-file spread) is real.

### Model v1 — parameters and algorithm

```
inputs:
  dimms[]            real inventory (capacity per dimm)
  chips_per_dimm     from §2
  page → (state, use, owner)   real per-PFN data

placement(pfn):
  d    = interleave_hash(pfn) mod dimm_count            # capacity-weighted (see below)
  c    = (pfn >> log2(pages_per_chip_block)) mod chips_per_dimm
  cell = chip_local_cell(pfn, c)                        # bank-ordered traversal (§4)

interleave_hash: FNV-1a(pfn)  — cheap, stable, no patterns at any granularity
capacity-weighted: a 32 GiB stick should hold ~2× the pages of a 16 GiB stick:
  d = weighted_bucket(hash(pfn), weights = dimm_capacities)
```

Why hash instead of round-robin stripes: real controllers use address hashes (not strict
interleave stripes) for channel/rank selection at typical granularities (256 B–4 KiB,
vendor-specific). A hash gives the same *statistical* picture — even spread, adjacent
pages scattered across chips — which is exactly the phenomenon the view teaches.

**Determinism requirement:** the same machine always renders the same placement, so
recordings, screenshots, and conversations are reproducible. Hash + inventory is fully
deterministic.

**Badging:** every chip-grid carries the "modeled placement" badge (§1). Per-page
*data* tooltips always lead with the real facts (PFN, state, owner).

## 4. Chip grid geometry & LOD

A die's pages don't fit on screen (16 Gbit die = 2 GiB = 524,288 pages). LOD ladder:

| Zoom level | Shows | Cells rendered |
| --- | --- | --- |
| Board | sticks + chips as components, chips heat-tinted by local occupancy | ~dozens |
| Stick | chips with bank-block tiles (DDR4 16 banks / DDR5 32 banks) | ~hundreds |
| Chip | bank blocks as macro-cells (each tile = 512–4096 pages, averaged) | ~hundreds |
| Bank block | individual pages, 4 KiB each, striped by bank/row traversal for the classic look | ≤ 4096 |

Cell traversal inside a chip is **bank-major** (page index interleaved across banks),
matching the visual intuition of how DRAM is actually organized; a page's grid position
is therefore stable and "row-like" without claiming physical row addresses.

## 5. Page legend (canonical)

State colors (low nibble of the wire byte) — a single categorical ramp that must read in
both themes:

| State | Meaning (Windows term → Linux bucket) |
| --- | --- |
| `Zeroed` | free, zeroed → linux `ZERO_PAGE`/buddy zeroed |
| `Free` | free → buddy free |
| `Standby 0..7` | cached file/data by priority → lru inactive/active file |
| `Modified` | dirty, awaiting writeback → dirty/writeback |
| `Active` | on a working set → active anon/file, wired |
| `Bad` | hardware-poisoned / bad list → hwpoison |

Use-class (high nibble): `ProcessPrivate`, `File`, `PagefileMapped`, `PageTable`,
`PagedPool`, `NonPagedPool`, `SystemPTE`, `SessionPrivate`, `Metafile`, `AWE`,
`DriverLocked`, `KernelStack` (Windows classes; Linux buckets map onto the closest).

Render: state = fill, use-class = glyph/hatch overlay at zoom ≥ chip level. Hover =
full detail. Click owner = cross-chip highlight of every page with the same owner id.

## 6. Interactions

- **Hover page**: PFN, physical address, state (+priority), use, owner process, file
  path + byte offset when file-backed.
- **Click file/process**: light up all its pages across all chips; dim the rest;
  totals in a sidecar (pages, MiB, spread across N chips / M sticks).
- **Focus a process** — first-class, see [app-focus.md](app-focus.md): everything it
  doesn't own dims; its pages keep their real states; **shared pages are drawn
  dithered** (RMV's aliasing idiom); side-panel totals + a footprint timeline.
- **Search**: type a process name or path substring → owner highlight.
- **Sticky compare**: pin two snapshots' highlights side by side (recordings or live).
- **Maintenance ops** (Windows, admin, opt-in): "Trim working sets", "Flush modified
  list", "Purge standby list" — each runs the real `NtSetSystemInformation` operation,
  with an Ionic-style settle animation and a truthful tooltip about what it does and
  doesn't do.

## 7. macOS scene

No page-level data exists (see [data-sources/macos.md](data-sources/macos.md)), so macOS
renders a **summary scene**, not a fake one:

- Apple Silicon: an SoC package drawing with the unified-memory fabric and LPDDR
  packages (real capacity/type/speed), fed by live summary stats (wired, compressed,
  app memory, cached files as proportions of the fabric) — the "memory pressure"
  story told as hardware.
- Intel: real DIMM inventory (slot drawings) with per-slot real data and summary-only
  occupancy (no page grid; explicit empty state explaining why).

## 8. Snapshot → scene pipeline

```
PageSnapshot ─▶ normalize ─▶ placement ─▶ LOD build ─▶ SVG scene graph
   (real)        (units/enums)  (§3 model)  (§4 ladder)   (diff-friendly:
                                                    stable node ids per cell)
```

Scene-graph nodes get stable ids (`dimm{slot}/chip{i}/bank{b}/page{pfn}`) so frame-to-frame
diffing maps 1:1 to DOM attribute patches — that's the whole animation strategy: the data
moves, the renderer follows.
