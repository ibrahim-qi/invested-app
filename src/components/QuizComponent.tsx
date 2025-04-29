'use client'

import { useState } from 'react';
import type { QuizQuestion } from '@/types/education.types';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'; // Icons for feedback

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
    setShowResults(true);
    // Reset to first question index to show results from the start
    setCurrentQuestionIndex(0); 
  };

  const calculateScore = () => {
    let correctCount = 0;
    questions.forEach((q) => {
      if (selectedAnswers[q.id] === q.correctAnswerIndex) {
        correctCount++;
      }
    });
    return correctCount;
  };

  const handleRetake = () => {
    setSelectedAnswers({});
    setShowResults(false);
    setCurrentQuestionIndex(0);
  };

  if (showResults) {
    const score = calculateScore();
    return (
      <div className="p-4 border rounded shadow-sm bg-gray-50 dark:bg-gray-700 my-6">
        <h3 className="text-xl font-bold mb-4 text-center">Quiz Results</h3>
        <p className="text-lg text-center mb-6">You scored {score} out of {questions.length}</p>

        {/* Display detailed feedback for each question */}
        <div className="space-y-6">
          {questions.map((q, index) => {
            const userAnswerIndex = selectedAnswers[q.id];
            const isCorrect = userAnswerIndex === q.correctAnswerIndex;

            return (
              <div key={q.id} className="p-3 border-l-4 rounded bg-white dark:bg-gray-800 ${isCorrect ? 'border-green-500' : 'border-red-500'}">
                <p className="font-semibold mb-2">({index + 1}) {q.questionText}</p>
                <div className="space-y-2">
                  {q.options.map((option, optIndex) => {
                    const isSelected = userAnswerIndex === optIndex;
                    const isCorrectAnswer = q.correctAnswerIndex === optIndex;
                    let feedbackIcon = null;
                    let labelClasses = "flex items-center p-2 border rounded";

                    if (isSelected && isCorrectAnswer) {
                      feedbackIcon = <CheckCircleIcon className="h-5 w-5 text-green-500 ml-auto" />;
                      labelClasses += " border-green-400 bg-green-50 dark:bg-green-900/30";
                    } else if (isSelected && !isCorrectAnswer) {
                      feedbackIcon = <XCircleIcon className="h-5 w-5 text-red-500 ml-auto" />;
                      labelClasses += " border-red-400 bg-red-50 dark:bg-red-900/30";
                    } else if (isCorrectAnswer) {
                      // Highlight correct answer if user chose wrong or skipped
                       labelClasses += " border-green-400";
                       feedbackIcon = <span className="ml-auto text-xs font-medium text-green-600">(Correct Answer)</span>;
                    } else {
                      labelClasses += " border-gray-200 dark:border-gray-600";
                    }

                    return (
                      <div key={optIndex} className={labelClasses}>
                         <span className={`mr-2 ${isSelected ? 'font-bold' : ''}`}>{option}</span>
                         {feedbackIcon}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <button 
          onClick={handleRetake}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded"
        >
          Retake Quiz
        </button>
      </div>
    );
  }

  if (questions.length === 0) return null; // Handle empty quiz case
  const currentQuestion = questions[currentQuestionIndex];

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