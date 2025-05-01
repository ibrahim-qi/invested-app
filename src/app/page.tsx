import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-grow flex-col items-center justify-center p-12 text-center">
      <div className="max-w-2xl py-16 sm:py-24">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl mb-6">
          Welcome to InvestEd
        </h1>
        <p className="text-lg leading-8 text-gray-600 mb-10">
          Your personal guide to understanding investment principles. Learn core concepts and apply them in realistic simulations designed specifically for postgraduate students navigating their early financial journey.
        </p>
        <div className="flex items-center justify-center gap-x-6">
          <Link
            href="/learn"
            className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Start Learning
          </Link>
          <Link 
            href="/simulation" 
            className="rounded-md bg-green-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
          >
            Run a Simulation
          </Link>
        </div>
      </div>
    </main>
  );
}
