-- Migration : index sur les clés étrangères non couvertes
-- Objectif   : améliorer les perf RLS + jointures
-- Application : npx supabase db push (NE PAS appliquer manuellement)

-- charges
create index if not exists idx_charges_category_id    on public.charges (category_id);
create index if not exists idx_charges_supplier_id    on public.charges (supplier_id);

-- deliveries
create index if not exists idx_deliveries_client_id   on public.deliveries (client_id);
create index if not exists idx_deliveries_company_id  on public.deliveries (company_id);
create index if not exists idx_deliveries_driver_id   on public.deliveries (driver_id);
create index if not exists idx_deliveries_vehicle_id  on public.deliveries (vehicle_id);

-- delivery_templates
create index if not exists idx_delivery_templates_driver_id  on public.delivery_templates (driver_id);
create index if not exists idx_delivery_templates_vehicle_id on public.delivery_templates (vehicle_id);

-- documents
create index if not exists idx_documents_uploaded_by  on public.documents (uploaded_by);

-- fuel_logs
create index if not exists idx_fuel_logs_company_id   on public.fuel_logs (company_id);
create index if not exists idx_fuel_logs_driver_id    on public.fuel_logs (driver_id);
create index if not exists idx_fuel_logs_supplier_id  on public.fuel_logs (supplier_id);
create index if not exists idx_fuel_logs_vehicle_id   on public.fuel_logs (vehicle_id);

-- google_drive_oauth_states
create index if not exists idx_google_drive_oauth_states_company_id on public.google_drive_oauth_states (company_id);

-- incidents
create index if not exists idx_incidents_driver_id    on public.incidents (driver_id);
create index if not exists idx_incidents_vehicle_id   on public.incidents (vehicle_id);

-- payments
create index if not exists idx_payments_client_id     on public.payments (client_id);
create index if not exists idx_payments_company_id    on public.payments (company_id);
create index if not exists idx_payments_delivery_id   on public.payments (delivery_id);

-- profiles
create index if not exists idx_profiles_company_id    on public.profiles (company_id);

-- qonto_transactions
create index if not exists idx_qonto_transactions_company_id  on public.qonto_transactions (company_id);
create index if not exists idx_qonto_transactions_payment_id  on public.qonto_transactions (payment_id);

-- team_members
create index if not exists idx_team_members_company_id  on public.team_members (company_id);
create index if not exists idx_team_members_profile_id  on public.team_members (profile_id);

-- tours
create index if not exists idx_tours_driver_id        on public.tours (driver_id);

-- treasury_snapshots
create index if not exists idx_treasury_snapshots_company_id on public.treasury_snapshots (company_id);

-- vehicle_inspections
create index if not exists idx_vehicle_inspections_driver_id  on public.vehicle_inspections (driver_id);
create index if not exists idx_vehicle_inspections_vehicle_id on public.vehicle_inspections (vehicle_id);

-- vehicle_maintenances
create index if not exists idx_vehicle_maintenances_company_id  on public.vehicle_maintenances (company_id);
create index if not exists idx_vehicle_maintenances_supplier_id on public.vehicle_maintenances (supplier_id);
create index if not exists idx_vehicle_maintenances_vehicle_id  on public.vehicle_maintenances (vehicle_id);

-- vehicles
create index if not exists idx_vehicles_company_id    on public.vehicles (company_id);

-- work_hours
create index if not exists idx_work_hours_company_id  on public.work_hours (company_id);
create index if not exists idx_work_hours_delivery_id on public.work_hours (delivery_id);
create index if not exists idx_work_hours_member_id   on public.work_hours (member_id);

-- DOWN (ne pas exécuter directement — réservé au rollback)
-- drop index if exists idx_charges_category_id;
-- drop index if exists idx_charges_supplier_id;
-- drop index if exists idx_deliveries_client_id;
-- drop index if exists idx_deliveries_company_id;
-- drop index if exists idx_deliveries_driver_id;
-- drop index if exists idx_deliveries_vehicle_id;
-- drop index if exists idx_delivery_templates_driver_id;
-- drop index if exists idx_delivery_templates_vehicle_id;
-- drop index if exists idx_documents_uploaded_by;
-- drop index if exists idx_fuel_logs_company_id;
-- drop index if exists idx_fuel_logs_driver_id;
-- drop index if exists idx_fuel_logs_supplier_id;
-- drop index if exists idx_fuel_logs_vehicle_id;
-- drop index if exists idx_google_drive_oauth_states_company_id;
-- drop index if exists idx_incidents_driver_id;
-- drop index if exists idx_incidents_vehicle_id;
-- drop index if exists idx_payments_client_id;
-- drop index if exists idx_payments_company_id;
-- drop index if exists idx_payments_delivery_id;
-- drop index if exists idx_profiles_company_id;
-- drop index if exists idx_qonto_transactions_company_id;
-- drop index if exists idx_qonto_transactions_payment_id;
-- drop index if exists idx_team_members_company_id;
-- drop index if exists idx_team_members_profile_id;
-- drop index if exists idx_tours_driver_id;
-- drop index if exists idx_treasury_snapshots_company_id;
-- drop index if exists idx_vehicle_inspections_driver_id;
-- drop index if exists idx_vehicle_inspections_vehicle_id;
-- drop index if exists idx_vehicle_maintenances_company_id;
-- drop index if exists idx_vehicle_maintenances_supplier_id;
-- drop index if exists idx_vehicle_maintenances_vehicle_id;
-- drop index if exists idx_vehicles_company_id;
-- drop index if exists idx_work_hours_company_id;
-- drop index if exists idx_work_hours_delivery_id;
-- drop index if exists idx_work_hours_member_id;
