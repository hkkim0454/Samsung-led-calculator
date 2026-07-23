// models.js — LED cabinet model library.
// Source: Samsung official configurator (display-configurator.biz.samsung.com), observed 2026-07-23.
//   pitch, cabinet dimensions (W x H x depth), peak/reduced brightness, refresh, OVD  = OBSERVED
//   resolution                                                                        = OBSERVED / derived (size / pitch)
//   weight & maxPower (per cabinet)                                                    = DATASHEET REQUIRED (only MP012F validated)
// Fill weight/maxPower from official datasheets before using for quotes.
// `validated: true` means the full cabinet+power figures were cross-checked against the Samsung tool.

export const MODELS = [
  // ---- The Wall — LED Indoor (MP series, cabinet 806.4 x 453.6) ----
  { id: 'MP008F', name: 'MP008F', category: 'LED Indoor (The Wall)', series: 'MP',
    pitch: 0.84, cabW: 806.4, cabH: 453.6, depth: 49.4, resW: 960, resH: 540,
    brightnessPeak: 1800, brightnessReduced: 1000, refreshHz: 3840, ovd_m: 2.9,
    weight: null, maxPower: null, sbox: 'SBB-CS4BPGS', cabinetPart: null, validated: false },

  { id: 'MP012F', name: 'MP012F', category: 'LED Indoor (The Wall)', series: 'MP',
    pitch: 1.26, cabW: 806.4, cabH: 453.6, depth: 49.4, resW: 640, resH: 360,
    brightnessPeak: 1800, brightnessReduced: 1000, refreshHz: 3840, ovd_m: 4.4,
    weight: 9.2, maxPower: 146, sbox: 'SBB-CS4BPGS', cabinetPart: 'LH012MPFAAA', validated: true },

  { id: 'MP016F', name: 'MP016F', category: 'LED Indoor (The Wall)', series: 'MP',
    pitch: 1.68, cabW: 806.4, cabH: 453.6, depth: 49.4, resW: 480, resH: 270,
    brightnessPeak: 1600, brightnessReduced: 1200, refreshHz: 3840, ovd_m: 5.8,
    weight: null, maxPower: null, sbox: 'SBB-CS4BPGS', cabinetPart: null, validated: false },

  // ---- The Wall (IW series, cabinet 806.4 x 453.6) ----
  { id: 'IW008C', name: 'IW008C', category: 'LED Indoor (The Wall)', series: 'IW',
    pitch: 0.84, cabW: 806.4, cabH: 453.6, depth: 75, resW: 960, resH: 540,
    brightnessPeak: 1800, brightnessReduced: 600, refreshHz: 3840, ovd_m: 2.9,
    weight: null, maxPower: null, sbox: null, cabinetPart: null, validated: false },
  { id: 'IW012C', name: 'IW012C', category: 'LED Indoor (The Wall)', series: 'IW',
    pitch: 1.26, cabW: 806.4, cabH: 453.6, depth: 75, resW: 640, resH: 360,
    brightnessPeak: 1800, brightnessReduced: 1000, refreshHz: 3840, ovd_m: 4.4,
    weight: null, maxPower: null, sbox: null, cabinetPart: null, validated: false },
  { id: 'IW016C', name: 'IW016C', category: 'LED Indoor (The Wall)', series: 'IW',
    pitch: 1.68, cabW: 806.4, cabH: 453.6, depth: 75, resW: 480, resH: 270,
    brightnessPeak: 1600, brightnessReduced: 1200, refreshHz: 3840, ovd_m: 5.8,
    weight: null, maxPower: null, sbox: null, cabinetPart: null, validated: false },

  // ---- IF series (indoor flat, cabinet 960 x 540) ----
  { id: 'IF015R', name: 'IF015R', category: 'Indoor', series: 'IF',
    pitch: 1.5, cabW: 960, cabH: 540, depth: 79.5, resW: 640, resH: 360,
    brightnessPeak: 1600, brightnessReduced: 800, refreshHz: 3840, ovd_m: 5.2,
    weight: null, maxPower: null, sbox: null, cabinetPart: null, validated: false },
  { id: 'IF020R', name: 'IF020R', category: 'Indoor', series: 'IF',
    pitch: 2.0, cabW: 960, cabH: 540, depth: 79.5, resW: 480, resH: 270,
    brightnessPeak: 1600, brightnessReduced: 1000, refreshHz: 3840, ovd_m: 7.0,
    weight: null, maxPower: null, sbox: null, cabinetPart: null, validated: false },
  { id: 'IF025R', name: 'IF025R', category: 'Indoor', series: 'IF',
    pitch: 2.5, cabW: 960, cabH: 540, depth: 79.5, resW: 384, resH: 216,
    brightnessPeak: 2000, brightnessReduced: 1000, refreshHz: 3840, ovd_m: 8.6,
    weight: null, maxPower: null, sbox: null, cabinetPart: null, validated: false },
  { id: 'IF040R', name: 'IF040R', category: 'Indoor', series: 'IF',
    pitch: 4.0, cabW: 960, cabH: 540, depth: 79.5, resW: 240, resH: 135,
    brightnessPeak: 1500, brightnessReduced: 900, refreshHz: 3840, ovd_m: 13.8,
    weight: null, maxPower: null, sbox: null, cabinetPart: null, validated: false },

  // ---- IE series (indoor, cabinet 960 x 540) ----
  { id: 'IE015A', name: 'IE015A', category: 'Indoor', series: 'IE',
    pitch: 1.5, cabW: 960, cabH: 540, depth: 79.5, resW: 640, resH: 360,
    brightnessPeak: 1000, brightnessReduced: 500, refreshHz: 3840, ovd_m: 5.2,
    weight: null, maxPower: null, sbox: null, cabinetPart: null, validated: false },
  { id: 'IE025A', name: 'IE025A', category: 'Indoor', series: 'IE',
    pitch: 2.5, cabW: 960, cabH: 540, depth: 79.5, resW: 384, resH: 216,
    brightnessPeak: 1000, brightnessReduced: 500, refreshHz: 3840, ovd_m: 8.6,
    weight: null, maxPower: null, sbox: null, cabinetPart: null, validated: false },

  // ---- MM series (cabinet 600 x 337.5) ----
  { id: 'MM012F', name: 'MM012F', category: 'Indoor', series: 'MM',
    pitch: 1.25, cabW: 600, cabH: 337.5, depth: 49.8, resW: 480, resH: 270,
    brightnessPeak: 600, brightnessReduced: null, refreshHz: 3840, ovd_m: 4.3,
    weight: null, maxPower: null, sbox: null, cabinetPart: null, validated: false },

  // ---- Outdoor ----
  { id: 'IB025F', name: 'IB025F', category: 'Outdoor', series: 'IB',
    pitch: 2.5, cabW: 1000, cabH: 500, depth: 42, resW: 400, resH: 200,
    brightnessPeak: 3500, brightnessReduced: null, refreshHz: 3840, ovd_m: 8.6,
    weight: null, maxPower: null, sbox: null, cabinetPart: null, validated: false },
];
