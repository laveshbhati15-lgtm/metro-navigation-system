import type { LineCode } from '@/core/graph/types';

/** Hex colours matching DMRC official line branding */
export const LINE_COLORS: Record<LineCode, string> = {
  RED:     '#e63946',
  YELLOW:  '#f4c430',
  BLUE:    '#2176ae',
  GREEN:   '#2dc653',
  VIOLET:  '#7b2d8b',
  ORANGE:  '#f77f00',
  MAGENTA: '#c2185b',
  PINK:    '#e91e8c',
  GREY:    '#8d9db6',
  AQUA:    '#00b4d8',
};

/** Tailwind bg class for each line (used for badges and markers) */
export const LINE_BG_CLASSES: Record<LineCode, string> = {
  RED:     'bg-line-red',
  YELLOW:  'bg-line-yellow',
  BLUE:    'bg-line-blue',
  GREEN:   'bg-line-green',
  VIOLET:  'bg-line-violet',
  ORANGE:  'bg-line-orange',
  MAGENTA: 'bg-line-magenta',
  PINK:    'bg-line-pink',
  GREY:    'bg-line-grey',
  AQUA:    'bg-line-aqua',
};

/** Text colour class (white on dark lines, dark on yellow) */
export const LINE_TEXT_CLASSES: Record<LineCode, string> = {
  RED:     'text-white',
  YELLOW:  'text-gray-900',
  BLUE:    'text-white',
  GREEN:   'text-white',
  VIOLET:  'text-white',
  ORANGE:  'text-white',
  MAGENTA: 'text-white',
  PINK:    'text-white',
  GREY:    'text-white',
  AQUA:    'text-white',
};

export const LINE_DISPLAY_NAMES: Record<LineCode, string> = {
  RED:     'Red Line',
  YELLOW:  'Yellow Line',
  BLUE:    'Blue Line',
  GREEN:   'Green Line',
  VIOLET:  'Violet Line',
  ORANGE:  'Airport Express',
  MAGENTA: 'Magenta Line',
  PINK:    'Pink Line',
  GREY:    'Grey Line',
  AQUA:    'Aqua Line',
};
