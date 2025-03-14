import React from 'react';
import BlockComponent from '../BlockComponent';
import PageHeader from './PageHeader';

interface PageProps {
  pageIndex: number;
  blocks: Array<{
    id: string;
    type: string;
    content: string;
    number?: number;
  }>;
  isDarkMode: boolean;
  header: string;
  editingHeader: boolean;
  onHeaderChange: (value: string) => void;
  onEditingHeaderChange: (editing: boolean) => void;
  onContentChange: (id: string, content: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, blockId: string) => void;
  onBlockFocus: (id: string) => void;
  onBlockClick: (id: string, e: React.MouseEvent) => void;
  onBlockMouseDown: (id: string, e: React.MouseEvent) => void;
  onBlockDoubleClick: (id: string, e: React.MouseEvent) => void;
  selectedBlocks: Set<string>;
  activeBlock: string | null;
  blockRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

const Page: React.FC<PageProps> = ({
  pageIndex,
  blocks,
  isDarkMode,
  header,
  editingHeader,
  onHeaderChange,
  onEditingHeaderChange,
  onContentChange,
  onKeyDown,
  onBlockFocus,
  onBlockClick,
  onBlockMouseDown,
  onBlockDoubleClick,
  selectedBlocks,
  activeBlock,
  blockRefs,
}) => {
  return (
    <div
      className={`relative w-[210mm] mx-auto shadow-lg transition-colors duration-200 mb-8 screenplay-page ${
        isDarkMode ? 'bg-primary-950 text-gray-100' : 'bg-white text-gray-900'
      }`}
      style={{
        minHeight: '297mm',
        pageBreakAfter: 'always',
      }}
      data-page-index={pageIndex}
    >
      <PageHeader
        isDarkMode={isDarkMode}
        header={header}
        pageNumber={pageIndex + 1}
        editingHeader={editingHeader}
        onHeaderChange={onHeaderChange}
        onEditingHeaderChange={onEditingHeaderChange}
      />

      <div
        className="px-[20mm] screenplay-content user-select-text"
        style={{
          minHeight: 'calc(297mm - 15mm)',
          paddingTop: '8mm',
          paddingBottom: '8mm',
        }}
        data-screenplay-content="true"
      >
        {blocks.map((block) => (
          <BlockComponent
            key={block.id}
            block={block}
            isDarkMode={isDarkMode}
            onContentChange={onContentChange}
            onKeyDown={onKeyDown}
            onFocus={onBlockFocus}
            onClick={onBlockClick }
            onMouseDown={onBlockMouseDown}
            onDoubleClick={onBlockDoubleClick}
            isSelected={selectedBlocks instanceof Set ? selectedBlocks.has(block.id) : false}
            isActive={block.id === activeBlock}
            blockRefs={blockRefs}
          />
        ))}
      </div>
    </div>
  );
};

export default Page;