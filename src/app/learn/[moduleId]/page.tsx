import { learningModulesData } from '@/lib/learningModulesData';
import type { ContentBlock } from '@/types/education.types';
import { notFound } from 'next/navigation';
import Image from 'next/image'; // For handling image blocks
import Tooltip from '@/components/Tooltip'; // Import Tooltip
import { glossaryData } from '@/lib/glossaryData'; // Import Glossary Data
import React from 'react'; // Import React for fragments
import QuizComponent from '@/components/QuizComponent'; // Import QuizComponent

// Function to generate static paths at build time (optional but good for performance)
export async function generateStaticParams() {
  return learningModulesData.map((module) => ({
    moduleId: module.id,
  }));
}

// Generate a regex to find glossary terms (case-insensitive)
const glossaryTerms = Array.from(glossaryData.keys());
// Escape regex special characters in terms before joining
const escapedTerms = glossaryTerms.map(term => term.replace(/[.*+?^${}()|[\\]]/g, '\\$&'));
const glossaryRegex = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi');

// Helper component to render individual content blocks
const RenderContentBlock = ({ block }: { block: ContentBlock }) => {
  switch (block.type) {
    case 'heading':
      // Explicitly handle heading levels
      if (block.level === 2) return <h2 className="text-2xl font-semibold my-4 border-b pb-1">{block.content}</h2>;
      if (block.level === 3) return <h3 className="text-xl font-semibold my-3">{block.content}</h3>;
      if (block.level === 4) return <h4 className="text-lg font-semibold my-3">{block.content}</h4>;
      if (block.level === 5) return <h5 className="text-base font-semibold my-2">{block.content}</h5>;
      if (block.level === 6) return <h6 className="text-sm font-semibold my-2">{block.content}</h6>;
      return <p className="font-semibold my-2">{block.content}</p>; // Fallback for level 1 or unexpected
    case 'text':
      const parts = block.content.split(glossaryRegex);
      return (
        <p className="my-2 text-gray-700 dark:text-gray-300">
          {parts.map((part, index) => {
            // Check if the part is a glossary term (case-insensitive)
            const lowerCasePart = part?.toLowerCase();
            const isGlossaryTerm = glossaryTerms.some(term => term.toLowerCase() === lowerCasePart);

            if (isGlossaryTerm && glossaryData.has(lowerCasePart)) {
              return (
                <Tooltip key={index} text={glossaryData.get(lowerCasePart)!}>
                  <span className="font-semibold text-blue-600 dark:text-blue-400 cursor-help border-b border-dotted border-blue-600 dark:border-blue-400">
                    {part} {/* Display original casing */}
                  </span>
                </Tooltip>
              );
            } else {
              // Regular text part
              return <React.Fragment key={index}>{part}</React.Fragment>;
            }
          })}
        </p>
      );
    case 'image':
      return (
        <figure className="my-4">
          {/* Assuming images are in public/images. Adjust path if needed. */}
          <Image src={block.src} alt={block.alt} width={600} height={400} className="rounded shadow-md mx-auto" />
          {block.caption && <figcaption className="text-center text-sm text-gray-500 mt-2">{block.caption}</figcaption>}
        </figure>
      );
    case 'video':
      // Basic video embed, needs proper styling/player later
      return (
        <figure className="my-4">
          <video controls src={block.src} className="w-full rounded shadow-md mx-auto max-w-2xl">
            Your browser does not support the video tag.
          </video>
          {block.caption && <figcaption className="text-center text-sm text-gray-500 mt-2">{block.caption}</figcaption>}
        </figure>
      );
    case 'quiz':
      return <QuizComponent questions={block.questions} />;
    // Add case for 'diagram' later
    default:
      return null;
  }
};

export default function ModulePage({ params }: { params: { moduleId: string } }) {
  const module = learningModulesData.find(m => m.id === params.moduleId);

  if (!module) {
    notFound(); // Show 404 page if module ID is invalid
  }

  return (
    <article className="prose dark:prose-invert max-w-none">
      <h1 className="text-3xl font-bold mb-4 border-b pb-2">{module.title}</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">{module.description}</p>

      {module.lessons.map((lesson, lessonIndex) => (
        <section key={lesson.id} className="mb-8 p-4 border rounded shadow-sm">
          <h2 className="text-2xl font-bold mb-4">Lesson {lessonIndex + 1}: {lesson.title}</h2>
          <p className="text-sm text-gray-500 mb-4">Estimated time: {lesson.estimatedTimeMinutes} minutes</p>
          <div>
            {lesson.contentBlocks.map((block, blockIndex) => (
              <RenderContentBlock key={`${lesson.id}-block-${blockIndex}`} block={block} />
            ))}
          </div>
        </section>
      ))}

      {/* Add navigation (Next/Prev Lesson) later */}
    </article>
  );
} 