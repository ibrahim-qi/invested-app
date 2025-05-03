'use client';

import React, { useState, useEffect } from 'react';

// Re-define QuestionData here or import from a shared types file
interface QuestionData {
  id?: string;
  questionType?: 'single-select' | 'multiple-select';
  questionText: string;
  options: string[];
  correctAnswerIndex: number | number[];
}

interface QuizBlockProps {
  questions: QuestionData[];
  onQuizComplete: (score: number, totalQuestions: number) => void;
}

// Helper function to check if two arrays contain the same numbers, regardless of order
const arraysContainSameNumbers = (arr1: number[], arr2: number[]): boolean => {
  if (arr1.length !== arr2.length) return false;
  const sortedArr1 = [...arr1].sort();
  const sortedArr2 = [...arr2].sort();
  return sortedArr1.every((value, index) => value === sortedArr2[index]);
};

const QuizBlock: React.FC<QuizBlockProps> = ({ questions, onQuizComplete }) => {
  // State to hold user's answers. Key is question index.
  // Value is the selected option index (number) or indices (Set<number>).
  const [userAnswers, setUserAnswers] = useState<Record<number, number | Set<number>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  // Reset state if questions change (e.g., on re-render with different concept)
  useEffect(() => {
    setUserAnswers({});
    setSubmitted(false);
    setScore(null);
  }, [questions]);

  const handleOptionChange = (questionIndex: number, optionIndex: number) => {
    const question = questions[questionIndex];
    const questionType = question.questionType || 'single-select'; // Default to single-select

    setUserAnswers(prevAnswers => {
        const newAnswers = { ...prevAnswers };
        if (questionType === 'multiple-select') {
            // Ensure we are working with a Set
            const currentSet = newAnswers[questionIndex] instanceof Set 
                               ? newAnswers[questionIndex] as Set<number> 
                               : new Set<number>(); 
            const newSet = new Set(currentSet); // Clone the set to ensure state update
            
            if (newSet.has(optionIndex)) {
                newSet.delete(optionIndex);
            } else {
                newSet.add(optionIndex);
            }
            newAnswers[questionIndex] = newSet; // Assign the new Set
        } else { // single-select
            newAnswers[questionIndex] = optionIndex;
        }
        return newAnswers;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let currentScore = 0;
    questions.forEach((question, index) => {
      const userAnswer = userAnswers[index];
      const questionType = question.questionType || 'single-select';

      if (questionType === 'multiple-select') {
        const correctIndices = Array.isArray(question.correctAnswerIndex) ? question.correctAnswerIndex : [];
        const selectedIndices = userAnswer instanceof Set ? Array.from(userAnswer) : [];
        if (arraysContainSameNumbers(selectedIndices, correctIndices)) {
            currentScore++;
        }
      } else { // single-select
        const correctIndex = typeof question.correctAnswerIndex === 'number' ? question.correctAnswerIndex : -1;
        if (userAnswer === correctIndex) {
            currentScore++;
        }
      }
    });
    setScore(currentScore);
    setSubmitted(true);
    onQuizComplete(currentScore, questions.length); // Call the callback prop
  };

  const handleReset = () => {
    setUserAnswers({});
    setSubmitted(false);
    setScore(null);
  };

  // Determine if all questions have been answered
  const allAnswered = Object.keys(userAnswers).length === questions.length && 
                      Object.values(userAnswers).every(answer => 
                        (typeof answer === 'number' && answer !== undefined) || 
                        (answer instanceof Set && answer.size > 0)
                      );

  return (
    <div className="mt-6 p-5 border border-indigo-200 rounded-lg bg-indigo-50 shadow-sm">
      <h3 className="text-lg font-semibold text-indigo-800 mb-4">Test Your Knowledge</h3>
      <form onSubmit={handleSubmit}>
        {questions.map((question, qIndex) => {
            const questionType = question.questionType || 'single-select';
            const isMultipleSelect = questionType === 'multiple-select';
            const correctAnswer = question.correctAnswerIndex; // Can be number or array
            const userAnswer = userAnswers[qIndex]; // Can be number or Set

            return (
              <div key={question.id || qIndex} className="mb-6 pb-4 border-b border-indigo-100 last:border-b-0 last:mb-0">
                <p className="font-medium text-gray-800 mb-3">{qIndex + 1}. {question.questionText}</p>
                <div className="space-y-2">
                  {question.options.map((option, oIndex) => {
                    let isChecked: boolean;
                    if (isMultipleSelect) {
                        isChecked = userAnswer instanceof Set ? userAnswer.has(oIndex) : false;
                    } else {
                        isChecked = userAnswer === oIndex;
                    }
                    
                    // Determine styling after submission
                    let labelClassName = "text-gray-700";
                    let highlightClassName = "";
                    if (submitted) {
                        const isCorrectOption = isMultipleSelect
                          ? Array.isArray(correctAnswer) && correctAnswer.includes(oIndex)
                          : correctAnswer === oIndex;
                          
                        if (isCorrectOption) {
                            highlightClassName = "bg-green-100 border-green-300 ring-1 ring-green-400"; 
                            labelClassName = "text-green-800 font-semibold";
                        } else if (isChecked) { // Incorrectly selected
                            highlightClassName = "bg-red-100 border-red-300 ring-1 ring-red-400"; 
                            labelClassName = "text-red-800";
                        }
                    }

                    return (
                      <label 
                        key={oIndex} 
                        className={`flex items-center p-3 border rounded-md cursor-pointer hover:bg-gray-100 transition-colors ${highlightClassName} ${submitted ? 'cursor-default' : ''}`}
                      >
                        <input
                          type={isMultipleSelect ? "checkbox" : "radio"}
                          name={isMultipleSelect ? `question-${qIndex}-option-${oIndex}` : `question-${qIndex}`}
                          checked={isChecked}
                          onChange={(e) => handleOptionChange(qIndex, oIndex)}
                          className={`mr-3 ${isMultipleSelect ? 'rounded' : 'rounded-full'} border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50`}
                        />
                        <span className={labelClassName}>{option}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
        })}

        {!submitted ? (
          <button 
            type="submit" 
            disabled={!allAnswered} 
            className="mt-4 px-5 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit Answers
          </button>
        ) : (
          <div className="mt-6 p-4 border border-gray-200 rounded-md bg-white">
            <p className="text-lg font-semibold text-center text-gray-800">
              Quiz Complete! Your Score: {score}/{questions.length}
            </p>
            <button 
              type="button"
              onClick={handleReset}
              className="mt-4 w-full px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Try Again
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default QuizBlock;