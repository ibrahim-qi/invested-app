import type { LearningModule } from '@/types/education.types';

export const learningModulesData: LearningModule[] = [
  {
    id: 'introduction-to-investing',
    title: 'Introduction to Investing',
    description: 'Understand the basics of why investing is important and key concepts.',
    lessons: [
      {
        id: 'intro-lesson-1',
        title: 'Why Invest?',
        estimatedTimeMinutes: 5,
        contentBlocks: [
          { type: 'heading', level: 2, content: 'The Power of Compound Growth' },
          { type: 'text', content: 'Investing allows your money to grow over time through compounding. This means your returns start earning their own returns. Start early, even with small amounts!' },
          { type: 'text', content: 'Saving money is good, but inflation can erode its value over time. Investing aims to outpace inflation and build real wealth.' },
          { type: 'image', src: '/images/placeholder-compound.png', alt: 'Chart showing compound growth vs simple interest' },
          {
            type: 'quiz',
            questions: [
              {
                id: 'q1',
                questionText: 'What is the main benefit of compounding?',
                options: [
                  'Guaranteed high returns',
                  'Earning returns on your returns',
                  'Avoiding all investment risk',
                  'Getting rich quick'
                ],
                correctAnswerIndex: 1
              },
              {
                id: 'q2',
                questionText: 'Why is investing often preferred over just saving money in a bank account?',
                options: [
                  'Investing is always safer',
                  'Banks don\'t offer interest',
                  'Investing aims to beat inflation',
                  'Investing requires less money'
                ],
                correctAnswerIndex: 2
              }
            ]
          }
        ]
      },
      {
        id: 'intro-lesson-2',
        title: 'Risk and Return',
        estimatedTimeMinutes: 7,
        contentBlocks: [
          { type: 'heading', level: 2, content: 'The Fundamental Trade-off' },
          { type: 'text', content: 'Generally, investments with the potential for higher returns also come with higher risk. Understanding your risk tolerance is crucial.' },
          { type: 'text', content: 'Risk isn\'t just about losing money, but also about the volatility (ups and downs) of an investment\'s value.' },
        ]
      },
    ]
  },
  {
    id: 'understanding-stocks',
    title: 'Understanding Stocks',
    description: 'Learn what stocks are and how they fit into an investment strategy.',
    lessons: [
      {
        id: 'stocks-lesson-1',
        title: 'What is a Stock?',
        estimatedTimeMinutes: 6,
        contentBlocks: [
          { type: 'heading', level: 2, content: 'Ownership in a Company' },
          { type: 'text', content: 'Buying a stock means buying a small piece of ownership (equity) in a publicly traded company.' },
          { type: 'text', content: 'As an owner, you may benefit from the company\'s growth through stock price appreciation and potentially dividends.' },
        ]
      }
    ]
  }
  // Add more modules later (e.g., Diversification, Bonds, etc.)
]; 