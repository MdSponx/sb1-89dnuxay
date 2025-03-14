import { useCallback, useRef, useEffect } from 'react';
import { Block, BlockHandlers } from '../types';
import { BLOCK_TYPES } from '../constants/editorConstants';
import { detectFormat, getNextBlockType, updateBlockNumbers } from '../utils/blockUtils';

interface MultiBlockSelection {
  startBlock: string | null;
  startOffset: number;
  endBlock: string | null;
  endOffset: number;
  selectedText: string;
}

export const useBlockHandlers = (
  state: {
    blocks: Block[];
    activeBlock: string | null;
    textContent: Record<string, string>;
    selectedBlocks: Set<string>;
  },
  blockRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>,
  addToHistory: (blocks: Block[]) => void,
  updateBlocks: (blocks: Block[]) => void,
  setSelectedBlocks: (blocks: Set<string>) => void,
  setHasChanges?: (hasChanges: boolean) => void
): BlockHandlers => {
  const lastKeyPressTime = useRef<number>(0);
  const lastClickedBlock = useRef<string | null>(null);
  const isDragging = useRef(false);
  const dragStartBlock = useRef<string | null>(null);
  const dragEndBlock = useRef<string | null>(null);
  const isTextSelection = useRef(false);
  const selectionStartBlock = useRef<string | null>(null);
  const selectionStartOffset = useRef<number>(0);
  const lastMousePosition = useRef({ x: 0, y: 0 });
  const multiBlockSelection = useRef<MultiBlockSelection>({
    startBlock: null,
    startOffset: 0,
    endBlock: null,
    endOffset: 0,
    selectedText: ''
  });

  // Find Block ID from a DOM node
  const findBlockIdFromNode = (node: Node | null): string | null => {
    if (!node) return null;
    
    let current = node;
    while (current && !(current instanceof HTMLElement && current.hasAttribute('data-block-id'))) {
      if (current.parentElement) {
        current = current.parentElement;
      } else {
        return null;
      }
    }
    
    return current instanceof HTMLElement ? current.getAttribute('data-block-id') : null;
  };

  const handleEnterKey = useCallback((blockId: string, element: HTMLDivElement): string => {
    const selection = window.getSelection();
    if (!selection) return blockId;

    const range = selection.getRangeAt(0);
    const currentBlock = state.blocks.find((b) => b.id === blockId);
    if (!currentBlock) return blockId;

    const content = element.textContent || '';
    const caretPos = range.startOffset;
    const textBefore = content.substring(0, caretPos);
    const textAfter = content.substring(caretPos);

    const now = Date.now();
    const isDoubleEnter = now - lastKeyPressTime.current < 500 && 
                         currentBlock.type === 'dialogue' && 
                         textBefore.trim() === '';
    lastKeyPressTime.current = now;

    addToHistory(state.blocks);

    // Special handling for transitions
    if (currentBlock.type === 'transition') {
      const newBlock = {
        id: Date.now().toString(),
        type: 'scene-heading',
        content: '',
      };

      const updatedBlocks = [...state.blocks];
      const currentIndex = state.blocks.findIndex((b) => b.id === blockId);
      
      // Update current block if needed
      if (textBefore.trim() !== '') {
        updatedBlocks[currentIndex] = {
          ...currentBlock,
          content: textBefore.trim().toUpperCase(),
        };
      }

      if (setHasChanges) {
        setHasChanges(true);
      }

      // Insert new scene heading block
      updatedBlocks.splice(currentIndex + 1, 0, newBlock);
      updateBlocks(updatedBlocks);

      // Focus the new block and show scene heading suggestions
      setTimeout(() => {
        const el = blockRefs.current[newBlock.id];
        if (el) {
          el.focus();
          // Trigger scene heading suggestions by dispatching a focus event
          el.dispatchEvent(new FocusEvent('focus'));
        }
      }, 0);

      return newBlock.id;
    }

    if (isDoubleEnter) {
      const updatedBlocks = state.blocks.filter(b => b.id !== blockId);
      const newBlock = {
        id: Date.now().toString(),
        type: 'action',
        content: textAfter,
      };
      updatedBlocks.push(newBlock);
      updateBlocks(updatedBlocks);
      
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
      const updatedBlocks = [...state.blocks];
      const currentIndex = state.blocks.findIndex((b) => b.id === blockId);

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
      updateBlocks(updatedBlocks);

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
    const currentIndex = state.blocks.findIndex((b) => b.id === blockId);
    const updatedBlocks = [...state.blocks];

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
    updateBlocks(updatedBlocks);

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

        // Show scene heading suggestions if needed
        if (newBlock.type === 'scene-heading') {
          el.dispatchEvent(new FocusEvent('focus'));
        }
      }
    }, 0);

    return newBlock.id;
  }, [state.blocks, addToHistory, updateBlocks]);

  const handleFormatChange = useCallback((type: string) => {
    if (state.activeBlock) {
      addToHistory(state.blocks);
      const currentBlock = state.blocks.find((b) => b.id === state.activeBlock);
      if (!currentBlock) return;

      // Save current selection and cursor position
      const selection = window.getSelection();
      const activeElement = blockRefs.current[state.activeBlock];
      let cursorPosition = 0;
      let hasSelection = false;
      let selectionStart = 0;
      let selectionEnd = 0;

      if (selection && selection.rangeCount > 0 && activeElement) {
        const range = selection.getRangeAt(0);
        if (range.startContainer.parentNode === activeElement || range.startContainer === activeElement) {
          cursorPosition = range.startOffset;
          hasSelection = !range.collapsed;
          selectionStart = range.startOffset;
          selectionEnd = range.endOffset;
        }
      }

      // Format-specific content transformations
      let newContent = currentBlock.content;
      
      // If changing to parenthetical and current content is empty or just parentheses
      if (type === 'parenthetical') {
        const content = currentBlock.content.trim();
        if (content === '' || content === '()') {
          newContent = '()';
        } else if (!content.startsWith('(') || !content.endsWith(')')) {
          // Add parentheses if they don't exist
          newContent = `(${content.replace(/^\(|\)$/g, '')})`;
        }
      } else if (currentBlock.type === 'parenthetical' && type !== 'parenthetical') {
        // If changing from parenthetical to another type, remove parentheses
        newContent = currentBlock.content.replace(/^\(|\)$/g, '').trim();
      }

      // If changing to character, uppercase the content
      if (type === 'character' && currentBlock.type !== 'character') {
        newContent = newContent.toUpperCase();
      }
      if (setHasChanges) {
        setHasChanges(true);
      }

      // If changing to scene-heading, check if it needs a prefix
      if (type === 'scene-heading' && !(/^(INT|EXT|INT\/EXT|I\/E)\.?\s/i.test(newContent))) {
        // If empty or doesn't start with a scene prefix, we'll show suggestions later
        if (newContent.trim() === '') {
          newContent = '';
        }
      }

      // If changing to transition, check if it needs formatting
      if (type === 'transition' && !(/TO:$/.test(newContent) || /^FADE (IN|OUT)|^DISSOLVE/i.test(newContent))) {
        if (newContent.trim() === '') {
          newContent = '';
        } else if (!newContent.endsWith('TO:')) {
          newContent = newContent.toUpperCase();
        }
      }

      // Update the block with new type and transformed content
      const updatedBlocks = state.blocks.map((block) => {
        if (block.id === state.activeBlock) {
          return {
            ...block,
            type,
            content: newContent
          };
        }
        return block;
      });

      updateBlocks(updateBlockNumbers(updatedBlocks));

      // Restore cursor position or selection after the update
      setTimeout(() => {
        const el = blockRefs.current[state.activeBlock];
        if (!el) return;

        el.focus();

        // Handle special cases for empty blocks or blocks that need suggestions
        if ((type === 'scene-heading' || type === 'transition' || type === 'shot') && newContent.trim() === '') {
          // Trigger suggestions by dispatching a focus event
          el.dispatchEvent(new FocusEvent('focus'));
          return;
        }

        // Handle special case for parenthetical
        if (type === 'parenthetical' && newContent === '()') {
          const range = document.createRange();
          if (el.firstChild) {
            range.setStart(el.firstChild, 1);
            range.setEnd(el.firstChild, 1);
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
            return;
          }
        }

        try {
          // Restore cursor position or selection
          const range = document.createRange();
          const textNode = el.firstChild || el;
          
          if (hasSelection) {
            // Adjust selection positions if content length changed
            const contentLengthRatio = newContent.length / currentBlock.content.length;
            const adjustedStart = Math.min(Math.round(selectionStart * contentLengthRatio), newContent.length);
            const adjustedEnd = Math.min(Math.round(selectionEnd * contentLengthRatio), newContent.length);
            
            range.setStart(textNode, adjustedStart);
            range.setEnd(textNode, adjustedEnd);
          } else {
            // Adjust cursor position if content length changed
            const adjustedPosition = Math.min(cursorPosition, newContent.length);
            range.setStart(textNode, adjustedPosition);
            range.collapse(true);
          }
          
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } catch (err) {
          // Fallback: place cursor at the end
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }, 0);
    }
  }, [state.activeBlock, state.blocks, addToHistory, updateBlocks]);

  const handleContentChange = useCallback((id: string, newContent: string, forcedType?: string) => {
    const currentBlockIndex = state.blocks.findIndex(b => b.id === id);
    const currentBlock = state.blocks[currentBlockIndex];
    
    if (!currentBlock) return;

    if (newContent.trim() === '') {
      addToHistory(state.blocks);
      const updatedBlocks = state.blocks.filter((_, index) => index !== currentBlockIndex);
      updateBlocks(updatedBlocks);
      return;

      
    }
    if (setHasChanges) {
      setHasChanges(true);
    }
    

    addToHistory(state.blocks);
    let updatedBlocks = [...state.blocks];

    // Function to create and focus a new scene heading block
    const createAndFocusSceneHeading = (afterIndex: number) => {
      const newBlock = {
        id: Date.now().toString(),
        type: 'scene-heading',
        content: '',
      };
      
      // Insert the new block after the specified index
      updatedBlocks.splice(afterIndex + 1, 0, newBlock);
      updateBlocks(updatedBlocks);

      // Focus the new scene heading block
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

    // Handle forced type changes (from suggestions)
    if (forcedType) {
      updatedBlocks = updatedBlocks.map(block => {
        if (block.id !== id) return block;
        return {
          ...block,
          type: forcedType,
          content: newContent,
        };
      });

      // If it's a transition, immediately create a new scene heading
      if (forcedType === 'transition') {
        createAndFocusSceneHeading(currentBlockIndex);
      }

      updateBlocks(updatedBlocks);
      return;
    }

    // Handle regular content changes
    const isTransitionContent = (content: string) => {
      const trimmedContent = content.trim().toUpperCase();
      return trimmedContent.endsWith('TO:') || 
             /^FADE (IN|OUT)|^DISSOLVE/.test(trimmedContent);
    };

    // Update the current block
    updatedBlocks = updatedBlocks.map(block => {
      if (block.id !== id) return block;

      // Special handling for parenthetical blocks
      if (block.type === 'parenthetical') {
        let content = newContent.trim();
        if (!content.startsWith('(')) content = `(${content}`;
        if (!content.endsWith(')')) content = `${content})`;
        return { ...block, content };
      }

      // Check for transition patterns
      if (isTransitionContent(newContent) && block.type !== 'transition') {
        return {
          ...block,
          type: 'transition',
          content: newContent.trim().toUpperCase(),
        };
      }

      const detectedFormat = detectFormat(newContent);
      return {
        ...block,
        content: newContent,
        type: detectedFormat || block.type,
      };
    });

    // Check if we just created a transition block
    const updatedBlock = updatedBlocks[currentBlockIndex];
    const wasTransitionCreated = updatedBlock.type === 'transition' && 
                                currentBlock.type !== 'transition';

    // If we just created a transition block, immediately create a scene heading
    if (wasTransitionCreated) {
      createAndFocusSceneHeading(currentBlockIndex);
    }

    updateBlocks(updatedBlocks);
  }, [state.blocks, addToHistory, updateBlocks]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>, blockId: string) => {
    const el = e.target as HTMLDivElement;

    // Handle keyboard shortcuts
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      // Copy: Ctrl+C
      if (e.key === 'c') {
        // Check if we have a multi-block selection
        if (multiBlockSelection.current.startBlock && 
            multiBlockSelection.current.endBlock && 
            multiBlockSelection.current.startBlock !== multiBlockSelection.current.endBlock &&
            multiBlockSelection.current.selectedText) {
          e.preventDefault();
          handleCopyMultiBlockSelection();
        }
        return;
      }
      
      // Cut: Ctrl+X
      if (e.key === 'x') {
        // Check if we have a multi-block selection
        if (multiBlockSelection.current.startBlock && 
            multiBlockSelection.current.endBlock && 
            multiBlockSelection.current.startBlock !== multiBlockSelection.current.endBlock &&
            multiBlockSelection.current.selectedText) {
          e.preventDefault();
          handleCutMultiBlockSelection();
        }
        return;
      }
    }

    if (setHasChanges) {
      setHasChanges(true);
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (el.textContent?.trim() !== '' || el.textContent === '') {
        handleEnterKey(blockId, el);
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const currentBlock = state.blocks.find((b) => b.id === blockId);
      if (!currentBlock) return;

      const currentIndex = BLOCK_TYPES.indexOf(currentBlock.type as any);
      const nextType = BLOCK_TYPES[(currentIndex + 1) % BLOCK_TYPES.length];

      handleFormatChange(nextType);
    }

    if (e.key === 'Backspace' && el.textContent === '') {
      e.preventDefault();
      e.stopPropagation();

      const currentIndex = state.blocks.findIndex((b) => b.id === blockId);
      if (currentIndex > 0) {
        addToHistory(state.blocks);
        
        const previousBlock = state.blocks[currentIndex - 1];
        const prevEl = blockRefs.current[previousBlock.id];

        const updatedBlocks = state.blocks.filter((b) => b.id !== blockId);
        updateBlocks(updatedBlocks);

        if (prevEl) {
          prevEl.focus();
          const range = document.createRange();
          
          if (!prevEl.firstChild) {
            prevEl.textContent = '';
          }
          
          const textNode = prevEl.firstChild || prevEl;
          const position = previousBlock.content.length;
          
          try {
            range.setStart(textNode, position);
            range.setEnd(textNode, position);
            
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
          } catch (err) {
            range.selectNodeContents(prevEl);
            range.collapse(false);
            
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        }
      }
    }
  }, [state.blocks, handleEnterKey, handleFormatChange, addToHistory, updateBlocks]);

  const handleCopyMultiBlockSelection = useCallback(() => {
    if (!multiBlockSelection.current.startBlock || 
        !multiBlockSelection.current.endBlock || 
        !multiBlockSelection.current.selectedText) {
      return;
    }

    // Get the selected text with proper formatting
    const selectedText = multiBlockSelection.current.selectedText;
    
    // Create a structured representation for clipboard
    const formattedText = selectedText;
    
    // Copy to clipboard
    navigator.clipboard.writeText(formattedText).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  }, []);

  const handleCutMultiBlockSelection = useCallback(() => {
    if (!multiBlockSelection.current.startBlock || 
        !multiBlockSelection.current.endBlock || 
        !multiBlockSelection.current.selectedText) {
      return;
    }

    // First copy the selection
    handleCopyMultiBlockSelection();
    
    // Then delete the selection
    addToHistory(state.blocks);
    
    // Find the indices of the start and end blocks
    const startIdx = state.blocks.findIndex(b => b.id === multiBlockSelection.current.startBlock);
    const endIdx = state.blocks.findIndex(b => b.id === multiBlockSelection.current.endBlock);
    
    if (startIdx === -1 || endIdx === -1) return;
    
    // Get the selection range
    const selection = window.getSelection();
    if (!selection) return;
    
    // Let the browser handle the deletion for now
    // For more complex multi-block selections, we would need more sophisticated handling
    
    // Clear the selection state
    multiBlockSelection.current = {
      startBlock: null,
      startOffset: 0,
      endBlock: null,
      endOffset: 0,
      selectedText: ''
    };
  }, [addToHistory, handleCopyMultiBlockSelection]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (multiBlockSelection.current.startBlock && 
            multiBlockSelection.current.endBlock && 
            multiBlockSelection.current.startBlock !== multiBlockSelection.current.endBlock &&
            multiBlockSelection.current.selectedText) {
            
          if (e.key === 'c') {
            handleCopyMultiBlockSelection();
          }
          
          if (e.key === 'x') {
            handleCutMultiBlockSelection();
          }
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCopyMultiBlockSelection, handleCutMultiBlockSelection]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || 
          e.key === 'Shift' || e.key === 'Tab' || 
          e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
          e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        return;
      }

      if (state.selectedBlocks.size > 0) {
        setSelectedBlocks(new Set());
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedBlocks, setSelectedBlocks]);

  const handleBlockClick = useCallback((id: string, e: React.MouseEvent) => {
    if (isTextSelection.current) return;

    if (!isDragging.current) {
      lastClickedBlock.current = id;
    }
  }, []);

  const handleBlockDoubleClick = useCallback((id: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedBlock.current) {
      const startIdx = state.blocks.findIndex(b => b.id === lastClickedBlock.current);
      const endIdx = state.blocks.findIndex(b => b.id === id);
      const [start, end] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      
      const newSelection = new Set<string>();
      for (let i = start; i <= end; i++) {
        newSelection.add(state.blocks[i].id);
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
    } else {
      setSelectedBlocks(new Set([id]));
    }
  }, [state.blocks, setSelectedBlocks]);

  const handleMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    const isContentEditable = target.hasAttribute('contenteditable');
    
    lastMousePosition.current = { x: e.clientX, y: e.clientY };

    if (isContentEditable) {
      isTextSelection.current = true;
      selectionStartBlock.current = id;
      
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        selectionStartOffset.current = range.startOffset;
        
        multiBlockSelection.current = {
          startBlock: id,
          startOffset: range.startOffset,
          endBlock: id,
          endOffset: range.startOffset,
          selectedText: ''
        };
      }
      return;
    }

    e.preventDefault();
    isDragging.current = true;
    dragStartBlock.current = id;
    dragEndBlock.current = id;
  }, []);

  return {
    handleContentChange,
    handleEnterKey,
    handleKeyDown,
    handleBlockClick,
    handleBlockDoubleClick,
    handleFormatChange,
    handleMouseDown,
  };
};