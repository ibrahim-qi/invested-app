export interface QuizQuestion {
  id: string;
  questionText: string;
  options: string[];
  correctAnswerIndex: number;
}

export type ContentBlock =
  | { type: 'text'; content: string }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; content: string }
  | { type: 'image'; src: string; alt: string; caption?: string }
  | { type: 'video'; src: string; caption?: string }
  | { type: 'diagram'; src: string; alt: string; caption?: string }
  | { type: 'quiz'; questions: QuizQuestion[] };

export interface Lesson {
  id: string;
  title: string;
  estimatedTimeMinutes: number;
  contentBlocks: ContentBlock[];
}

export interface LearningModule {
  id: string; // e.g., 'compound-interest', 'diversification'
  title: string;
  description: string;
  lessons: Lesson[];
  // Maybe add prerequisites, learning objectives later
} 