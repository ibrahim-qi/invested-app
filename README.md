# InvestEd - Investment Education Simulator

InvestEd is a web-based educational platform designed to help postgraduate students learn fundamental investment principles through interactive content and a risk-free portfolio simulation. It aims to bridge the gap between theoretical knowledge and practical application in personal finance.

## Technologies Used

*   **Frontend:** Next.js (v14+), React (v18+), TypeScript
*   **Backend:** Supabase (PostgreSQL Database, Auth, Serverless Functions implicitly via Client/Server Actions)
*   **Styling:** Tailwind CSS
*   **Charting:** Recharts
*   **State Management:** React Hooks (useState, useEffect, useMemo, useContext)
*   **Linting/Formatting:** ESLint, Prettier

## Prerequisites

*   Node.js (v18.x or later recommended)
*   npm (v9.x or later) or yarn (v1.22 or later)
*   Git
*   A Supabase account and project ([supabase.com](https://supabase.com/))

## Getting Started

Follow these steps to set up and run the project locally:

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd invested-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Set up Environment Variables:**
    *   Create a new file named `.env.local` in the root of the `invested-app` directory.
    *   Add your Supabase project URL and Anon Key to this file. You can find these in your Supabase project settings (Project Settings > API).
    *   **Important:** Add `.env.local` to your `.gitignore` file if it's not already there to avoid committing your keys.

    ```plaintext
    # .env.local

    NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
    ```
    Replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with your actual Supabase credentials.

4.  **Supabase Database Setup:**
    *   Ensure your Supabase project's database has the required tables and RLS policies. Key tables include:
        *   `concepts`
        *   `user_profiles`
        *   `user_concept_progress`
        *   `saved_simulations`
        *   `scenarios`
        *   `simulation_events`
    *   You may need to run the SQL scripts (generated earlier or defined elsewhere) in the Supabase SQL Editor to create these tables and policies if starting with a fresh project. Refer to the project's ERD (Section 5.4 of the report) for schema details.

## Running the Development Server

Once the setup is complete, you can run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Linting and Formatting

To check code quality:

```bash
npm run lint
```

*(You can add other relevant commands here if needed, e.g., for building for production)*

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
