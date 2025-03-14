import { MutableRefObject } from 'react';

export interface Block {
  id: string;
  type: string;
  content: string;
  number?: number;
}

export interface ScreenplayEditorProps {
  isDarkMode: boolean;
  zoomLevel: number;
}

export interface BlockComponentProps {
  block: Block;
  isDarkMode: boolean;
  onContentChange: (id: string, content: string, type?: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, blockId: string) => void;
  onFocus: (id: string) => void;
  onClick: (id: string, e: React.MouseEvent) => void;
  onMouseDown: (id: string, e: React.MouseEvent) => void;
  onDoubleClick?: (id: string, e: React.MouseEvent) => void;
  isSelected: boolean;
  isActive: boolean;
  blockRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
}

export interface BlockStyleProps {
  type: string;
  isDarkMode: boolean;
  isSelected: boolean;
}

export interface EditorState {
  blocks: Block[];
  activeBlock: string | null;
  selectedBlocks: Set<string>;
  textContent: Record<string, string>;
  header: string;
  editingHeader: boolean;
  undoStack: Block[][];
  redoStack: Block[][];
}

export interface BlockHandlers {
  handleContentChange: (id: string, content: string, type?: string) => void;
  handleEnterKey: (blockId: string, element: HTMLDivElement) => string;
  handleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, blockId: string) => void;
  handleBlockClick: (id: string, e: React.MouseEvent) => void;
  handleBlockDoubleClick: (id: string, e: React.MouseEvent) => void;
  handleFormatChange: (type: string) => void;
  handleMouseDown: (id: string, e: React.MouseEvent) => void;
}