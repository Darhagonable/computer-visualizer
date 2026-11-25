# Sources & references

Status: curated & links verified 2026-11 · items marked ⚠ to re-verify at implementation time

The catalog behind the project: what inspired it, where die photography and floor-plan
knowledge come from, the viewer technology we learn from, the technical canon the data
providers are built on — and the sourcing rules the die-layout database must follow.

## 1. Product & aesthetic inspirations

| Source | Link | Why it's here |
| --- | --- | --- |
| **Sysinternals RAMMap** | <https://learn.microsoft.com/en-us/sysinternals/downloads/rammap> | The ground truth our RAM view renders as hardware: per-page use counts, priorities, file ownership. |
| **Task Manager → Performance tab** | built into Windows | The model of glanceable, live telemetry. |
| **HWiNFO** | <https://www.hwinfo.com/> | The depth benchmark for sensor coverage. |
| **LibreHardwareMonitor** | <https://github.com/LibreHardwareMonitor/LibreHardwareMonitor> | Open-source sensor depth; our PawnIO client mirrors their driver usage. |
| **Thaiphoon Burner** | <https://en.wikipedia.org/wiki/Thaiphoon_Burner> ⚠ (official site defunct) | Module forensics: SPD, density/rank/organization — a DIMM as a populated circuit board. |
| **Ionic RAM Defrag** | — (no stable canonical link survives; legacy-software archives only ⚠) | The aesthetic north star: clean animated line-art memory sticks. |
| **CPU-Z (Memory/SPD tab)** | <https://www.cpuid.com/softwares/cpu-z.html> | Reference for how DIMM inventory is presented. |
| **ZenTimings** | <https://github.com/irusanov/ZenTimings> ⚠ | Modern SPD/timings reader; another app caught in the WinRing0 driver saga. |
| **AMD Radeon Memory Visualizer (RMV)** | <https://gpuopen.com/rmv/> · [getting started](https://gpuopen.com/learn/getting-started-with-radeon-memory-visualizer-rmv/) · [repo](https://github.com/GPUOpen-Tools/radeon_memory_visualizer) | GPU-memory tracing for D3D12/Vulkan apps: timeline, snapshots, heap/resource/allocation detail, dithered aliasing, compare + leak finder. It sees graphics allocations through AMD's driver instrumentation; we borrow its **interaction model** for system RAM — the basis of [Application Focus](app-focus.md) |
| **Sysinternals VMMap** | <https://learn.microsoft.com/en-us/sysinternals/downloads/vmmap> | A process's address space by type, a timeline of snapshots, "Show Changes" diffs, call-site tracing — the system-RAM counterpart to RMV's resource views |

## 2. Die photography, floor-plans & annotation

These power the die-layout database ([cpu-model.md §2](cpu-model.md)); sourcing rules in §5.

| Source | Link | What it is | Role |
| --- | --- | --- | --- |
| **Nemez — Chip Annotations** | <https://nemez.net/die/> | Annotated die maps: AMD Zen 1–5, Intel Skylake→Arrow Lake, NVIDIA, consoles. Self-described as educated guesses ("quite likely wrong") | **Primary** coordinate reference; its candid disclaimer is our honesty principle in the wild |
| **Kurnal Insights — Die Shot Gallery** | <https://kurnal-insights.com/en/dieshot/> | 319 hi-res die shots with die sizes, same-scale compare, **full-package shots** (Arrow Lake package, Strix Halo…) | **Co-primary**; package shots match our delidded substrate scene exactly |
| **misdake — ChipAnnotationViewer** | <https://misdake.github.io/ChipAnnotationViewer/> · [repo](https://github.com/misdake/ChipAnnotationViewer) (MIT) | Tiled die-shot viewer with **community annotations stored as GitHub issues + JSON**; polygons, labels, area/length measurement. Covers Zen/Zen2 CCD, Matisse/Rome IO dies, Skylake, Sandy Bridge, many GPUs | **Third cross-check source**; the annotation→JSON→curated-repo workflow is the model for our layout-DB contributions |
| **sheets.works — CPU dies** | <https://sheets.works/data-viz/cpu-dies> | "Every processor die anyone has photographed and given away": 363 chips, 1971–2024 (Rautakorpi, Fritzchens Fritz, McMaster, ZeptoBars…), per-photo licenses, true-scale view | Design-language reference + index to licensed photography (we link, never embed) |
| **jia.je — CPU Microarchitecture Diagrams** | <https://jia.je/cpu/zen4.html> · [repo](https://github.com/jiegec/cpu) | Open-source SVG per-core block diagrams (Zen 1–6, Intel, Apple, ARM) with citations | Aesthetic exemplar; reference for a possible future "core internals" zoom level |
| **Chips and Cheese** | <https://chipsandcheese.com/> | Deep-dive microarchitecture analysis, frequently sourced by the above | Analysis canon for labels/terminology |

