import React, { useState, useEffect, useRef } from 'react';
import { BlockComponentProps } from '../types';
import { getBlockStyle, getBlockMargin } from '../utils/styleUtils';
import SceneTypeSuggestions from './SceneTypeSuggestions';
import TransitionSuggestions from './TransitionSuggestions';
import ShotTypeSuggestions from './ShotTypeSuggestions';

const BlockComponent: React.FC<BlockComponentProps> = ({
  block,
  isDarkMode,
  onContentChange,
  onKeyDown,
  onFocus,
  onClick,
  onMouseDown,
  onDoubleClick,
  isSelected,
  isActive,
  blockRefs,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsPosition, setSuggestionsPosition] = useState<{ x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const updateSuggestionsPosition = () => {
    if (!contentRef.current) return;

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    setSuggestionsPosition({
      x: rect.left,
      y: rect.bottom + 4
    });
  };

  useEffect(() => {
    if ((block.type === 'scene-heading' || block.type === 'transition' || block.type === 'shot') && isActive) {
      const content = block.content.trim();
      if (!content) {
        updateSuggestionsPosition();
        setShowSuggestions(true);
      }
    } else {
      setShowSuggestions(false);
    }
  }, [block.type, block.content, isActive]);

  const handleFocus = () => {
    onFocus(block.id);
    if ((block.type === 'scene-heading' || block.type === 'transition' || block.type === 'shot') && !block.content.trim()) {
      updateSuggestionsPosition();
      setShowSuggestions(true);
    }
  };

  const handleSuggestionSelect = (type: string) => {
    const blockType = block.type === 'scene-heading' ? 'scene-heading' : 
                     block.type === 'transition' ? 'transition' : 'shot';
    onContentChange(block.id, type, blockType);
    setShowSuggestions(false);

    setTimeout(() => {
      if (contentRef.current) {
        const range = document.createRange();
        const sel = window.getSelection();
        const textNode = contentRef.current.firstChild || contentRef.current;
        range.setStart(textNode, type.length);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
        contentRef.current.focus();
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (showSuggestions) {
      if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
        e.preventDefault();
        return;
      }
      if (e.key !== 'Backspace') {
        setShowSuggestions(false);
      }
    }
    onKeyDown(e, block.id);
  };

  const handleInput = () => {
    if (block.type === 'scene-heading' || block.type === 'transition' || block.type === 'shot') {
      const content = contentRef.current?.textContent || '';
      if (!content.trim()) {
        updateSuggestionsPosition();
        setShowSuggestions(true);
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget?.closest('.scene-type-suggestions, .transition-suggestions, .shot-type-suggestions')) {
      onContentChange(block.id, e.currentTarget.textContent || '');
      setShowSuggestions(false);
    }
  };

  const handleDoubleClickInternal = (e: React.MouseEvent) => {
    if (onDoubleClick) {
      onDoubleClick(block.id, e);
    }
  };

  return (
    <div 
      className={`relative screenplay-block block-container ${getBlockMargin(block.type)} ${
        isSelected ? 'selecting' : ''
      } ${isSelected ? 'multi-selected' : ''}`}
      onClick={(e) => onClick(block.id, e)}
      onMouseDown={(e) => onMouseDown(block.id, e)}
      onDoubleClick={handleDoubleClickInternal}
      data-block-id={block.id}
      data-active={isActive}
      data-selected={isSelected}
      data-block-type={block.type}
    >
      {block.type === 'scene-heading' && (
        <div
          className={`absolute inset-0 ${
            isDarkMode ? 'bg-gray-800/50' : 'bg-gray-100'
          } rounded`}
          style={{
            transform: 'translateY(2px)',
            height: '1.75rem',
          }}
        />
      )}
      {block.type === 'scene-heading' && block.number && (
        <div
          className={`absolute -left-8 top-1/2 -translate-y-1/2 text-sm ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          {block.number}
        </div>
      )}
      <div
        ref={(el) => {
          if (blockRefs && blockRefs.current) {
            blockRefs.current[block.id] = el;
          }
          if (contentRef) {
            contentRef.current = el;
          }
        }}
        contentEditable
        suppressContentEditableWarning
        className={`block-editor ${getBlockStyle({ type: block.type, isDarkMode, isSelected })} ${
          isSelected ? (isDarkMode ? 'bg-blue-900/30' : 'bg-blue-100') : ''
        }`}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        data-block-id={block.id}
        style={{
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          msUserSelect: 'text',
          userSelect: 'text',
        }}
      >
        {block.content}
      </div>
      {block.type === 'dialogue' && block.number && (
        <div
          className={`absolute -right-8 top-1/2 -translate-y-1/2 text-sm ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          {block.number}
        </div>
      )}
      {showSuggestions && suggestionsPosition && (
        block.type === 'scene-heading' ? (
          <SceneTypeSuggestions
            blockId={block.id}
            onSelect={handleSuggestionSelect}
            position={suggestionsPosition}
            onClose={() => setShowSuggestions(false)}
          />
        ) : block.type === 'transition' ? (
          <TransitionSuggestions
            blockId={block.id}
            onSelect={handleSuggestionSelect}
            position={suggestionsPosition}
            onClose={() => setShowSuggestions(false)}
          />
        ) : (
          <ShotTypeSuggestions
            blockId={block.id}
            onSelect={handleSuggestionSelect}
            position={suggestionsPosition}
            onClose={() => setShowSuggestions(false)}
          />
        )
      )}
    </div>
  );
};

export default BlockComponent;