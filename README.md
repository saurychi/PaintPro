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

#Policies
public.users has RLS enabled and contains the main auth-related policies for profile access and updates. Current policies allow users to read their own row, allow admins to read all users, allow managers to read non-admin users, allow users to update their own row, and allow admins or managers to update staff and client rows.

Users can view all other users - Broad select policy that currently allows any authenticated user to read from public.users.

- users_select_own - Allows a user to read their own profile row.
- users_select_admin - Allows admins to read all user rows.
- users_select_manager - Allows managers to read non-admin user rows.
- users_can_update_own_row - Allows a user to update only their own row.
- users_update_admin_manager - Allows admins and managers to update staff and client rows.

public.invites also has RLS enabled, but it currently has no direct table policies. Invite-related access is instead controlled through security definer functions such as is_invited, has_pending_invite, handle_new_auth_user, and finalize_onboarding.

#Current Staff Flow
Admin invites a staff user, the invited auth account gets a public.users row through handle_new_auth_user(), and that row starts with status = 'pending'. On first login, the app sends the user through /auth/setup-profile, and finalize_onboarding is what changes the user to active and removes the pending invite.

#Setup
1. git clone git@github.com:saurychi/PaintPro.git
2. npm install
3. create .env.local in root dir and insert details
4. npm run dev

#SQL Structure

##Users
- id (uuid, PK, FK -> auth.users.id)
- role (text, NOT NULL, default 'client', CHECK in [client, staff, manager, admin])
- status (text, NOT NULL, default 'active', CHECK in [active, inactive, pending])
- username (text, NOT NULL, UNIQUE)
- phone (text, UNIQUE, nullable)
- email (text, UNIQUE, nullable)
- profile_image_url (text, nullable)
- specialty (jsonb, nullable)
- hourly_wage (numeric, NOT NULL, default 0, CHECK >= 0)
- signature_url (text, nullable)
- signature_updated_at (timestamptz, nullable)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##Projects
- project_id (uuid, PK, default gen_random_uuid())
- project_code (text, NOT NULL, UNIQUE)
- title (text, NOT NULL)
- description (text, nullable)
- site_address (text, nullable)
- scheduled_start_datetime (timestamptz, nullable)
- scheduled_end_datetime (timestamptz, nullable)
- status (text, NOT NULL, default 'draft', CHECK against the lifecycle list below)
- priority (text, NOT NULL, default 'normal', CHECK in [low, normal, high, urgent])
- estimated_budget (numeric, NOT NULL, default 0)
- estimated_cost (numeric, NOT NULL, default 0)
- estimated_profit (numeric, default `estimated_budget - estimated_cost`)
- materials_cost (numeric, NOT NULL, default 0)
- labor_cost (numeric, NOT NULL, default 0)
- markup_rate (numeric, NOT NULL, default 30)
- downpayment (numeric, NOT NULL, default 0)
- dimensions (jsonb, nullable)
- notes (text, nullable)
- client_id (uuid, NOT NULL, FK -> clients.client_id)
- created_by (uuid, NOT NULL, FK -> users.id, admin)
- cancelled_at (timestamptz, nullable)
- cancelled_by (uuid, nullable, FK -> users.id)
- cancelled_from_status (text, nullable)
- cancellation_earned_cost (numeric, nullable)
- cancellation_earned_revenue (numeric, nullable)
- cancellation_balance (numeric, nullable)
- cancellation_phase (text, nullable, CHECK in [review, payment, document, employee, conclude, done])
- cancellation_settled (numeric, default 0)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##Project Status Lifecycle
- main_task_pending - Admin is assigning the main tasks for the project.
- sub_task_pending - Admin is assigning sub tasks under the selected main tasks.
- materials_pending - Admin is assigning estimated materials.
- equipment_pending - Admin is assigning required equipment.
- schedule_pending - Admin is setting the project and sub task schedule.
- employee_assignment_pending - Admin is assigning employees to scheduled sub tasks.
- cost_estimation_pending - Admin is reviewing labor, materials, markup, and total estimates.
- overview_pending - Admin is reviewing the full generated project plan before quotation.
- quotation_pending - Quotation has been generated and is awaiting client signature.
- client_quotation_done - Client has signed the quotation; admin still needs to acknowledge and continue.
- downpayment_pending - Project is waiting for the required downpayment.
- ready_to_start - Downpayment is done and the project is ready to begin.
- in_progress - Project work has started.
- review_pending - Project work is done and awaiting review.
- invoice_pending - Invoice generation is pending.
- invoice_agreement_pending - Invoice has been sent and is awaiting client agreement/signature.
- invoice_signed - Client has signed the invoice; admin still needs to advance to payment.
- payment_pending - Final payment is pending.
- employee_management_pending - Employee performance, payroll, or management wrap-up is pending.
- conclude_job_pending - Final job conclusion step is pending.
- completed - Project is fully completed.
- cancelled - Project was cancelled.

