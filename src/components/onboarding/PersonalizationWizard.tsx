'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'; // For redirecting after completion

// Define the structure for the form data
interface OnboardingFormData {
    financial_knowledge_level: string;
    selected_goals: string[];
    risk_tolerance_profile: string;
    career_stage: string;
    location_region: string;
}

// Define available goals
const AVAILABLE_GOALS = [
    { id: 'retirement', label: 'Plan for Retirement' },
    { id: 'home_ownership', label: 'Save for a Home' },
    { id: 'debt_management', label: 'Manage Debt' },
    { id: 'build_wealth', label: 'General Wealth Building' },
    { id: 'education', label: 'Save for Education' },
];

// Define knowledge questions
const KNOWLEDGE_QUESTIONS = [
    {
        id: 'q1',
        text: 'If you invest £1000 and earn 10% annual interest (compounded annually), how much will you have after 2 years?',
        options: [
            { id: 'a', text: '£1100' },
            { id: 'b', text: '£1200' },
            { id: 'c', text: '£1210' }, // Correct
            { id: 'd', text: '£2000' },
        ],
        correctOptionId: 'c',
    },
    {
        id: 'q2',
        text: 'Generally, investments with higher potential returns also come with:',
        options: [
            { id: 'a', text: 'Lower risk' },
            { id: 'b', text: 'Higher risk' }, // Correct
            { id: 'c', text: 'Guaranteed returns' },
            { id: 'd', text: 'No risk' },
        ],
        correctOptionId: 'b',
    },
    {
        id: 'q3',
        text: 'Spreading your investments across different asset types (like stocks and bonds) is primarily intended to:',
        options: [
            { id: 'a', text: 'Maximize short-term gains' },
            { id: 'b', text: 'Eliminate all investment risk' },
            { id: 'c', text: 'Reduce overall portfolio risk' }, // Correct
            { id: 'd', text: 'Simplify tax reporting' },
        ],
        correctOptionId: 'c',
    },
];

// --- Define Risk Questions --- 
const RISK_QUESTIONS = [
    {
        id: 'rq1',
        text: 'Imagine the value of your investments suddenly drops by 20%. How would you likely react?',
        options: [
            { id: 'a', text: 'Sell some or all to cut losses.', points: 1 }, 
            { id: 'b', text: 'Hold on and wait for recovery.', points: 3 },
            { id: 'c', text: 'Consider investing more while prices are low.', points: 5 },
        ],
    },
    {
        id: 'rq2',
        text: 'Which investment outcome would you prefer?',
        options: [
            { id: 'a', text: 'Lower average return with minimal chance of loss.', points: 1 },
            { id: 'b', text: 'Moderate average return with some chance of moderate loss.', points: 3 },
            { id: 'c', text: 'Higher average return with a chance of significant loss.', points: 5 },
        ],
    },
    {
        id: 'rq3',
        text: 'How comfortable are you with making investment decisions that could potentially lose money in the short term for higher long-term gains?',
        options: [
            { id: 'a', text: 'Very uncomfortable.', points: 1 },
            { id: 'b', text: 'Somewhat uncomfortable.', points: 2 },
            { id: 'c', text: 'Neutral.', points: 3 },
            { id: 'd', text: 'Somewhat comfortable.', points: 4 },
            { id: 'e', text: 'Very comfortable.', points: 5 },
        ],
    },
];
// -----------------------------

const STEPS = [
    { id: 'knowledge', title: 'Financial Knowledge' },
    { id: 'goals', title: 'Your Goals' },
    { id: 'risk', title: 'Risk Comfort' },
    { id: 'details', title: 'About You' },
    { id: 'review', title: 'Review' }, // Optional review step
];

