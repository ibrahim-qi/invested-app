'use client'; // Mark as client component if using hooks or event handlers later

import React, { lazy, Suspense, useState, useEffect } from 'react';
import InfoTooltip from '@/components/common/InfoTooltip'; // Updated import
import { recordQuizScore } from '@/app/actions/learnActions'; // Import the server action

// Type for the glossary entries (optional but good practice)
interface GlossaryEntry {
  term: string;
  definition: string;
}

// --- Helper function moved here ---
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --- Interface Definitions --- 
interface QuestionData {
  id?: string;
  questionText: string;
  options: string[];
  correctAnswerIndex: number;
}

interface BlockData {
  text?: string;              // For paragraph, header
  level?: number;             // For header
  style?: 'ordered' | 'unordered'; // For list
  items?: string[];           // For list
  questions?: QuestionData[]; // For quiz
  // Add other potential fields: src, caption for image, etc.
}

interface Block {
  id?: string; // Assuming blocks might have IDs
  type: string; // e.g., 'paragraph', 'header', 'list', 'image'
  data: BlockData;
}

interface ContentStructure {
  time?: number; // Optional timestamp from editor
  blocks: Block[];
  version?: string; // Optional editor version
}

interface ConceptRendererProps {
  content: string; // The JSON string from Supabase
  conceptId: string; // Add conceptId to pass to server action
}

const ConceptRenderer: React.FC<ConceptRendererProps> = ({ content, conceptId }) => {
  let parsedContent: ContentStructure | null = null;
  const [glossary, setGlossary] = useState<Record<string, GlossaryEntry> | null>(null);
  const [glossaryRegex, setGlossaryRegex] = useState<RegExp | null>(null);
  const [isLoadingGlossary, setIsLoadingGlossary] = useState(true);

  useEffect(() => {
    const fetchGlossary = async () => {
      try {
        const response = await fetch('/glossary.json'); // Fetch from public path
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: Record<string, GlossaryEntry> = await response.json();
        setGlossary(data);

        // Build regex after fetching data
        const terms = Object.keys(data).map(escapeRegex);
        terms.sort((a, b) => b.length - a.length);
        if (terms.length > 0) {
            setGlossaryRegex(new RegExp(`\\b(${terms.join('|')})\\b`, 'gi'));
        } else {
            setGlossaryRegex(null); // Handle empty glossary
        }

      } catch (error) {
        console.error("Failed to fetch or process glossary:", error);
        // Handle error appropriately, maybe set an error state
        setGlossary(null);
        setGlossaryRegex(null);
      } finally {
          setIsLoadingGlossary(false);
      }
    };

    fetchGlossary();
  }, []); // Empty dependency array ensures this runs only once on mount

  try {
    parsedContent = JSON.parse(content);
  } catch (error) {
    console.error("Failed to parse concept content:", error);
    return <div className="text-red-500">Error displaying content. Invalid format.</div>;
  }

  if (!parsedContent || !Array.isArray(parsedContent.blocks)) {
    return <div className="text-gray-500">Content is empty or not in the expected format.</div>;
  }

  // Lazy load the QuizBlock component to avoid increasing initial bundle size if not needed
  const QuizBlock = lazy(() => import('./QuizBlock'));

  // --- Handler to be called from QuizBlock --- 
  // We define it here so it can access conceptId
  const handleQuizComplete = async (score: number, totalQuestions: number) => {
    console.log(`Quiz completed in renderer for concept ${conceptId}! Score: ${score}/${totalQuestions}`);
    // Call the server action
    const result = await recordQuizScore(conceptId, score);
    if (result.error) {
        // Handle error - maybe show a toast notification
        console.error("Failed to save quiz score:", result.error);
        alert("Error saving quiz score. Please try again."); // Simple feedback for now
    }
  };
  // ------------------------------------------

  return (
    // Add overall class for prose styling from Tailwind Typography (optional but helpful)
    // Consider installing and configuring @tailwindcss/typography if not already done
    // For now, we add manual spacing with margins.
    <div className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none">
      {parsedContent.blocks.map((block, index) => {
        const key = block.id || `block-${index}`;

        switch (block.type) {
          case 'paragraph':
            const text = block.data.text || '';
            // Only attempt tooltip logic if glossary and regex are loaded
            if (glossary && glossaryRegex && glossaryRegex.test(text)) {
              glossaryRegex.lastIndex = 0; 
              const parts = text.split(glossaryRegex);
              return (
                <p key={key} className="mb-4">
                  {parts.map((part, i) => {
                    const lowerPart = part.toLowerCase();
                    // Check glossary using the fetched state
                    if (glossary[lowerPart]) {
                      return (
                        <InfoTooltip key={i} tip={glossary[lowerPart].definition}>
                          <span className="font-semibold text-indigo-700 cursor-help">{part}</span>
                        </InfoTooltip>
                      );
                    } else {
                      return part;
                    }
                  })}
                </p>
              );
            } else {
              // Render without tooltips if glossary not loaded or no terms match
              // Use dangerouslySetInnerHTML carefully if text can contain HTML
              // Use a div instead of p to allow nested block elements from dangerouslySetInnerHTML
              return <div key={key} dangerouslySetInnerHTML={{ __html: text }} className="mb-4" />;
            }

          case 'header':
            const level = block.data.level || 2;
            const safeLevel = Math.max(1, Math.min(6, level));
            const Tag = `h${safeLevel}`;
            // Add margins based on level - more space above headers
            const headerMargin = level <= 2 ? 'mt-6 mb-3' : 'mt-4 mb-2'; 
            return React.createElement(
              Tag, 
              { key: key, dangerouslySetInnerHTML: { __html: block.data.text || '' }, className: `${headerMargin} font-semibold` }
            );

          case 'list':
            const ListTag = block.data.style === 'ordered' ? 'ol' : 'ul';
            const items = block.data.items || [];
            const listClassName = ListTag === 'ol' ? 'list-decimal' : 'list-disc';
            return (
              <ListTag key={key} className={`pl-5 ${listClassName} space-y-1 mb-4`}>
                {items.map((item, itemIndex) => (
                  <li key={`${key}-item-${itemIndex}`}>{item}</li>
                ))}
              </ListTag>
            );
            
          case 'quiz':
            if (block.data.questions && Array.isArray(block.data.questions)) {
               return (
                 <div key={key} className="my-6">
                    <Suspense fallback={<div>Loading Quiz...</div>}>
                      <QuizBlock 
                          questions={block.data.questions} 
                          onQuizComplete={handleQuizComplete}
                      />
                    </Suspense>
                 </div>
               );
            } else {
               console.warn('Quiz block found but questions data is missing or invalid.');
               return null;
            }

          // TODO: Add cases for other block types (image, quote, etc.)
          default:
            console.warn(`Unsupported block type: ${block.type}`);
            return null;
        }
      })}
    </div>
  );
};

export default ConceptRenderer; 