Photographers behind the galleries (via sheets.works index): Fritzchens Fritz (Flickr ⚠),
Pauli Rautakorpi, John McMaster / [siliconpr0n](https://siliconpr0n.org/) ⚠, ZeptoBars.

## 3. Chip-layout viewers & rendering tech

Not data sources — prior art for our renderer and interaction design.

| Source | Link | What it is | Why it matters to us |
| --- | --- | --- | --- |
| **Tiny Tapeout Explorer** | <https://znah.net/tiny_explorer/> · [repo](https://github.com/znah/tiny_explorer) | Alexander Mordvintsev's WASM (C++) GDSII/OASIS parser + WebGL2 3D chip explorer with wire-level highlights and switch-level simulation | Proof that huge chip layouts render interactively in a browser (WASM+WebGL, not DOM) — the fallback path if/when our page grids outgrow SVG, and the tech reference for any silicon-zoom level |
| **TinyTapeout chip viewer** | <https://tinytapeout.com/news/chip-viewer-upgrade/> | GDS layer-toggle viewer over aligned microscope imagery (imaging by Texplained) | Layer-selection and image-alignment UX patterns for zoom-into-silicon ambitions |

## 4. Primary technical references

Per-OS deep lists live at the bottom of each
[data-sources doc](data-sources/); this is the top-level canon:

- **Windows internals**: Windows Internals 7th ed. (Russinovich et al.), especially
  memory management chapters; zodiacon's [WindowsInternals/MemInfo](https://github.com/zodiacon/WindowsInternals);
  OutFlank's [Superfetch/PFN walkthrough](https://www.outflank.nl/blog/2023/12/14/mapping-virtual-to-physical-adresses-using-superfetch);
  [RAMMap](https://learn.microsoft.com/en-us/sysinternals/downloads/rammap) behavior as spec.
- **SMBIOS/DMI**: [DMTF DSP0134](https://www.dmtf.org/sites/default/files/standards/documents/DSP0134_3.5.0.pdf)
  (Type 16/17/19/20 are ours); Rust crate [smbios-lib](https://docs.rs/smbios-lib).
- **SPD/DRAM**: JEDEC JC-42 standards incl. SPD annexes for DDR4/DDR5 ⚠ (verify exact
  document numbers when implementing tier-2 SPD reads).
- **Linux**: [kernel pagemap admin guide](https://docs.kernel.org/admin-guide/mm/pagemap.html)
  (kpageflags/kpagecount/pagemap), `dmidecode(8)`, `decode-dimms(8)`,
  [EDAC sysfs](https://docs.kernel.org/driver-api/edac.html), hwmon docs.
- **CPU architecture**: Intel SDM (MSR definitions) <https://www.intel.com/sdm> ⚠ link
  rot check; AMD programmer references (CPUID topology, SMN) via developer.amd.com ⚠;
  [GetLogicalProcessorInformationEx](https://learn.microsoft.com/en-us/windows/win32/sysinfoapi/getlogicalprocessorinformationex).
- **Drivers (Windows)**: [PawnIO](https://github.com/namazso/PawnIO) +
  [modules](https://github.com/namazso/PawnIO.Modules); LibreHardwareMonitor's
  [WinRing0→PawnIO migration PR #1857](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/pull/1857)
  and [issue #1660](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/issues/1660);
  [Defender's WinRing0 block notice](https://support.microsoft.com/en-us/windows/microsoft-defender-antivirus-alert-vulnerabledriver-winnt-winring0-eb057830-d77b-41a2-9a34-015a5d203c42).
- **Memory tracing (Windows)**: [ETW page-fault / virtual-alloc event types](https://learn.microsoft.com/en-us/windows/win32/etw/pagefault-v2)
  (`VirtualAlloc` / `VirtualFree` = 98 / 99, hard fault = 32),
  [`PageFault_VirtualAlloc` class](https://learn.microsoft.com/en-us/windows/win32/etw/pagefault-virtualalloc),
  [WPT — track user-mode allocations](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/memory-footprint-optimization-exercise-2),
  [`QueryVirtualMemoryInformation`](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-queryvirtualmemoryinformation).
- **Memory tracing (Linux)**: [kmem tracepoints](https://docs.kernel.org/trace/events-kmem.html)
  (`mm_page_alloc` / `mm_page_free` with PFNs).
- **macOS**: Mach `host_statistics64`/`host_processor_info` man pages, `vm_stat(1)`,
  `system_profiler(8)`, `ioreg(8)`.

## 5. Die-layout DB sourcing policy

Rules for every entry in `assets/die-layouts/` (schema in [cpu-model.md §2](cpu-model.md)):

1. **Cross-check coordinates against ≥2 independent sources** where available, from:
   Nemez annotations, Kurnal Insights (die + package shots), misdake community
   annotations. If only one source exists, the layout still ships but its `sources`
   array carries the single link and the UI keeps the "approximate floor-plan" badge.
2. **Never embed die photos.** Images stay at their origin; our JSON contains only
   hand-approximated rect coordinates and labels we author, plus outbound links.
3. **Never copy annotation polygons verbatim** from Nemez/misdake data — approximate
   coarse rects by eye, cite the source. Their value is knowing *what* and *roughly
   where*, not exact geometry.
4. **Every layout records provenance** in its `sources` array (URLs); PRs adding
   layouts without sources are rejected.
5. **Respect image licenses.** Die photos are variously CC0/CC BY/CC BY-SA/all-rights
   (sheets.works lists per-photo); linking is always safe, copying is not.
