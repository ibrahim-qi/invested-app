import { notFound, redirect } from 'next/navigation';
import Image from 'next/image';
import Tooltip from '@/components/Tooltip';
import React from 'react';
import QuizComponent from '@/components/QuizComponent';
import { createServerClient } from '@/lib/supabase/server';
import MarkCompleteButton from '@/components/MarkCompleteButton';
import type { Database } from '@/lib/database.types';
import { createClient } from '@supabase/supabase-js' // Import the base client

// Define types based on DB schema
type Module = Database['public']['Tables']['learning_modules']['Row'];
type Lesson = Database['public']['Tables']['lessons']['Row'];
type DbContentBlock = Database['public']['Tables']['content_blocks']['Row'];
type GlossaryTerm = Database['public']['Tables']['glossary']['Row'];

// Type guard for ContentBlock JSON parsing
// This needs to align EXACTLY with src/types/education.types.ts ContentBlock union
import type { ContentBlock as AppContentBlock, QuizQuestion } from '@/types/education.types';
function isValidAppContentBlock(obj: any): obj is AppContentBlock {
  if (!obj || typeof obj !== 'object') return false;
  switch (obj.type) {
    case 'text':
      return typeof obj.content === 'string';
    case 'heading':
      return typeof obj.level === 'number' && typeof obj.content === 'string';
    case 'image':
      return typeof obj.src === 'string' && typeof obj.alt === 'string';
    case 'video':
       return typeof obj.src === 'string';
    case 'diagram':
       return typeof obj.src === 'string' && typeof obj.alt === 'string';
    case 'quiz':
       return Array.isArray(obj.questions) && obj.questions.every((q: any) => 
         typeof q.id === 'string' && 
         typeof q.questionText === 'string' && 
         Array.isArray(q.options) && 
         typeof q.correctAnswerIndex === 'number'
       );
    // Add 'diagram' case later if implemented
    default:
      return false;
  }
}


// Fetch data function
async function getModuleData(moduleId: string) {
  console.log(`Fetching data for module: ${moduleId}`); // Log module ID
  const supabase = createServerClient();
  
  // Fetch module
  const { data: moduleData, error: moduleError } = await supabase
    .from('learning_modules')
    .select('*')
    .eq('id', moduleId)
    .single();

  if (moduleError || !moduleData) { 
    console.log('Module fetch failed or not found.');
    return { module: null, lessons: [], glossary: new Map(), completedLessonIds: new Set<string>(), userId: null };
  }
  console.log('Fetched module:', moduleData.title);

  // Fetch lessons for this module, ordered
  const { data: lessonsData, error: lessonsError } = await supabase
    .from('lessons')
    .select('*')
    .eq('module_id', moduleId)
    .order('lesson_order', { ascending: true });

  if (lessonsError) {
     console.error("Error fetching lessons:", lessonsError.message);
     return { module: moduleData, lessons: [], glossary: new Map(), completedLessonIds: new Set<string>(), userId: null }; // Return module even if lessons fail
  }
  const lessons = lessonsData || [];
  console.log(`Fetched ${lessons.length} lessons.`);

  // Fetch content blocks for these lessons, ordered
  const lessonIds = lessons.map(l => l.id);
  const { data: blocksData, error: blocksError } = await supabase
    .from('content_blocks')
    .select('*')
    .in('lesson_id', lessonIds)
    .order('block_order', { ascending: true });

  if (blocksError) console.error("Error fetching content blocks:", blocksError.message);
  const dbContentBlocks = blocksData || [];
  console.log(`Fetched ${dbContentBlocks.length} raw content blocks.`);

  // Group blocks by lesson_id and parse JSON content
  const lessonsWithContent = lessons.map(lesson => {
    console.log(`Processing lesson: ${lesson.title}`); 
    const blocksForLesson = dbContentBlocks
      .filter(block => block.lesson_id === lesson.id)
      .map(dbBlock => {
          console.log(`  Raw content for block ID ${dbBlock.id}:`, typeof dbBlock.content, dbBlock.content); // Log type and value before try/catch
          try {
            const parsedContent = dbBlock.content as AppContentBlock; 
            if (isValidAppContentBlock(parsedContent)) { 
                 // console.log(`  Successfully parsed block ID ${dbBlock.id}, type: ${parsedContent.type}`);
                 return parsedContent; 
            } else {
                 console.warn(`  Invalid content block structure for block ID ${dbBlock.id}:`, { parsedContent });
                 return null;
            }
          } catch (e) {
            console.error(`  Error parsing content block JSON for block ID ${dbBlock.id}:`, e);
            return null;
          }
      })
      .filter((block): block is AppContentBlock => block !== null); // Filter out nulls and assert type
      
    console.log(`  Found ${blocksForLesson.length} valid content blocks for this lesson.`); // Log valid blocks per lesson
    return { ...lesson, contentBlocks: blocksForLesson }; // Combine lesson meta with parsed blocks
  });

  // Fetch glossary
  const { data: glossaryData, error: glossaryError } = await supabase
    .from('glossary')
    .select('term, definition');
  if (glossaryError) console.error("Error fetching glossary:", glossaryError.message);
  const glossaryMap = new Map<string, string>();
  (glossaryData || []).forEach(item => glossaryMap.set(item.term.toLowerCase(), item.definition));

  // Fetch user progress (existing logic, slightly adapted)
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  let completedLessonIds = new Set<string>();
  if (userId) {
    const { data: progressData, error: progressError } = await supabase
      .from('user_lesson_progress')
      .select('lesson_id')
      .eq('user_id', userId)
      .eq('module_id', moduleId);
    if (progressError) {
      console.error('Error fetching lesson progress for module:', progressError.message);
    } else if (progressData) {
      completedLessonIds = new Set(progressData.map(p => p.lesson_id));
    }
  }

  return {
    module: moduleData,
    lessons: lessonsWithContent,
    glossary: glossaryMap,
    completedLessonIds,
    userId
  };
}

