import Link from 'next/link';
import { learningModulesData } from '@/lib/learningModulesData';

export default function LearnPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Learning Modules</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {learningModulesData.map((module) => (
          <Link key={module.id} href={`/learn/${module.id}`} legacyBehavior>
            <a className="block p-6 bg-white rounded-lg border border-gray-200 shadow-md hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
              <h2 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                {module.title}
              </h2>
              <p className="font-normal text-gray-700 dark:text-gray-400">
                {module.description}
              </p>
              {/* Optional: Add estimated time or number of lessons later */}
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
} 