export default function PersonalizationWizard() {
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState<Partial<OnboardingFormData>>({ selected_goals: [] });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    // State for knowledge quiz answers
    const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
    const [quizCompleted, setQuizCompleted] = useState(false); // Track if quiz is done
    // --- State for Risk Answers --- 
    const [riskAnswers, setRiskAnswers] = useState<Record<string, string>>({});
    const [riskProfileCalculated, setRiskProfileCalculated] = useState(false);
    // -------------------------------

    const handleNext = () => {
        const currentStepId = STEPS[currentStep].id;
        // Validation for knowledge step
        if (currentStepId === 'knowledge' && !quizCompleted) {
             alert('Please complete the knowledge assessment first.');
             return;
        }
        // Validation for goals step
        if (currentStepId === 'goals' && (!formData.selected_goals || formData.selected_goals.length === 0)) {
            alert('Please select at least one goal.');
            return;
        }
        // --- Validation for Risk Step ---
        if (currentStepId === 'risk' && !riskProfileCalculated) {
            alert('Please complete the risk assessment first.');
            return;
        }
        // --- Validation for Details Step ---
        if (currentStepId === 'details' && (!formData.career_stage || !formData.location_region)) {
            alert('Please select your career stage and region.');
            return;
        }
        // -----------------------------------

        if (currentStep < STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    // --- Handler for Quiz Answers ---
    const handleQuizAnswerChange = (questionId: string, optionId: string) => {
        setQuizAnswers(prev => ({ ...prev, [questionId]: optionId }));
    };

    // --- Function to Calculate Score and Set Level ---
    const finalizeKnowledgeAssessment = () => {
        if (Object.keys(quizAnswers).length !== KNOWLEDGE_QUESTIONS.length) {
            alert('Please answer all knowledge questions.');
            return;
        }

        let score = 0;
        KNOWLEDGE_QUESTIONS.forEach(q => {
            if (quizAnswers[q.id] === q.correctOptionId) {
                score++;
            }
        });

        let level = 'beginner';
        if (score === KNOWLEDGE_QUESTIONS.length) {
            level = 'advanced';
        } else if (score > 0) {
            level = 'intermediate';
        }

        handleChange('financial_knowledge_level', level); 
        setQuizCompleted(true);
        console.log(`Quiz completed. Score: ${score}, Level: ${level}`);
        // Optionally, show feedback to the user here
        alert(`Assessment complete! Your initial level is set to: ${level}`);
    };

    // --- Handler for Risk Answers ---
    const handleRiskAnswerChange = (questionId: string, optionId: string) => {
        setRiskAnswers(prev => ({ ...prev, [questionId]: optionId }));
    };
    // -------------------------------

    // --- Function to Calculate Risk Profile ---
    const finalizeRiskAssessment = () => {
        if (Object.keys(riskAnswers).length !== RISK_QUESTIONS.length) {
            alert('Please answer all risk questions.');
            return;
        }

        let totalPoints = 0;
        RISK_QUESTIONS.forEach(q => {
            const selectedOption = q.options.find(opt => opt.id === riskAnswers[q.id]);
            if (selectedOption) {
                totalPoints += selectedOption.points;
            }
        });

        // Example scoring thresholds (adjust as needed)
        let profile = 'moderate'; // Default
        const maxPoints = RISK_QUESTIONS.reduce((sum, q) => sum + Math.max(...q.options.map(o => o.points)), 0);
        const minPoints = RISK_QUESTIONS.reduce((sum, q) => sum + Math.min(...q.options.map(o => o.points)), 0);

        if (totalPoints <= minPoints + Math.floor((maxPoints - minPoints) / 3)) {
            profile = 'conservative';
        } else if (totalPoints >= maxPoints - Math.floor((maxPoints - minPoints) / 3)) {
            profile = 'aggressive';
        } // Otherwise it stays moderate

        handleChange('risk_tolerance_profile', profile);
        setRiskProfileCalculated(true);
        console.log(`Risk assessment complete. Score: ${totalPoints}, Profile: ${profile}`);
        alert(`Risk assessment complete! Your profile is assessed as: ${profile}`);
    };
    // ------------------------------------------

    // --- Specific handler for goal checkboxes ---
    const handleGoalChange = (goalId: string, checked: boolean) => {
        setFormData(prev => {
            const currentGoals = prev.selected_goals || [];
            let updatedGoals: string[];
            if (checked) {
                updatedGoals = [...currentGoals, goalId];
            } else {
                updatedGoals = currentGoals.filter(id => id !== goalId);
            }
            return { ...prev, selected_goals: updatedGoals };
        });
    };

    // --- General handler for other input types ---
    // Updated to exclude quiz answers handled separately
    const handleChange = (field: keyof Omit<OnboardingFormData, 'selected_goals'>, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async () => {
        if (currentStep !== STEPS.length - 1) return; // Only submit on the last step

        setIsLoading(true);
        setError(null);

        try {
            // Add check for risk profile determination
            if (!formData.financial_knowledge_level || !formData.risk_tolerance_profile) {
                throw new Error("Onboarding steps not fully completed. Please review.");
            }
            
            const response = await fetch('/api/users/me/onboard', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    selected_goals: formData.selected_goals || [],
                } as OnboardingFormData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to save onboarding data');
            }

            console.log('Onboarding successful:', result);
            // Refresh router state before pushing
            router.refresh(); 
            // Redirect to the dashboard or a success page
            router.push('/dashboard'); // Adjust target route as needed

        } catch (err: any) {
            console.error('Onboarding error:', err);
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    const renderStepContent = () => {
        const stepId = STEPS[currentStep].id;
        switch (stepId) {
            case 'knowledge':
                return (
                    <div>
                        <h2 className="text-xl font-semibold mb-4">Financial Knowledge Check</h2>
                        <p className="text-sm text-gray-600 mb-6">Let's quickly gauge your current understanding.</p>
                        <div className="space-y-6">
                            {KNOWLEDGE_QUESTIONS.map((q, index) => (
                                <fieldset key={q.id} className="border-t border-gray-200 pt-4">
                                    <legend className="text-base font-medium text-gray-900 mb-2">Question {index + 1}: {q.text}</legend>
                                    <div className="space-y-2">
                                        {q.options.map(opt => (
                                            <label key={opt.id} className="flex items-center text-sm text-gray-700">
                                                <input
                                                    type="radio"
                                                    name={q.id} // Group radios by question
                                                    value={opt.id}
                                                    checked={quizAnswers[q.id] === opt.id}
                                                    onChange={() => handleQuizAnswerChange(q.id, opt.id)}
                                                    className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 mr-2"
                                                    disabled={quizCompleted} // Disable after finalizing
                                                />
                                                {opt.text}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            ))}
                        </div>
                        {!quizCompleted ? (
                             <button 
                                onClick={finalizeKnowledgeAssessment}
                                className="mt-6 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                Check Answers & Set Level
                            </button>
                        ) : (
                            <p className="mt-6 p-3 bg-green-100 text-green-800 border border-green-200 rounded-md text-sm font-medium">
                                Assessment Complete! Your level is set to: {formData.financial_knowledge_level || 'N/A'}. Proceed to the next step.
                            </p>
                        )}
                    </div>
                );
            case 'goals':
                return (
                    <div>
                        <h2 className="text-xl font-semibold mb-4">What are your main financial goals?</h2>
                        <p className="text-sm text-gray-600 mb-6">Select all that apply. This helps us tailor suggestions for you.</p>
                        <div className="space-y-3">
                            {AVAILABLE_GOALS.map(goal => (
                                <label key={goal.id} className="flex items-center p-3 border rounded-md hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-3"
                                        checked={formData.selected_goals?.includes(goal.id) || false}
                                        onChange={(e) => handleGoalChange(goal.id, e.target.checked)}
                                    />
                                    <span className="text-gray-800">{goal.label}</span>
                                </label>
                            ))}
                        </div>
                        {/* Add validation message area if needed */}
                    </div>
                );
            case 'risk':
                return (
                    <div>
                        <h2 className="text-xl font-semibold mb-4">Understanding Your Risk Comfort</h2>
                        <p className="text-sm text-gray-600 mb-6">These questions help us suggest investment approaches aligned with your comfort level.</p>
                        <div className="space-y-6">
                            {RISK_QUESTIONS.map((q, index) => (
                                <fieldset key={q.id} className="border-t border-gray-200 pt-4">
                                    <legend className="text-base font-medium text-gray-900 mb-2">Question {index + 1}: {q.text}</legend>
                                    <div className="space-y-2">
                                        {q.options.map(opt => (
                                            <label key={opt.id} className="flex items-center text-sm text-gray-700">
                                                <input
                                                    type="radio"
                                                    name={q.id}
                                                    value={opt.id}
                                                    checked={riskAnswers[q.id] === opt.id}
                                                    onChange={() => handleRiskAnswerChange(q.id, opt.id)}
                                                    className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 mr-2"
                                                    disabled={riskProfileCalculated} // Disable after finalizing
                                                />
                                                {opt.text}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            ))}
                        </div>
                        {!riskProfileCalculated ? (
                             <button 
                                onClick={finalizeRiskAssessment}
                                className="mt-6 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                Calculate Risk Profile
                            </button>
                        ) : (
                            <p className="mt-6 p-3 bg-green-100 text-green-800 border border-green-200 rounded-md text-sm font-medium">
                                Assessment Complete! Your risk profile is assessed as: {formData.risk_tolerance_profile || 'N/A'}. Proceed to the next step.
                            </p>
                        )}
                    </div>
                );
            case 'details':
                return (
                    <div className="space-y-6">
                        <h2 className="text-xl font-semibold mb-4">About You</h2>
                        <p className="text-sm text-gray-600 mb-6">A little more context helps personalize your experience.</p>
                        
                        {/* Career Stage Input */}
                        <div>
                             <label htmlFor="career_stage" className="block text-sm font-medium text-gray-700 mb-1">Current Career Stage:</label>
                             <select
                                id="career_stage"
                                name="career_stage"
                                value={formData.career_stage || ''}
                                onChange={(e) => handleChange('career_stage', e.target.value)}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                            >
                                <option value="" disabled>Select your stage...</option>
                                <option value="student">Student</option>
                                <option value="early-career">Early Career (First ~5 years)</option>
                                <option value="mid-career">Mid Career</option>
                                <option value="late-career">Late Career (Approaching retirement)</option>
                                <option value="retired">Retired</option> {/* Added retired */}
                                <option value="other">Other / Prefer not to say</option>
                             </select>
                         </div>
                         
                         {/* Location Region Input */}
                         <div>
                             <label htmlFor="location_region" className="block text-sm font-medium text-gray-700 mb-1">Your Region:</label>
                             <p className="text-xs text-gray-500 mb-2">This helps us consider regional factors if applicable (optional).</p>
                             <select
                                id="location_region"
                                name="location_region"
                                value={formData.location_region || ''}
                                onChange={(e) => handleChange('location_region', e.target.value)}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                             >
                                 <option value="" disabled>Select your region...</option>
                                <option value="uk">United Kingdom</option>
                                <option value="us">United States</option>
                                <option value="eu">European Union</option>
                                <option value="ca">Canada</option> {/* Added Canada */}
                                <option value="au">Australia</option> {/* Added Australia */}
                                <option value="asia">Asia</option> {/* Broadened */}
                                <option value="other">Other / Prefer not to say</option>
                             </select>
                         </div>
                    </div>
                );
            case 'review':
                return (
                    <div>
                        <h2>Review Your Answers</h2>
                        <pre>{JSON.stringify(formData, null, 2)}</pre>
                        {/* TODO: Display collected data nicely */}
                        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8">
             <h1 className="text-2xl font-bold text-gray-900 mb-2">Personalization ({STEPS[currentStep].title})</h1>
             <p className="text-sm text-gray-500 mb-6">Step {currentStep + 1} of {STEPS.length}</p>
             <progress value={currentStep + 1} max={STEPS.length} className="w-full h-2 [&::-webkit-progress-bar]:rounded-lg [&::-webkit-progress-value]:rounded-lg   [&::-webkit-progress-bar]:bg-slate-300 [&::-webkit-progress-value]:bg-violet-400 [&::-moz-progress-bar]:bg-violet-400"></progress>

            <div className="my-8 min-h-[250px]"> {/* Added min-height */} 
                {renderStepContent()}
            </div>

            {/* Navigation Buttons */} 
            <div className="flex justify-between items-center mt-8 pt-4 border-t border-gray-200">
                <button 
                    onClick={handleBack} 
                    disabled={currentStep === 0 || isLoading}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Back
                </button>
                {currentStep < STEPS.length - 1 ? (
                    <button 
                        onClick={handleNext} 
                        disabled={isLoading || (STEPS[currentStep].id === 'knowledge' && !quizCompleted) || (STEPS[currentStep].id === 'risk' && !riskProfileCalculated) || (STEPS[currentStep].id === 'details' && (!formData.career_stage || !formData.location_region))} // Disable Next if quiz, risk, OR details incomplete
                        className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Next
                    </button>
                ) : (
                    <button 
                        onClick={handleSubmit} 
                        disabled={isLoading}
                        className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Saving...' : 'Finish Onboarding'}
                    </button>
                )}
            </div>
            {error && <p className="mt-4 text-center text-sm text-red-600">Error: {error}</p>} 
        </div>
    );
} 