##Clients
- client_id (uuid, PK, default gen_random_uuid())
- full_name (text, NOT NULL)
- phone (text, nullable)
- email (text, nullable)
- address (text, nullable)
- notes (text, nullable)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##Project_Task
- project_task_id (uuid, PK, default gen_random_uuid())
- project_id (uuid, NOT NULL, FK -> projects.project_id)
- main_task_id (uuid, NOT NULL, FK -> main_task.main_task_id)
- sort_order (integer, nullable)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##MainTask
- main_task_id (uuid, PK, default gen_random_uuid())
- name (text, NOT NULL, UNIQUE)
- is_active (boolean, NOT NULL, default true)
- default_sort_order (integer, NOT NULL, default 0)
- replaced_by_main_task_id (uuid, nullable, FK -> main_task.main_task_id)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##SubTask
- sub_task_id (uuid, PK, default gen_random_uuid())
- main_task_id (uuid, NOT NULL, FK -> main_task.main_task_id)
- description (text, nullable)
- is_active (boolean, NOT NULL, default true)
- replaced_by_sub_task_id (uuid, nullable, FK -> sub_task.sub_task_id)
- default_equipment (jsonb, nullable)
- default_materials (jsonb, nullable)
- default_sort_order (integer, NOT NULL, default 0)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##Project_SubTask
- project_sub_task_id (uuid, PK, default gen_random_uuid())
- project_task_id (uuid, NOT NULL, FK -> project_task.project_task_id)
- sub_task_id (uuid, NOT NULL, FK -> sub_task.sub_task_id)
- estimated_hours (numeric, NOT NULL, default 0)
- equipments_used (jsonb, NOT NULL, default '[]')
- status (text, NOT NULL, default 'pending')
- sort_order (integer, NOT NULL, default 0)
- notes (text, nullable)
- scheduled_start_datetime (timestamptz, nullable)
- scheduled_end_datetime (timestamptz, nullable)
- actual_start_datetime (timestamptz, nullable)
- actual_end_datetime (timestamptz, nullable)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##Tag
- tag_id (uuid, PK, default gen_random_uuid())
- parent_id (uuid, nullable, FK -> tag.tag_id)
- tag_name (text, NOT NULL, UNIQUE)
- color (text, nullable)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##Supplier
- supplier_id (uuid, PK, default gen_random_uuid())
- supplier_name (text, NOT NULL, UNIQUE)
- color (text, nullable)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##Materials
- material_id (uuid, PK, default gen_random_uuid())
- tag_id (uuid, nullable, FK -> tag.tag_id)
- supplier_id (uuid, nullable, FK -> supplier.supplier_id)
- location_id (uuid, nullable, FK -> location.location_id)
- name (text, NOT NULL)
- unit (text, NOT NULL)
- unit_cost (numeric, NOT NULL, default 0)
- reorder_point (integer, NOT NULL, default 0)
- needed_stock (integer, NOT NULL, default 0)
- current_in_stock (integer, NOT NULL, default 0)
- status (varchar, default 'Active')
- date_purchased (date, nullable)
- notes (text, nullable)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##Equipment
- equipment_id (uuid, PK, default gen_random_uuid())
- tag_id (uuid, nullable, FK -> tag.tag_id)
- supplier_id (uuid, nullable, FK -> supplier.supplier_id)
- location_id (uuid, nullable, FK -> location.location_id)
- name (text, NOT NULL)
- unit (varchar, nullable)
- status (varchar, NOT NULL, default 'Available')
- notes (text, nullable)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##project_task_material
- project_task_material_id (uuid, PK, default gen_random_uuid())
- project_task_id (uuid, NOT NULL, FK -> project_task.project_task_id)
- material_id (uuid, NOT NULL, FK -> materials.material_id)
- estimated_quantity (numeric, NOT NULL, default 0)
- estimated_cost (numeric, NOT NULL, default 0)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##staff_unavailability
- unavailability_id (uuid, PK, default gen_random_uuid())
- user_id (uuid, NOT NULL, FK -> users.id)
- start_datetime (timestamptz, NOT NULL)
- end_datetime (timestamptz, NOT NULL)
- reason (text, nullable)
- status (text, default 'pending')
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##conversations
- id (uuid, PK, default gen_random_uuid())
- project_id (uuid, nullable, FK -> projects.project_id; null for direct DM conversations)
- direct_pair_key (text, nullable; identifies a direct DM pair)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##conversation_participants
- conversation_id (uuid, NOT NULL, FK -> conversations.id, PK part)
- user_id (uuid, NOT NULL, FK -> users.id, PK part)
- joined_at (timestamptz, NOT NULL, default now())
- last_read_at (timestamptz, default now())

