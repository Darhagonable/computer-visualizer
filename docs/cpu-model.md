# CPU visualization model

Status: decided 2026-11

The CPU scene renders the package **delidded**: substrate, dies, chiplets, cores — with
live per-core telemetry. Same honesty rules as the RAM model
([ram-model.md](ram-model.md)): topology and telemetry are **real**; the physical
floor-plan is a **model** (a curated database for known CPUs, generic fallback
otherwise, always badged when not exact).

## 1. Topology model

```
Package (socket)
 └─ Die            — CCD / compute die / IO die (AMD), monolithic die (Intel), SoC (Apple)
     └─ Complex    — CCX on AMD (cores sharing an L3); "core cluster" on Intel hybrid
         └─ Core   — physical core with private L1/L2
             └─ Threads — SMT siblings (drawn as split halves of the core)
```

Caches hang off the graph: L1/L2 per core, L3 per complex (AMD: per-CCX — the "cache
latch" made visible), plus package-level (Infinity Fabric / ring / mesh) as a drawn
interconnect. NUMA nodes annotate dies where present.

### Sources per OS

| Data | Windows | Linux | macOS |
| --- | --- | --- | --- |
| Packages / cores / threads | `GetLogicalProcessorInformationEx` (`RelationProcessorPackage`, `RelationProcessorCore`), incl. processor groups >64 threads | `/sys/devices/system/cpu/cpu*/topology/{physical_package_id,core_id,thread_siblings_list}` | `sysctl hw.packages hw.ncpu` |
| Dies / CCD / CCX | CPUID decode (AMD leaf `0x8000001E` node/core ids ⚠ verify per family) + cache sharing from `RelationCache` (L3-sharing ⇒ same CCX) | `topology/die_id`, `topology/cluster_cpus_list` (L3-sharing cross-check) | Apple Silicon: `hw.perflevel*` (P/E clusters) |
| Hybrid P/E cores | `RelationProcessorCore` → `EfficiencyClass` (0 = E, >0 = P classes) | `cpu_capacity` / `cluster` grouping ⚠ | `hw.perflevel0.*` (P), `hw.perflevel1.*` (E) |
| Caches | `RelationCache` (level, size, sharing mask) | `/sys/devices/system/cpu/cpu*/cache/*` | sysctl `hw.l*.cachesize` (summary only) |
| Usage | per-thread times (NT / `NtQuerySystemInformation`) | `/proc/stat` per-cpu | `host_processor_info` |

AMD CCD/CCX decode rule of thumb (to be verified against AMD's CPUID spec during M6):
CPUID leaf `0x8000001E` `EBX` carries per-core node/core identifiers; on Zen 2+ the
node id encodes CCD/CCX composition, cross-checked by L3-sharing masks — two cores
sharing an L3 mask share a CCX by definition, which is the robust signal.

## 2. Die-layout database

The *physical arrangement* of dies/chiplets on a substrate is not exposed by any OS, so
we ship a curated, versioned database:

```jsonc
// assets/die-layouts/amd/zen4-raphael-2ccd.json
{
  "schema": 1,
  "match": { "vendor": "amd", "family": 25, "models": [16, 17, 18, 20] },  // ⚠ match per CPUID tables
  "layout": {
    "package": "AM5",
    "units": [
      { "kind": "ccd", "rect": [0.18, 0.12, 0.28, 0.36], "complexes": 2, "label": "CCD0" },
      { "kind": "ccd", "rect": [0.54, 0.12, 0.28, 0.36], "complexes": 2, "label": "CCD1" },
      { "kind": "io",  "rect": [0.28, 0.56, 0.44, 0.32], "label": "IOD" }
    ]
  },
  "sources": ["https://nemez.net/die/", "https://kurnal-insights.com/en/dieshot/"]
}
```

- Matching: CPUID vendor/family/model (read at runtime) → layout file; CCD count is
  corrected at runtime from actual topology (a 1-CCD part uses the 1-CCD variant).
- Seeds at M6: one AMD dual-CCD Zen desktop layout, one AMD single-CCD, one Intel hybrid
  (P/E clusters + graphics + IO), one monolithic Intel, one generic fallback
  (auto-tiled complexes — always badged "generic layout").
- Contribution workflow: layouts are data, not code — PRs add JSON + source links.
- Coordinate sources: cross-check ≥2 of [Nemez chip annotations](https://nemez.net/die/),
  [Kurnal Insights die shots](https://kurnal-insights.com/en/dieshot/) (incl. full-package
  shots), and [misdake's ChipAnnotationViewer](https://misdake.github.io/ChipAnnotationViewer/)
  community annotations — full catalog and rules in [SOURCES.md](SOURCES.md).
- ⚠ Position accuracy: chiplet *counts and topology* are real; *rect coordinates* are
  hand-approximated from community die photography. Badged "approximate floor-plan" in-UI.

## 3. Telemetry

| Metric | Windows | Linux | macOS |
| --- | --- | --- | --- |
| Per-core temperature | Intel: MSR `0x19C` (digital readout; TjMax from `0x1A2`), per-thread affinity pinning. AMD: SMN `THM_TCON_CUR_TMP` (family-specific offset for Tctl offset) — all via **PawnIO** | hwmon `coretemp`/`k10temp` (per-core + Tctl) | SMC keys (package-level mostly) |
| Package temp | MSR `0x1B1` (Intel, PawnIO) / SMN (AMD) | same hwmon devices | SMC |
| Per-core frequency | APERF/MPERF (`0xE8`/`0xE7`) via PawnIO ⚠ (or % of max via GLPI counters) | `cpufreq` sysfs + APERF/MPERF via `/dev/cpu/N/msr` | `host_processor_info` (tick counts) ⚠ no direct per-core freq |
| Package power | Intel RAPL `MSR_PKG_ENERGY_STATUS` (`0x611`) + `MSR_RAPL_POWER_UNIT` (`0x606`); AMD `MSR_PKG_ENERGY_STAT` (`0xC0010299`/`0xC001029B`) via PawnIO | RAPL via `/sys/class/powercap` or MSR | `powermetrics` (root, sampled) ⚠ |
| Usage | per-thread kernel times (no driver) | `/proc/stat` (no root) | `host_processor_info` (no root) |

Cadence per [architecture.md](architecture.md): usage 2–4 Hz, temps/power 1 Hz.
Temperatures are drawn as heat (color ramp on the core rect + numeric on hover);
frequency as a per-core bar; power as a package-level readout on the IO die.

**No-driver mode (Windows):** topology + usage + frequency-approximation render fully;
temps/power show their "requires PawnIO" empty state. The scene must remain genuinely
useful without any driver — usage debugging doesn't need ring 0.

## 4. Scene specification

- **Views:** `IHS` (the lid — what you see before delidding; playful toggle) →
  `Delidded` (dies on substrate) → `Die` (zoom one CCD: complexes, cores, L3 slices).
- Each core rect: SMT halves, fill = heat ramp, corner glyph = use-class of the
  running thread (optional), numeric overlay at zoom (temp / freq / load %).
- Cache/interconnect lines drawn die-to-die and complex-to-complex (fabric), animating
  subtly with package activity (activity level from aggregate frequency/power — labeled
  as an ambient effect, not data).
- Hot spots: a core >85% of TjMax gets a warning halo; a CCD thermal gradient is
  instantly visible — this is the "debuggable in great detail" payoff.
- Empty slots (a 2-CCD part on a 4-CCD-capable layout variant) never render as fake
  dark silicon; layouts are per-actual-topology.

## 5. Honest badges

| Badge | When |
| --- | --- |
| "generic layout" | no die-layout DB entry for this CPUID |
| "approximate floor-plan" | DB entry (rect positions approximate) |
| "modeled CCD/CCX mapping" | Windows CPUID decode unverified for this family ⚠ (drop once verified per family) |
| "requires PawnIO" | temp/power absent on Windows without driver |
