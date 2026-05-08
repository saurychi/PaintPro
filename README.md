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

#SQL Structure

##Users
- id
- username
- email
- phone
- role
- specialty
- status
- profile_image_url
- hourly_wage
- signature_url
- signature_updated_at
- created_at
- updated_at

##Projects
- project_id
- project_code
- title
- description
- site_address
- scheduled_start_datetime
- scheduled_end_datetime
- status
- priority
- estimated_budget
- estimated_cost
- estimated_profit (generated: estimated_budget - estimated_cost)
- materials_cost
- labor_cost
- markup_rate
- downpayment
- dimensions (jsonb)
- notes
- created_at
- updated_at
- client_id (clients.client_id)
- created_by (users.id, admin)

##Project Status Lifecycle
- main_task_pending - Admin is assigning the main tasks for the project.
- sub_task_pending - Admin is assigning sub tasks under the selected main tasks.
- materials_pending - Admin is assigning estimated materials.
- equipment_pending - Admin is assigning required equipment.
- schedule_pending - Admin is setting the project and sub task schedule.
- employee_assignment_pending - Admin is assigning employees to scheduled sub tasks.
- cost_estimation_pending - Admin is reviewing labor, materials, markup, and total estimates.
- overview_pending - Admin is reviewing the full generated project plan before quotation.
- quotation_pending - Quotation has been generated and the admin is reviewing it before releasing to the client.
- grant_access_quotation - Admin has granted the client permission to sign the quotation (client can now sign).
- client_quotation_done - Client has signed the quotation; admin still needs to acknowledge and continue.
- downpayment_pending - Project is waiting for the required downpayment.
- ready_to_start - Downpayment is done and the project is ready to begin.
- in_progress - Project work has started.
- review_pending - Project work is done and awaiting review.
- invoice_pending - Invoice generation is pending.
- invoice_agreement_pending - Invoice has been sent and is awaiting client agreement/signature.
- payment_pending - Final payment is pending.
- employee_management_pending - Employee performance, payroll, or management wrap-up is pending.
- conclude_job_pending - Final job conclusion step is pending.
- completed - Project is fully completed.
- cancelled - Project was cancelled.

##Clients
- client_id
- full_name
- phone
- email
- address
- notes
- created_at
- updated_at

##Project_Task
- project_task_id
- project_id
- main_task_id

##MainTask
- main_task_id
- name
- is_active
- default_sort_order
- replaced_by_main_task_id
- created_at
- updated_at

##SubTask
- sub_task_id
- main_task_id
- description
- is_active
- replaced_by_sub_task_id
- default_equipment
- default_materials
- default_sort_order
- created_at
- updated_at

##Project_SubTask
- project_sub_task_id
- project_task_id
- sub_task_id
- estimated_hours
- equipments_used (jsonb)
- status
- sort_order
- notes
- scheduled_start_datetime
- scheduled_end_datetime
- actual_start_datetime
- actual_end_datetime
- created_at
- updated_at

##Tag
- tag_id
- parent_id (self tag)
- tag_name
- color
- created_at
- updated_at

##Supplier
- supplier_id
- supplier_name
- color
- created_at
- updated_at

##Materials
- material_id
- tag_id
- supplier_id
- location_id
- name
- unit
- unit_cost
- reorder_point
- needed_stock
- current_in_stock
- status
- date_purchased
- notes
- created_at
- updated_at

##Equipment
- equipment_id
- tag_id
- supplier_id
- location_id
- name
- unit
- status
- notes
- created_at
- updated_at

##project_task_material
- project_task_material_id
- project_task_id
- material_id
- estimated_quantity
- estimated_cost
- created_at
- updated_at

##staff_unavailability
- unavailability_id
- user_id
- start_datetime
- end_datetime
- reason
- created_at
- updated_at

##conversations
- id
- project_id (nullable; null for direct DM conversations)
- direct_pair_key (nullable; identifies a direct DM pair)
- created_at
- updated_at

##conversation_participants
- conversation_id (PK part)
- user_id (PK part)
- joined_at
- last_read_at

##messages
- id
- conversation_id
- sender_id (users.id, nullable)
- client_id (clients.client_id, nullable)
- content
- created_at

##project_schedule
- project_schedule_id
- project_id
- start_datetime
- end_datetime
- status
- notes
- created_at
- updated_at

##project_sub_task_staff
- project_sub_task_staff_id
- project_sub_task_id
- user_id
- role
- assignment_status
- created_at
- updated_at

##surface_scale_presets
- surface_key
- label
- unit
- small_min
- small_max
- small_suggested
- small_label
- medium_min
- medium_max
- medium_suggested
- medium_label
- large_min
- large_max
- large_suggested
- large_label
- created_at
- updated_at

##project_documents
- document_id
- project_id
- client_id
- document_type
- document_status
- storage_bucket
- storage_path
- file_name
- file_mime_type
- file_size_bytes
- signed_at
- signed_name
- signed_ip
- client_signature_path
- created_by
- created_at
- updated_at

##employee_performance
- employee_performance_id
- project_id
- user_id
- time_efficiency
- work_quality
- teamwork
- work_ethic
- note
- salary_amount
- total_estimated_hours
- hourly_wage
- reviewed_by
- reviewed_at
- created_at
- updated_at

##task_duration_rules
- duration_rule_id
- main_task_id
- sub_task_id
- formula_template_id
- minimum_hours
- is_active
- created_at
- updated_at

##material_estimation_rules
- material_rule_id
- main_task_id
- sub_task_id
- material_name
- formula_template_id
- minimum_quantity
- is_active
- created_at
- updated_at

##formula_templates
- formula_template_id
- formula_key
- name
- description
- formula_expression
- formula_scope
- is_active
- created_at
- updated_at

##formula_variables
- formula_variable_id
- formula_template_id
- variable_key
- label
- description
- data_type
- default_value
- unit
- is_required
- created_at
- updated_at

##unavailable_days
- unavailable_day_id
- blocked_date
- reason
- block_type
- notes
- is_active
- created_at
- updated_at

##invites
- id
- email (unique)
- role (client/staff/manager)
- status (pending/used/revoked)
- created_at
- used_at

##location
- location_id
- name
- address
- parent_tag_id (tag.tag_id)
- color
- created_at
- updated_at

##document_folders
- folder_id
- name
- is_archived
- created_at
- updated_at

##documents
- document_id
- folder_id (document_folders.folder_id, nullable)
- document_type (INV/PAY/RCP/QTE)
- title
- content
- content_type (default 'text/plain')
- original_filename
- created_by
- is_archived
- created_at
- updated_at
