import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface SceneTypeSuggestionsProps {
  blockId: string;
  onSelect: (type: string) => void;
  position: { x: number; y: number };
  onClose: () => void;
}

const SceneTypeSuggestions: React.FC<SceneTypeSuggestionsProps> = ({
  blockId,
  onSelect,
  position,
  onClose,
}) => {
  const { t } = useLanguage();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    { label: 'INT. ', description: t('interior_scene') },
    { label: 'EXT. ', description: t('exterior_scene') },
    { label: 'INT./EXT. ', description: t('interior_exterior_scene') },
    { label: 'EXT./INT. ', description: t('exterior_interior_scene') },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(suggestions[selectedIndex].label);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onSelect, selectedIndex, suggestions]);

  return (
    <div
      ref={popupRef}
      className="scene-type-suggestions fixed z-[9999] min-w-[200px] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
      }}
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.label}
          className={`w-full px-4 py-2 text-left flex flex-col hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200
            ${selectedIndex === index ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
          onClick={() => onSelect(suggestion.label)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
            {suggestion.label}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {suggestion.description}
          </span>
        </button>
      ))}
    </div>
  );
};

export default SceneTypeSuggestions;