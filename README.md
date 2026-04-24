#About

PaintPro is a Field Service & Business Intelligence web app built for painting and decorating businesses. It streamlines job quotations, task scheduling, timekeeping, inventory, payroll, and reporting with role-based access and support for both desktop and mobile.

#Team Members:
- Francis Daniel V. Austria
- Lawas Denzel
- Trent Lee R. Guevara

#Authentication
PaintPro authentication uses Supabase Auth for login, sessions, and passwords, while public.users stores the app-side role, status, and profile data used for routing and authorization. The current staff onboarding flow is invite-based and uses pending -> active, with first-login users being sent through setup before they can access the app normally.

#Pages
- app/auth/signin/page.tsx - Entry page for email/password and Google sign-in, and the starting point of the auth flow.
- app/auth/signin/SigninClient.tsx - Handles client-side sign-in behavior, session checks, and profile-aware handoff into the post-auth flow.
- app/auth/post-auth/page.tsx - Main auth router after login that checks session, reads users.role and users.status, signs out inactive users, sends onboarding users to setup, and routes active users by role.
- app/auth/setup-profile/page.tsx - First-login setup page where invited users complete profile details, change password, and finish onboarding.
- app/auth/invite/page.tsx - Invite gate page that checks whether an email is recognized by the system before continuing into sign-in.
- app/auth/pending/page.tsx - Legacy waiting-room page that still exists in the codebase, although the current working first-login path goes through setup-profile first.

#Routes
- /auth/signin - Main sign-in route for email/password and Google login.
- /auth/post-auth - Central checkpoint after login that decides whether the user should be signed out, sent to setup, or routed to their dashboard.
- /auth/setup-profile - Route used for first-login onboarding and password change.
- /auth/invite - Route used to validate whether a user is invited or already recognized by the system.
- /auth/pending - Older pending route that remains in the codebase but is not the primary first-login path in the current flow.

#Database Functions
- custom_access_token_hook - Adds user_role into the JWT by reading public.users.role, which supports JWT-based row-level security checks.
handle_new_auth_user - Runs after a new auth user is created and inserts the matching public.users row when there is a matching pending invite, using the invite’s role and setting the user status to pending.
- has_pending_invite - Checks whether a given email still has a pending invite and is used to detect whether onboarding is still required.
- is_invited - Returns true if an email already exists in public.users or still exists in public.invites with status = 'pending'.
- finalize_onboarding - Completes first-login onboarding by updating the user profile, setting status = 'active', and consuming the pending invite.
- set_updated_at - Generic helper used to maintain updated_at timestamps.

#Trigger
- on_auth_user_created - An AFTER INSERT trigger on auth.users that runs handle_new_auth_user() to automatically create the application profile row for invited users.

#Policies
public.users has RLS enabled and contains the main auth-related policies for profile access and updates. Current policies allow users to read their own row, allow admins to read all users, allow managers to read non-admin users, allow users to update their own row, and allow admins or managers to update staff and client rows.

Users can view all other users - Broad select policy that currently allows any authenticated user to read from public.users.

- users_select_own - Allows a user to read their own profile row.
- users_select_admin - Allows admins to read all user rows.
- users_select_manager - Allows managers to read non-admin user rows.
- users_can_update_own_row - Allows a user to update only their own row.
- users_update_admin_manager - Allows admins and managers to update staff and client rows.

public.invites also has RLS enabled, but it currently has no direct table policies. Invite-related access is instead controlled through security definer functions such as is_invited, has_pending_invite, handle_new_auth_user, and finalize_onboarding.

#Security Definer Functions
finalize_onboarding, handle_new_auth_user, has_pending_invite, and is_invited are all SECURITY DEFINER, which is important because public.invites has RLS enabled and no direct policies. This means invite and onboarding logic is intentionally handled through controlled database functions instead of normal client-side table access.

#Current Staff Flow
Admin invites a staff user, the invited auth account gets a public.users row through handle_new_auth_user(), and that row starts with status = 'pending'. On first login, the app sends the user through /auth/setup-profile, and finalize_onboarding is what changes the user to active and removes the pending invite.

#Setup
1. git clone git@github.com:saurychi/PaintPro.git
2. npm install
3. create .env.local in root dir and insert details
4. npm run dev
