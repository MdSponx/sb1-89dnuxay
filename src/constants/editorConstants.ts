export const BLOCK_HEIGHTS = {
  'scene-heading': 2.5,
  'action': 2,
  'character': 2,
  'parenthetical': 1.8,
  'dialogue': 2,
  'transition': 2.5,
  'text': 2,
  'shot': 2.5,
} as const;

export const MAX_PAGE_HEIGHT = 55;

export const BLOCK_TYPES = [
  'scene-heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'text',
  'shot'
] as const;

export const INITIAL_BLOCKS = [
  {
    id: '1',
    type: 'scene-heading',
    content: 'INT. COFFEE SHOP - DAY',
    number: 1,
  },
  {
    id: '2',
    type: 'action',
    content: 'A quiet morning scene. Sunlight streams through large windows.',
  },
  { id: '3', type: 'character', content: 'SARAH' },
  { id: '4', type: 'parenthetical', content: '(checking her phone)' },
  {
    id: '5',
    type: 'dialogue',
    content: "This can't be happening. Not today of all days.",
    number: 1,
  },
];