// Regenerate static paths (optional, based on DB data)
export async function generateStaticParams() {
    // Use a basic client instance with env variables for build-time data fetching
    // Ensure these environment variables are available during the build process
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Supabase URL or Anon Key missing in environment variables for generateStaticParams.");
        return [];
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    
    const { data, error } = await supabase.from('learning_modules').select('id');
    
    if (error) {
        console.error("Error fetching modules for generateStaticParams:", error.message);
        return [];
    }
    
    return data ? data.map((module) => ({ moduleId: module.id })) : [];
}

// --- RenderContentBlock Component --- 
// Needs glossary passed down or fetched/imported if kept separate
let glossaryRegex: RegExp; // Keep regex generation logic

const RenderContentBlock = ({ block, glossary }: { block: AppContentBlock, glossary: Map<string, string> }) => {
    // Regenerate regex if glossary changes (or generate once outside)
    if (!glossaryRegex || glossaryRegex.source !== `\\b(${Array.from(glossary.keys()).map(term => term.replace(/[.*+?^${}()|[\\]]/g, '\\$&')).join('|')})\\b`) {
        const glossaryTerms = Array.from(glossary.keys());
        const escapedTerms = glossaryTerms.map(term => term.replace(/[.*+?^${}()|[\\]]/g, '\\$&'));
        glossaryRegex = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi');
    }

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
            const lowerCasePart = part?.toLowerCase();
            const isGlossaryTerm = glossary.has(lowerCasePart); // Check against map
            if (isGlossaryTerm) {
              return (
                <Tooltip key={index} text={glossary.get(lowerCasePart)!}>
                  <span className="font-semibold text-blue-600 dark:text-blue-400 cursor-help border-b border-dotted border-blue-600 dark:border-blue-400">
                    {part} {/* Display original casing */}
                  </span>
                </Tooltip>
              );
            } else {
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
    case 'diagram':
      return (
        <figure className="my-4 p-4 border rounded bg-gray-50 dark:bg-gray-800">
          <Image 
            src={block.src} 
            alt={block.alt} 
            width={700}
            height={500} 
            className="rounded shadow-md mx-auto" 
          />
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

// --- Main Page Component --- 
export default async function ModulePage({ params }: { params: { moduleId: string } }) {
  // --- Add Authentication Check ---
  // Check auth BEFORE fetching data specific to the module
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?message=Please login to view this learning module');
  }
  // -----------------------------

  console.log(`Rendering ModulePage for: ${params.moduleId}`); // Log page render start
  const { module, lessons, glossary, completedLessonIds, userId } = await getModuleData(params.moduleId);

  if (!module) {
    console.log(`Module not found, rendering 404.`);
    notFound(); 
  }

  console.log(`Rendering ${lessons.length} lessons.`); // Log number of lessons to render

  return (
    <article className="prose dark:prose-invert max-w-none">
       {/* ... Title, Description (use module.title etc) ... */}
       <h1 className="text-3xl font-bold mb-4 border-b pb-2">{module.title}</h1>
       <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">{module.description}</p>

      {lessons.map((lesson, lessonIndex) => {
        console.log(`Rendering lesson section: ${lesson.title}`); // Log lesson section render
        const isLessonComplete = completedLessonIds.has(lesson.id);
        return (
          <section key={lesson.id} className="mb-8 p-4 border rounded shadow-sm relative">
             {/* ... Completed span ... */}
             {isLessonComplete && (
                <span className="absolute top-2 right-2 text-xs text-green-600 font-semibold">Completed</span>
             )}
             {/* ... Lesson Title, Time ... */}
             <h2 className="text-2xl font-bold mb-4">Lesson {lessonIndex + 1}: {lesson.title}</h2>
             <p className="text-sm text-gray-500 mb-4">Estimated time: {lesson.estimated_time_minutes} minutes</p>

              <div>
                 {/* Pass glossary map to renderer */} 
                {lesson.contentBlocks.length === 0 && <p className="text-sm text-gray-500 italic">[No content blocks found for this lesson]</p>} {/* Add placeholder if no blocks */}
                {lesson.contentBlocks.map((block, blockIndex) => {
                  // console.log(`  Rendering block ${blockIndex}, type: ${block.type}`); // Optional: verbose block rendering log
                  return <RenderContentBlock key={`${lesson.id}-block-${blockIndex}`} block={block} glossary={glossary} />;
                })}
              </div>

              {/* Mark Complete Button (pass DB module.id) */}
              {userId && (
                <MarkCompleteButton 
                  userId={userId} 
                  moduleId={module.id} // Use module.id from DB
                  lessonId={lesson.id} 
                  isInitiallyComplete={isLessonComplete} 
                />
              )}
          </section>
        )
      })}
    </article>
  );
} 