/**
 * Hand-made placeholder levels. Each art character becomes a `scale` × `scale`
 * block of grains. '.' is empty space and '#' is stone (never moves, blocks rays).
 * Levels avoid stone overhangs so every grain is reachable under every rule.
 */

/** Art character → sand color. */
export const COLORS: Readonly<Record<string, string>> = {
  r: '#e5484d', // red
  o: '#f5923e', // orange
  y: '#f6cf45', // yellow
  l: '#9bd35a', // lime
  g: '#3fa34d', // green
  t: '#2bb3a3', // teal
  c: '#8ccff0', // sky
  b: '#3b6fd8', // blue
  p: '#8b5cd6', // purple
  k: '#f07ab0', // pink
  w: '#f4efe4', // white
  n: '#8a5a3b', // brown
  d: '#2a2c3f', // dark
};

export const STONE_COLOR = '#6b7280';

export interface LevelDef {
  name: string;
  art: string[];
  /** Grains per art pixel edge. */
  scale: number;
  /** Columns of waiting collectors. */
  lanes: number;
  /** Typical collector capacity; actual sizes vary around this. */
  chunk: number;
}

export const LEVELS: readonly LevelDef[] = [
  {
    name: 'First Light',
    scale: 5,
    lanes: 2,
    chunk: 300,
    art: [
      'cccccccccccc',
      'cccccccccccc',
      'cccccccccccc',
      'cccccccccccc',
      'cccccccccccc',
      'yyyyyyyyyyyy',
      'yyyyyyyyyyyy',
      'yyyyyyyyyyyy',
      'yyyyyyyyyyyy',
      'yyyyyyyyyyyy',
    ],
  },
  {
    name: 'Sunset',
    scale: 5,
    lanes: 2,
    chunk: 250,
    art: [
      'oooooooooooo',
      'oooooooooooo',
      'oooooyyooooo',
      'ooooyyyyoooo',
      'oooyyyyyyooo',
      'oooyyyyyyooo',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
    ],
  },
  {
    name: 'Tricolour',
    scale: 5,
    lanes: 3,
    chunk: 250,
    art: Array.from({ length: 12 }, () => 'rrrrwwwwbbbb'),
  },
  {
    name: 'Mushroom',
    scale: 5,
    lanes: 3,
    chunk: 220,
    art: [
      'cccccccccccc',
      'cccrrrrrrccc',
      'ccrrwwrrrrcc',
      'crrrwwrrwwrc',
      'crrrrrrrwwrc',
      'rrwwrrrrrrrr',
      'rrwwrrrwwrrr',
      'cccwwwwwwccc',
      'cccwwwwwwccc',
      'cccwwwwwwccc',
      'cccwwwwwwccc',
      'gggggggggggg',
      'gggggggggggg',
    ],
  },
  {
    name: 'Heart',
    scale: 5,
    lanes: 3,
    chunk: 220,
    art: [
      'wwwwwwwwwwww',
      'wwkkwwwwkkww',
      'wkkkkwwkkkkw',
      'kkkkkkkkkkkk',
      'kkkkkkkkkkkk',
      'kkkkkkkkkkkk',
      'wkkkkkkkkkkw',
      'wwkkkkkkkkww',
      'wwwkkkkkkwww',
      'wwwwkkkkwwww',
      'wwwwwkkwwwww',
      'wwwwwwwwwwww',
    ],
  },
  {
    name: 'Pillars',
    scale: 5,
    lanes: 3,
    chunk: 220,
    art: [
      'cccccccccccc',
      'cccccccccccc',
      'kkkkkkkkkkkk',
      'kkkkkkkkkkkk',
      'y#yyyyyyyy#y',
      'y#yyyyyyyy#y',
      'y#yyyy#yyy#y',
      'b#bbbb#bbb#b',
      'b#bbbb#bbb#b',
      'b#bbbb#bbb#b',
      'b#bbbb#bbb#b',
    ],
  },
  {
    name: 'Fish',
    scale: 5,
    lanes: 3,
    chunk: 200,
    art: [
      'tttttttttttt',
      'tttttttttttt',
      'tottooootttt',
      'ootoooooottt',
      'tooooooodott',
      'ootoooooottt',
      'tottooootttt',
      'tttttttttttt',
      'tttttttttttt',
      'tttttttttttt',
      'yyyyyyyyyyyy',
      'yyyyyyyyyyyy',
    ],
  },
  {
    name: 'Landslide',
    scale: 5,
    lanes: 3,
    chunk: 200,
    art: [
      'rrrrrrrrrrrr',
      'rrrrrrrrrrrr',
      'oooooooooooo',
      'oooo....oooo',
      'yyy......yyy',
      'yy........yy',
      'gg........gg',
      'ggg......ggg',
      'gggggggggggg',
      'gggggggggggg',
    ],
  },
  {
    name: 'Tree',
    scale: 5,
    lanes: 3,
    chunk: 200,
    art: [
      'cccccccccccc',
      'cccccggccccc',
      'ccccggggcccc',
      'cccggggggccc',
      'ccggggggggcc',
      'cggggggggggc',
      'cggggggggggc',
      'ccggggggggcc',
      'cccggggggccc',
      'cccccnnccccc',
      'cccccnnccccc',
      'cccccnnccccc',
      'llllllllllll',
      'llllllllllll',
    ],
  },
  {
    name: 'Rainbow',
    scale: 5,
    lanes: 3,
    chunk: 180,
    art: [
      'cccccccccccc',
      'ccrrrrrrrrcc',
      'croooooooorc',
      'royyyyyyyyor',
      'royggggggyor',
      'roygbbbbgyor',
      'roygbccbgyor',
      'roygbccbgyor',
      'roygbccbgyor',
      'llllllllllll',
      'llllllllllll',
    ],
  },
];
