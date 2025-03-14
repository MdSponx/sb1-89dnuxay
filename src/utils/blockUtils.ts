import { Block } from '../types';
import { BLOCK_HEIGHTS, MAX_PAGE_HEIGHT } from '../constants/editorConstants';

export const calculateBlockHeight = (block: Block): number => {
  const baseHeight = BLOCK_HEIGHTS[block.type as keyof typeof BLOCK_HEIGHTS] || 2;
  const contentLines = Math.max(1, Math.ceil(block.content.length / 75));
  return baseHeight * contentLines;
};

export const organizeBlocksIntoPages = (blocks: Block[]): Block[][] => {
  const pages: Block[][] = [];
  let currentPage: Block[] = [];
  let currentHeight = 0;

  const addBlockToPage = (block: Block) => {
    const blockHeight = calculateBlockHeight(block);
    if (currentHeight + blockHeight > MAX_PAGE_HEIGHT && currentPage.length > 0) {
      pages.push([...currentPage]);
      currentPage = [];
      currentHeight = 0;
    }
    currentPage.push(block);
    currentHeight += blockHeight;
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const nextBlock = blocks[i + 1];

    if (block.type === 'character' && nextBlock && 
       (nextBlock.type === 'dialogue' || nextBlock.type === 'parenthetical')) {
      const combinedHeight = calculateBlockHeight(block) + calculateBlockHeight(nextBlock);
      
      if (currentHeight + combinedHeight > MAX_PAGE_HEIGHT) {
        if (currentPage.length > 0) {
          pages.push([...currentPage]);
          currentPage = [];
          currentHeight = 0;
        }
      }
      addBlockToPage(block);
      continue;
    }

    addBlockToPage(block);
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
};

export const detectFormat = (text: string): string | null => {
  const trimmed = text.trim();
  if (/^(INT|EXT|INT\/EXT|I\/E)\.?\s/i.test(trimmed)) return 'scene-heading';
  if (/TO:$/.test(trimmed) || /^FADE (IN|OUT)|^DISSOLVE/i.test(trimmed))
    return 'transition';
  if (/^[A-Z][A-Z\s.()]*$/.test(trimmed) && trimmed.length > 0)
    return 'character';
  if (trimmed.startsWith('(') && trimmed.endsWith(')'))
    return 'parenthetical';
  return null;
};

export const getNextBlockType = (currentType: string, content: string, isDoubleEnter: boolean): string => {
  // Check if the content is just INT. or EXT. without additional text
  const isScenePrefix = /^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.)$/i.test(content.trim());
  
  // If it's a scene heading with just INT. or EXT., keep it as scene heading
  if (currentType === 'scene-heading' && isScenePrefix) {
    return 'scene-heading';
  }

  // If it's a scene heading with more content, proceed to action
  if (currentType === 'scene-heading') {
    return 'action';
  }

  const detectedFormat = detectFormat(content);
  if (detectedFormat) return detectedFormat;

  switch (currentType) {
    case 'action':
      return 'character';
    case 'character':
      return 'dialogue';
    case 'parenthetical':
      return 'dialogue';
    case 'dialogue':
      return isDoubleEnter ? 'action' : 'character';
    case 'transition':
      return 'scene-heading';
    default:
      return 'action';
  }
};

export const updateBlockNumbers = (blocks: Block[]): Block[] => {
  let sceneCount = 0;
  let dialogueCount = 0;

  return blocks.map((block) => {
    if (block.type === 'scene-heading') {
      sceneCount++;
      return { ...block, number: sceneCount };
    }
    if (block.type === 'dialogue') {
      dialogueCount++;
      return { ...block, number: dialogueCount };
    }
    return { ...block, number: undefined };
  });
};