##messages
- id (uuid, PK, default gen_random_uuid())
- conversation_id (uuid, NOT NULL, FK -> conversations.id)
- sender_id (uuid, nullable, FK -> users.id)
- client_id (uuid, nullable, FK -> clients.client_id)
- content (text, NOT NULL)
- created_at (timestamptz, NOT NULL, default now())

##project_schedule
- project_schedule_id (uuid, PK, default gen_random_uuid())
- project_id (uuid, NOT NULL, FK -> projects.project_id)
- start_datetime (timestamptz, NOT NULL)
- end_datetime (timestamptz, NOT NULL)
- status (text, NOT NULL, default 'scheduled', CHECK in [scheduled, in_progress, completed, cancelled, rescheduled])
- notes (text, nullable)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##project_sub_task_staff
- project_sub_task_staff_id (uuid, PK, default gen_random_uuid())
- project_sub_task_id (uuid, NOT NULL, FK -> project_sub_task.project_sub_task_id)
- user_id (uuid, NOT NULL, FK -> users.id)
- role (text, nullable)
- assignment_status (text, default 'assigned')
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

##surface_scale_presets
- surface_key (text, PK)
- label (text, NOT NULL)
- unit (text, NOT NULL, CHECK in [m2, m, count])
- small_min (numeric, NOT NULL)
- small_max (numeric, NOT NULL)
- small_suggested (numeric, NOT NULL)
- small_label (text, NOT NULL)
- medium_min (numeric, NOT NULL)
- medium_max (numeric, NOT NULL)
- medium_suggested (numeric, NOT NULL)
- medium_label (text, NOT NULL)
- large_min (numeric, NOT NULL)
- large_max (numeric, NOT NULL)
- large_suggested (numeric, NOT NULL)
- large_label (text, NOT NULL)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##project_documents
- document_id (uuid, PK, default gen_random_uuid())
- project_id (uuid, NOT NULL, FK -> projects.project_id)
- client_id (uuid, nullable, FK -> clients.client_id)
- document_type (text, NOT NULL, CHECK in [quotation, invoice, cancellation_agreement, completion_acceptance, report])
- document_status (text, NOT NULL, default 'draft', CHECK in [draft, generated, sent, signed, approved, rejected, paid, void])
- storage_bucket (text, NOT NULL, default 'documents')
- storage_path (text, NOT NULL)
- file_name (text, nullable)
- file_mime_type (text, default 'application/pdf')
- file_size_bytes (bigint, nullable)
- signed_at (timestamptz, nullable)
- signed_name (text, nullable)
- signed_ip (text, nullable)
- client_signature_path (text, nullable)
- created_by (uuid, nullable, FK -> users.id)
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

