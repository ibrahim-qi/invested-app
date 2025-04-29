'use client'

import Link from 'next/link';

const Header = () => {
  return (
    <header className="bg-gray-800 text-white p-4">
      <div className="container mx-auto">
        <Link href="/" className="text-xl font-bold">
          InvestEd
        </Link>
        {/* Navigation links will go here later */}
      </div>
    </header>
  );
};

export default Header; 