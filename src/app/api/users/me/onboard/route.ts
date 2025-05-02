import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types'; // Assuming you have this types file

// Define the expected structure of the onboarding data in the request body
interface OnboardingData {
    financial_knowledge_level: string;
    selected_goals: string[];
    risk_tolerance_profile: string;
    career_stage: string;
    location_region: string;
}

export async function POST(request: NextRequest) {
    const cookieStore = cookies();
    // Use createRouteHandlerClient specific for Route Handlers
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    try {
        // 1. Get authenticated user
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
            console.error('Error fetching user session:', sessionError);
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        const user = session.user;

        // 2. Parse request body
        let onboardingData: OnboardingData;
        try {
            onboardingData = await request.json();
        } catch (parseError) {
            console.error('Error parsing request body:', parseError);
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        // 3. Basic Validation (Add more robust validation as needed)
        if (!onboardingData.financial_knowledge_level || !onboardingData.selected_goals || !onboardingData.risk_tolerance_profile || !onboardingData.career_stage || !onboardingData.location_region) {
             return NextResponse.json({ error: 'Missing required onboarding fields' }, { status: 400 });
        }

        // 4. Update user profile in the database
        const { data: updatedProfile, error: updateError } = await supabase
            .from('user_profiles')
            .update({
                financial_knowledge_level: onboardingData.financial_knowledge_level,
                selected_goals: onboardingData.selected_goals,
                risk_tolerance_profile: onboardingData.risk_tolerance_profile,
                career_stage: onboardingData.career_stage,
                location_region: onboardingData.location_region,
                onboarding_complete: true, // Mark onboarding as complete
                updated_at: new Date().toISOString(), // Update the timestamp
            })
            .eq('user_id', user.id) // Use user.id from the session
            .select() // Select the updated row to return it
            .single(); // Expect only one row to be updated

        if (updateError) {
            console.error('Error updating user profile:', updateError);
            // Check if the error is because the profile doesn't exist (PGRST116: 0 rows)
            if (updateError.code === 'PGRST116') {
                 return NextResponse.json({ error: 'User profile not found. Ensure profile exists for the user.' }, { status: 404 });
            }
            return NextResponse.json({ error: 'Failed to update profile', details: updateError.message }, { status: 500 });
        }

        if (!updatedProfile) {
             // This case might happen if the update succeeds but returns no data for some reason
             console.warn('Profile update succeeded but returned no data for user:', user.id);
             return NextResponse.json({ message: 'Onboarding data saved successfully, but no profile data returned.' }, { status: 200 });
        }

        // 5. Return success response with updated profile
        return NextResponse.json({ message: 'Onboarding data saved successfully', profile: updatedProfile }, { status: 200 });

    } catch (error) {
        console.error('Unexpected error in onboarding POST handler:', error);
        return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
    }
} 