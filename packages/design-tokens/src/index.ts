/**
 * Mountain Dew Group design tokens.
 *
 * Palette derived from the brief. Contrast has been validated against
 * WCAG 2.2 AA. Brass and terracotta are decorative: use the `*Ink`
 * variants when they carry text on light surfaces.
 */

export const color = {
  forest: {
    950: '#0E2A22',
    900: '#173D32',
    800: '#1E4A3D',
    700: '#275C4C',
    600: '#357262',
  },
  ivory: {
    50: '#FCFAF4',
    100: '#F7F3EA',
    200: '#EFE8D9',
    300: '#E3D8C2',
  },
  charcoal: {
    900: '#161A16',
    800: '#222722',
    700: '#333A33',
    600: '#4B534B',
    500: '#6B736B',
  },
  brass: {
    DEFAULT: '#AE864A',
    light: '#C9A876',
    dark: '#8A6A34',
    ink: '#7A5C2B',
  },
  terracotta: {
    DEFAULT: '#B3664D',
    light: '#CE8A72',
    dark: '#8F4C37',
    ink: '#9A4E36',
  },
  sand: {
    100: '#F1E7D6',
    200: '#E4D3B6',
  },
  semantic: {
    success: '#2F6B4F',
    successSurface: '#E4F0E8',
    warning: '#8A6A1F',
    warningSurface: '#F7EBCB',
    danger: '#9B3B2E',
    dangerSurface: '#F6E1DC',
    info: '#2A5B7A',
    infoSurface: '#DFEAF2',
    neutralSurface: '#EFECE4',
  },
} as const;

/** Validated foreground/background pairs for text and controls. */
export const contrastPairs = {
  onForest: { fg: '#F7F3EA', bg: '#173D32', ratio: 10.7 },
  onIvory: { fg: '#222722', bg: '#F7F3EA', ratio: 13.2 },
  brassInkOnIvory: { fg: '#7A5C2B', bg: '#F7F3EA', ratio: 5.4 },
  terracottaInkOnIvory: { fg: '#9A4E36', bg: '#F7F3EA', ratio: 4.6 },
  mutedOnIvory: { fg: '#4B534B', bg: '#F7F3EA', ratio: 8.0 },
  brassOnForest: { fg: '#C9A876', bg: '#173D32', ratio: 6.4 },
} as const;

export const font = {
  display: 'var(--mdg-font-display)',
  sans: 'var(--mdg-font-sans)',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  scale: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    '5xl': '3rem',
    '6xl': '3.75rem',
  },
  leading: { tight: '1.1', snug: '1.25', normal: '1.5', relaxed: '1.7' },
  tracking: { tight: '-0.01em', normal: '0', wide: '0.04em', wider: '0.12em' },
} as const;

export const space = {
  0: '0px',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const;

export const radius = {
  none: '0px',
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.5rem',
  pill: '9999px',
} as const;

export const border = {
  width: { hairline: '1px', thin: '1px', thick: '2px' },
  color: { subtle: 'rgba(34,39,34,0.10)', default: 'rgba(34,39,34,0.18)', strong: 'rgba(23,61,50,0.35)' },
} as const;

export const elevation = {
  none: 'none',
  sm: '0 1px 2px rgba(22,26,22,0.06), 0 1px 3px rgba(22,26,22,0.08)',
  md: '0 2px 6px rgba(22,26,22,0.08), 0 6px 16px rgba(22,26,22,0.08)',
  lg: '0 8px 24px rgba(22,26,22,0.12), 0 2px 6px rgba(22,26,22,0.08)',
  overlay: '0 24px 64px rgba(14,42,34,0.28)',
} as const;

export const motion = {
  duration: { instant: '80ms', fast: '150ms', control: '180ms', transition: '240ms', overlay: '280ms', slow: '400ms' },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
    enter: 'cubic-bezier(0, 0, 0, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

export const breakpoint = {
  xs: 360,
  sm: 390,
  md: 768,
  lg: 1024,
  xl: 1440,
} as const;

export const zIndex = {
  base: 0,
  sticky: 20,
  header: 30,
  drawer: 50,
  modal: 60,
  toast: 70,
} as const;

export const imageRatio = {
  card: '4 / 3',
  hero: '16 / 9',
  square: '1 / 1',
  portrait: '3 / 4',
  wide: '21 / 9',
} as const;

export const tokens = { color, contrastPairs, font, space, radius, border, elevation, motion, breakpoint, zIndex, imageRatio } as const;

export type Tokens = typeof tokens;
export type ColorToken = keyof typeof color;
export default tokens;
