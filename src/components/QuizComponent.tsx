'use client'

import { useState } from 'react';
import type { QuizQuestion } from '@/types/education.types';

interface QuizComponentProps {
  questions: QuizQuestion[];
}

const QuizComponent = ({ questions }: QuizComponentProps) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [showResults, setShowResults] = useState(false);

  const handleAnswerSelect = (questionId: string, answerIndex: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: answerIndex,
    }));
  };

  const handleSubmit = () => {
    // Logic to check answers and show results
    setShowResults(true);
    // In a real app, we might want to prevent changing answers after submit
    // and potentially save the score/progress.
  };

  // Basic scoring logic
  const calculateScore = () => {
    let correctCount = 0;
    questions.forEach((q) => {
      if (selectedAnswers[q.id] === q.correctAnswerIndex) {
        correctCount++;
      }
    });
    return correctCount;
  };

  const score = calculateScore();
  const currentQuestion = questions[currentQuestionIndex];

  if (showResults) {
    return (
      <div className="p-4 border rounded shadow-sm bg-gray-50 dark:bg-gray-700 my-6">
        <h3 className="text-xl font-bold mb-4 text-center">Quiz Results</h3>
        <p className="text-lg text-center mb-4">You scored {score} out of {questions.length}</p>
        {/* Optional: Display detailed results per question */} 
        <button 
          onClick={() => { setShowResults(false); setSelectedAnswers({}); /* Reset state */ }}
          className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded"
        >
          Retake Quiz
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded shadow-sm bg-gray-50 dark:bg-gray-700 my-6">
      <h3 className="text-xl font-bold mb-4">Knowledge Check</h3>
      <div className="mb-4">
        <p className="font-semibold mb-2">({currentQuestionIndex + 1}/{questions.length}) {currentQuestion.questionText}</p>
        <div className="space-y-2">
          {currentQuestion.options.map((option, index) => (
            <label key={index} className="flex items-center p-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
              <input
                type="radio"
                name={currentQuestion.id}
                value={index}
                checked={selectedAnswers[currentQuestion.id] === index}
                onChange={() => handleAnswerSelect(currentQuestion.id, index)}
                className="mr-2"
              />
              {option}
            </label>
          ))}
        </div>
      </div>
      
      {/* Simple Navigation - Replace with better UI later */}
      <div className="flex justify-between mt-4">
        <button 
          onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
          disabled={currentQuestionIndex === 0}
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 py-1 px-3 rounded disabled:opacity-50"
        >
          Previous
        </button>

        {currentQuestionIndex === questions.length - 1 ? (
           <button 
            onClick={handleSubmit}
            disabled={selectedAnswers[currentQuestion.id] === undefined} // Disable if no answer selected
            className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit Quiz
          </button>
        ) : (
          <button 
            onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
            disabled={currentQuestionIndex === questions.length - 1}
            className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded disabled:opacity-50"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
};

export default QuizComponent; 