import React, { useState, useCallback, useRef, useEffect } from 'react';
import Instructions from './Instructions';
import Page from './Page';
import FormatButtons from './FormatButtons';

interface Block {
  id: string;
  type: string;
  content: string;
  number?: number;
}

interface ScreenplayEditorProps {
  isDarkMode: boolean;
  zoomLevel: number;
}

const BLOCK_HEIGHTS = {
  'scene-heading': 2.5,
  'action': 2,
  'character': 2,
  'parenthetical': 1.8,
  'dialogue': 2,
  'transition': 2.5,
  'text': 2,
  'shot': 2.5,
};

const calculateBlockHeight = (block: Block): number => {
  const baseHeight = BLOCK_HEIGHTS[block.type as keyof typeof BLOCK_HEIGHTS] || 2;
  const contentLines = Math.max(1, Math.ceil(block.content.length / 75));
  return baseHeight * contentLines;
};

const MAX_PAGE_HEIGHT = 55;

const organizeBlocksIntoPages = (blocks: Block[]): Block[][] => {
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

const ScreenplayEditor: React.FC<ScreenplayEditorProps> = ({ isDarkMode, zoomLevel }) => {
  const [blocks, setBlocks] = useState<Block[]>([
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
  ]);

  const [activeBlock, setActiveBlock] = useState<string | null>(null);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [textContent, setTextContent] = useState<Record<string, string>>({});
  const [header, setHeader] = useState('');
  const [editingHeader, setEditingHeader] = useState(false);
  const [undoStack, setUndoStack] = useState<Block[][]>([]);
  const [redoStack, setRedoStack] = useState<Block[][]>([]);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastKeyPressTime = useRef<number>(0);
  const lastClickedBlock = useRef<string | null>(null);
  const isSelecting = useRef(false);
  const selectionStartBlock = useRef<string | null>(null);
  const selectionEndBlock = useRef<string | null>(null);

  useEffect(() => {
    const contents: Record<string, string> = {};
    blocks.forEach((block) => {
      contents[block.id] = block.content;
    });
    setTextContent(contents);
  }, [blocks]);

  const addToHistory = useCallback((newBlocks: Block[]) => {
    setUndoStack(prev => [...prev, blocks]);
    setRedoStack([]);
  }, [blocks]);

  const handleUndo = useCallback(() => {
    if (undoStack.length > 0) {
      const previousState = undoStack[undoStack.length - 1];
      setRedoStack(prev => [...prev, blocks]);
      setBlocks(previousState);
      setUndoStack(prev => prev.slice(0, -1));
      setSelectedBlocks(new Set());
    }
  }, [blocks, undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length > 0) {
      const nextState = redoStack[redoStack.length - 1];
      setUndoStack(prev => [...prev, blocks]);
      setBlocks(nextState);
      setRedoStack(prev => prev.slice(0, -1));
      setSelectedBlocks(new Set());
    }
  }, [blocks, redoStack]);

  const updateBlockNumbers = (updatedBlocks: Block[]) => {
    let sceneCount = 0;
    let dialogueCount = 0;

    return updatedBlocks.map((block) => {
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

  const detectFormat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (/^(INT|EXT|INT\/EXT|I\/E)\.?\s/i.test(trimmed)) return 'scene-heading';
    if (/TO:$/.test(trimmed) || /^FADE (IN|OUT)|^DISSOLVE/i.test(trimmed))
      return 'transition';
    if (/^[A-Z][A-Z\s.()]*$/.test(trimmed) && trimmed.length > 0)
      return 'character';
    if (trimmed.startsWith('(') && trimmed.endsWith(')'))
      return 'parenthetical';
    return null;
  }, []);

  const getNextBlockType = (currentType: string, content: string, isDoubleEnter: boolean) => {
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

  const handleContentChange = (id: string, newContent: string) => {
    setTextContent((prev) => ({ ...prev, [id]: newContent }));
    
    const currentBlockIndex = blocks.findIndex(b => b.id === id);
    const currentBlock = blocks[currentBlockIndex];
    
    if (!currentBlock) return;

    if (newContent.trim() === '') {
      addToHistory(blocks);
      const updatedBlocks = blocks.filter((_, index) => index !== currentBlockIndex);
      setBlocks(updateBlockNumbers(updatedBlocks));
      return;
    }

    const updatedBlocks = blocks.map((block) => {
      if (block.id !== id) return block;
      const detectedFormat = detectFormat(newContent);
      return {
        ...block,
        content: newContent,
        type: detectedFormat || block.type,
      };
    });
    setBlocks(updateBlockNumbers(updatedBlocks));
  };

  const handleEnterKey = (blockId: string, element: HTMLDivElement) => {
    const selection = window.getSelection();
    if (!selection) return;

    const range = selection.getRangeAt(0);
    const currentBlock = blocks.find((b) => b.id === blockId);
    if (!currentBlock) return;

    const content = element.textContent || '';
    const caretPos = range.startOffset;
    const textBefore = content.substring(0, caretPos);
    const textAfter = content.substring(caretPos);

    const now = Date.now();
    const isDoubleEnter = now - lastKeyPressTime.current < 500 && 
                         currentBlock.type === 'dialogue' && 
                         textBefore.trim() === '';
    lastKeyPressTime.current = now;

    addToHistory(blocks);

    if (isDoubleEnter) {
      const updatedBlocks = blocks.filter(b => b.id !== blockId);
      const newBlock = {
        id: Date.now().toString(),
        type: 'action',
        content: textAfter,
      };
      updatedBlocks.push(newBlock);
      setBlocks(updateBlockNumbers(updatedBlocks));
      
      setTimeout(() => {
        const el = blockRefs.current[newBlock.id];
        if (el) {
          el.focus();
          const range = document.createRange();
          const textNode = el.firstChild || el;
          range.setStart(textNode, 0);
          range.collapse(true);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }, 0);
      
      return newBlock.id;
    }

    if (currentBlock.type === 'parenthetical') {
      const updatedBlocks = [...blocks];
      const currentIndex = blocks.findIndex((b) => b.id === blockId);

      if (!textBefore.endsWith(')')) {
        updatedBlocks[currentIndex] = {
          ...currentBlock,
          content: textBefore + ')',
        };
      }

      const newBlock = {
        id: Date.now().toString(),
        type: 'dialogue',
        content: textAfter.replace(/^\)/, '').trim(),
      };

      updatedBlocks.splice(currentIndex + 1, 0, newBlock);
      setBlocks(updateBlockNumbers(updatedBlocks));

      setTimeout(() => {
        const el = blockRefs.current[newBlock.id];
        if (el) {
          el.focus();
          const range = document.createRange();
          const textNode = el.firstChild || el;
          range.setStart(textNode, 0);
          range.collapse(true);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }, 0);

      return newBlock.id;
    }

    const newBlockType = getNextBlockType(currentBlock.type, textBefore, false);
    const currentIndex = blocks.findIndex((b) => b.id === blockId);
    const updatedBlocks = [...blocks];

    updatedBlocks[currentIndex] = {
      ...currentBlock,
      content: textBefore,
    };

    const newBlock = {
      id: Date.now().toString(),
      type: newBlockType,
      content: textAfter,
    };

    updatedBlocks.splice(currentIndex + 1, 0, newBlock);
    setBlocks(updateBlockNumbers(updatedBlocks));

    setTextContent((prev) => ({
      ...prev,
      [currentBlock.id]: textBefore,
      [newBlock.id]: textAfter,
    }));

    setTimeout(() => {
      const el = blockRefs.current[newBlock.id];
      if (el) {
        el.focus();
        const range = document.createRange();
        const textNode = el.firstChild || el;
        range.setStart(textNode, 0);
        range.collapse(true);
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }, 0);

    return newBlock.id;
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    blockId: string
  ) => {
    const el = e.target as HTMLDivElement;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (el.textContent?.trim() !== '' || el.textContent === '') {
        handleEnterKey(blockId, el);
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const types = [
        'scene-heading',
        'action',
        'character',
        'parenthetical',
        'dialogue',
        'transition',
        'text',
        'shot'
      ];
      const currentBlock = blocks.find((b) => b.id === blockId);
      if (!currentBlock) return;

      const currentIndex = types.indexOf(currentBlock.type);
      const nextType = types[(currentIndex + 1) % types.length];

      handleFormatChange(nextType);
    }

    if (e.key === 'Backspace' && el.textContent === '') {
      e.preventDefault();
      e.stopPropagation();

      addToHistory(blocks);
      const currentIndex = blocks.findIndex((b) => b.id === blockId);
      if (currentIndex > 0) {
        const previousBlock = blocks[currentIndex - 1];
        const prevContent = textContent[previousBlock.id] || '';

        const prevEl = blockRefs.current[previousBlock.id];

        const updatedBlocks = blocks.filter((b) => b.id !== blockId);
        setBlocks(updateBlockNumbers(updatedBlocks));

        if (prevEl) {
          prevEl.textContent = prevContent;
          prevEl.focus();

          const range = document.createRange();
          const textNode = prevEl.firstChild || prevEl;

          range.setStart(textNode, prevContent.length);
          range.setEnd(textNode, prevContent.length);

          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    }
  };

  const handleFormatChange = (type: string) => {
    if (activeBlock) {
      addToHistory(blocks);
      const currentBlock = blocks.find((b) => b.id === activeBlock);
      const updatedBlocks = blocks.map((block) =>
        block.id === activeBlock
          ? {
              ...block,
              type: type,
              content:
                type === 'parenthetical'
                  ? '()'
                  : currentBlock?.type === 'parenthetical'
                  ? ''
                  : block.content,
            }
          : block
      );
      setBlocks(updateBlockNumbers(updatedBlocks));

      if (type === 'parenthetical') {
        setTimeout(() => {
          const el = blockRefs.current[activeBlock];
          if (el) {
            const range = document.createRange();
            if (el.firstChild) {
              range.setStart(el.firstChild, 1);
              range.setEnd(el.firstChild, 1);
              const selection = window.getSelection();
              if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
              }
            }
          }
        }, 0);
      }
    }
  };

  const handleBlockClick = (id: string, e: React.MouseEvent) => {
    if (!isSelecting.current) {
      setActiveBlock(id);
      
      if (e.shiftKey && lastClickedBlock.current) {
        const startIdx = blocks.findIndex(b => b.id === lastClickedBlock.current);
        const endIdx = blocks.findIndex(b => b.id === id);
        const [start, end] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        
        const newSelection = new Set<string>();
        for (let i = start; i <= end; i++) {
          newSelection.add(blocks[i].id);
        }
        setSelectedBlocks(newSelection);
      } else if (e.ctrlKey || e.metaKey) {
        setSelectedBlocks(prev => {
          const newSelection = new Set(prev);
          if (newSelection.has(id)) {
            newSelection.delete(id);
          } else {
            newSelection.add(id);
          }
          return newSelection;
        });
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        setSelectedBlocks(new Set([id]));
      }
      
      lastClickedBlock.current = id;
    }
  };

  const pages = organizeBlocksIntoPages(blocks);

  return (
    <div className="flex-1 overflow-auto">
      <div 
        className="max-w-[210mm] mx-auto my-8 screenplay-pages"
        style={{
          transform: `scale(${zoomLevel / 100})`,
          transformOrigin: 'top center'
        }}
      >
        <div
          className={`rounded-lg shadow-lg ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}
        >
          <div
            className={`transition-colors duration-200 ${
              isDarkMode ? 'bg-gray-900' : 'bg-white'
            }`}
          >
            <div className="relative">
              {pages.map((pageBlocks, pageIndex) => (
                <Page
                  key={pageIndex}
                  pageIndex={pageIndex}
                  blocks={pageBlocks}
                  isDarkMode={isDarkMode}
                  header={header}
                  editingHeader={editingHeader}
                  onHeaderChange={setHeader}
                  onEditingHeaderChange={setEditingHeader}
                  onContentChange={handleContentChange}
                  onKeyDown={handleKeyDown}
                  onBlockFocus={setActiveBlock}
                  onBlockClick={handleBlockClick}
                  selectedBlocks={selectedBlocks}
                  blockRefs={blockRefs}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <FormatButtons
        isDarkMode={isDarkMode}
        activeBlock={activeBlock}
        onFormatChange={handleFormatChange}
        blocks={blocks}
      />
    </div>
  );
};

export default ScreenplayEditor;