##employee_performance
- employee_performance_id (uuid, PK, default gen_random_uuid())
- project_id (uuid, NOT NULL, FK -> projects.project_id)
- user_id (uuid, NOT NULL, FK -> users.id)
- time_efficiency (text, NOT NULL, CHECK in [great, good, bad, awful])
- work_quality (text, NOT NULL, CHECK in [great, good, bad, awful])
- teamwork (text, NOT NULL, CHECK in [great, good, bad, awful])
- work_ethic (text, NOT NULL, CHECK in [great, good, bad, awful])
- note (text, nullable)
- salary_amount (numeric, NOT NULL, default 0)
- total_estimated_hours (numeric, NOT NULL, default 0)
- hourly_wage (numeric, NOT NULL, default 0)
- reviewed_by (uuid, nullable, FK -> users.id)
- reviewed_at (timestamptz, default now())
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

##task_duration_rules
- duration_rule_id (uuid, PK, default gen_random_uuid())
- main_task_id (uuid, NOT NULL, FK -> main_task.main_task_id)
- sub_task_id (uuid, NOT NULL, UNIQUE, FK -> sub_task.sub_task_id)
- formula_template_id (uuid, nullable, FK -> formula_templates.formula_template_id)
- minimum_hours (numeric, NOT NULL, default 0.25)
- is_active (boolean, NOT NULL, default true)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##material_estimation_rules
- material_rule_id (uuid, PK, default gen_random_uuid())
- main_task_id (uuid, NOT NULL, FK -> main_task.main_task_id)
- sub_task_id (uuid, nullable, FK -> sub_task.sub_task_id)
- material_name (text, NOT NULL)
- formula_template_id (uuid, nullable, FK -> formula_templates.formula_template_id)
- minimum_quantity (numeric, NOT NULL, default 0)
- is_active (boolean, NOT NULL, default true)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##formula_templates
- formula_template_id (uuid, PK, default gen_random_uuid())
- formula_key (text, NOT NULL, UNIQUE)
- name (text, NOT NULL)
- description (text, nullable)
- formula_scope (text, NOT NULL, CHECK in [duration, material, labor, schedule])
- formula_expression (text, NOT NULL)
- is_active (boolean, NOT NULL, default true)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##formula_variables
- formula_variable_id (uuid, PK, default gen_random_uuid())
- formula_template_id (uuid, NOT NULL, FK -> formula_templates.formula_template_id)
- variable_key (text, NOT NULL)
- label (text, NOT NULL)
- description (text, nullable)
- data_type (text, NOT NULL, default 'number', CHECK = 'number')
- default_value (numeric, NOT NULL, default 0)
- unit (text, nullable)
- is_required (boolean, NOT NULL, default true)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##unavailable_days
- unavailable_day_id (uuid, PK, default gen_random_uuid())
- reason (text, NOT NULL)
- block_type (text, NOT NULL, CHECK in [company_blackout, manual_block, maintenance, holiday, other])
- blocked_start_datetime (timestamptz, NOT NULL)
- blocked_end_datetime (timestamptz, NOT NULL)
- is_active (boolean, NOT NULL, default true)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())

##invites
- id (uuid, PK, default gen_random_uuid())
- email (text, NOT NULL, UNIQUE)
- role (text, NOT NULL, CHECK in [client, staff, manager])
- status (text, NOT NULL, default 'pending', CHECK in [pending, used, revoked])
- created_at (timestamptz, NOT NULL, default now())
- used_at (timestamptz, nullable)

##location
- location_id (uuid, PK, default gen_random_uuid())
- name (varchar, NOT NULL)
- address (varchar, nullable)
- parent_tag_id (uuid, nullable, FK -> tag.tag_id)
- color (varchar, nullable)
- created_at (timestamptz, NOT NULL, default now())
- updated_at (timestamptz, NOT NULL, default now())
