


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."charges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "date" "date" NOT NULL,
    "label" "text" NOT NULL,
    "category" "text",
    "montant_ht_cts" integer NOT NULL,
    "tva_rate" numeric(5,2) DEFAULT 20,
    "tva_cts" integer,
    "montant_ttc_cts" integer,
    "pennylane_id" "text",
    "pennylane_synced_at" timestamp with time zone,
    "receipt_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "charges_category_check" CHECK (("category" = ANY (ARRAY['carburant'::"text", 'assurance'::"text", 'entretien'::"text", 'salaire'::"text", 'logiciel'::"text", 'telecom'::"text", 'loyer'::"text", 'frais_bancaires'::"text", 'comptabilite'::"text", 'publicite'::"text", 'autre'::"text"])))
);


ALTER TABLE "public"."charges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "siret" "text",
    "tva_intra" "text",
    "address" "text",
    "city" "text",
    "postal_code" "text",
    "email" "text",
    "phone" "text",
    "type" "text",
    "pennylane_id" "text",
    "payment_terms" integer DEFAULT 30,
    "notes" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tariff_mode" "text" DEFAULT 'manuel'::"text" NOT NULL,
    "tariff_rate_cts" bigint,
    CONSTRAINT "clients_tariff_mode_chk" CHECK (("tariff_mode" = ANY (ARRAY['forfait'::"text", 'km'::"text", 'palette'::"text", 'manuel'::"text"]))),
    CONSTRAINT "clients_type_check" CHECK (("type" = ANY (ARRAY['medical'::"text", 'ecommerce'::"text", 'retail'::"text", 'particulier'::"text"])))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT 'MCA Logistics'::"text" NOT NULL,
    "siren" "text" DEFAULT '102898095'::"text" NOT NULL,
    "siret" "text" DEFAULT '10289809500017'::"text" NOT NULL,
    "tva_intra" "text" DEFAULT 'FR67102898095'::"text",
    "address" "text" DEFAULT '17 rue de la Chapelle, 67540 Ostwald'::"text",
    "capital_cts" integer DEFAULT 720000,
    "iban" "text" DEFAULT 'FR7616958000019515253956892'::"text",
    "bic" "text" DEFAULT 'QNTOFRP1XXX'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "depot_lat" double precision,
    "depot_lng" double precision
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "driver_id" "uuid",
    "date" "date" NOT NULL,
    "type" "text",
    "description" "text",
    "pickup_address" "text",
    "delivery_address" "text",
    "km" numeric(8,2),
    "weight_kg" numeric(8,2),
    "tva_rate" numeric(5,2) DEFAULT 20,
    "statut" "text" DEFAULT 'brouillon'::"text",
    "pennylane_invoice_id" "text",
    "pennylane_synced_at" timestamp with time zone,
    "facture_url" "text",
    "bon_livraison_url" "text",
    "lettre_voiture_url" "text",
    "sync_pending" boolean DEFAULT false,
    "sync_error" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "amount_ht_cts" bigint,
    "tva_cts" bigint,
    "amount_ttc_cts" bigint,
    "invoiced_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "delivery_lat" double precision,
    "delivery_lng" double precision,
    "tour_id" "uuid",
    "stop_order" integer,
    "arrival_time" time without time zone,
    "delivered_at" timestamp with time zone,
    CONSTRAINT "deliveries_statut_check" CHECK (("statut" = ANY (ARRAY['planifiee'::"text", 'en_cours'::"text", 'livree'::"text", 'facturee'::"text", 'payee'::"text", 'annulee'::"text"]))),
    CONSTRAINT "deliveries_type_check" CHECK (("type" = ANY (ARRAY['medical'::"text", 'ecommerce'::"text", 'retail'::"text", 'particulier'::"text"])))
);


ALTER TABLE "public"."deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fuel_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "driver_id" "uuid",
    "date" "date" NOT NULL,
    "liters" numeric(8,2) NOT NULL,
    "price_per_liter_cts" integer NOT NULL,
    "total_cts" integer NOT NULL,
    "fuel_type" "text",
    "mileage_km" integer,
    "station" "text",
    "tva_rate" numeric(5,2) DEFAULT 20,
    "tva_deductible_pct" numeric(5,2) DEFAULT 100,
    "tva_cts" integer GENERATED ALWAYS AS (("round"(((("total_cts")::numeric * "tva_rate") / (120)::numeric)))::integer) STORED,
    "receipt_url" "text",
    "supplier_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "fuel_logs_fuel_type_check" CHECK (("fuel_type" = ANY (ARRAY['diesel'::"text", 'essence'::"text", 'electric'::"text", 'hybrid'::"text", 'lpg'::"text"])))
);


ALTER TABLE "public"."fuel_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "vehicle_id" "uuid",
    "driver_id" "uuid",
    "date" "date" NOT NULL,
    "type" "text",
    "description" "text",
    "location" "text",
    "damage_cts" integer,
    "at_fault" boolean,
    "status" "text" DEFAULT 'ouvert'::"text",
    "police_report" boolean DEFAULT false,
    "insurance_ref" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "incidents_status_check" CHECK (("status" = ANY (ARRAY['ouvert'::"text", 'en_cours'::"text", 'clos'::"text"]))),
    CONSTRAINT "incidents_type_check" CHECK (("type" = ANY (ARRAY['accident'::"text", 'panne'::"text", 'vol'::"text", 'vandalisme'::"text", 'infraction'::"text", 'autre'::"text"])))
);


ALTER TABLE "public"."incidents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "delivery_id" "uuid",
    "client_id" "uuid",
    "date" "date" NOT NULL,
    "amount_cts" integer NOT NULL,
    "method" "text",
    "reference" "text",
    "qonto_tx_id" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payments_method_check" CHECK (("method" = ANY (ARRAY['virement'::"text", 'cb'::"text", 'especes'::"text", 'cheque'::"text", 'autre'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['president'::"text", 'dg'::"text", 'chauffeur'::"text", 'comptable'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qonto_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "qonto_id" "text" NOT NULL,
    "label" "text",
    "amount_cts" integer NOT NULL,
    "side" "text",
    "operation_type" "text",
    "settled_at" timestamp with time zone,
    "payment_id" "uuid",
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "qonto_transactions_side_check" CHECK (("side" = ANY (ARRAY['debit'::"text", 'credit'::"text"])))
);


ALTER TABLE "public"."qonto_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "siret" "text",
    "tva_intra" "text",
    "address" "text",
    "email" "text",
    "phone" "text",
    "category" "text",
    "pennylane_id" "text",
    "notes" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "suppliers_category_check" CHECK (("category" = ANY (ARRAY['carburant'::"text", 'assurance'::"text", 'entretien'::"text", 'soustraitance'::"text", 'logiciel'::"text", 'telecom'::"text", 'autre'::"text"])))
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "full_name" "text" NOT NULL,
    "role_label" "text",
    "idcc" "text" DEFAULT '16'::"text",
    "coefficient" integer,
    "contract_type" "text",
    "salary_gross_cts" integer,
    "start_date" "date",
    "end_date" "date",
    "phone" "text",
    "email" "text",
    "license_type" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "licence_b_expiry" "date",
    "medical_visit_expiry" "date",
    "role" "text",
    CONSTRAINT "team_members_contract_type_check" CHECK (("contract_type" = ANY (ARRAY['cdi'::"text", 'cdd'::"text", 'interim'::"text", 'associe'::"text"]))),
    CONSTRAINT "team_members_role_check" CHECK ((("role" IS NULL) OR ("role" = ANY (ARRAY['president'::"text", 'dg'::"text", 'chauffeur'::"text", 'comptable'::"text"]))))
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "vehicle_id" "uuid",
    "driver_id" "uuid",
    "status" "text" DEFAULT 'brouillon'::"text" NOT NULL,
    "depot_lat" double precision,
    "depot_lng" double precision,
    "total_km" numeric,
    "total_duration_min" integer,
    "geometry" "text",
    "optimized_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tours_status_check" CHECK (("status" = ANY (ARRAY['brouillon'::"text", 'optimisee'::"text", 'en_cours'::"text", 'terminee'::"text"])))
);


ALTER TABLE "public"."tours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."treasury_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"(),
    "balance_cts" integer NOT NULL,
    "authorized_balance_cts" integer,
    "iban" "text",
    "source" "text" DEFAULT 'qonto'::"text"
);


ALTER TABLE "public"."treasury_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "driver_id" "uuid",
    "date" "date" NOT NULL,
    "type" "text",
    "mileage_km" integer,
    "exterior_ok" boolean DEFAULT true,
    "lights_ok" boolean DEFAULT true,
    "tires_ok" boolean DEFAULT true,
    "brakes_ok" boolean DEFAULT true,
    "fluids_ok" boolean DEFAULT true,
    "docs_ok" boolean DEFAULT true,
    "cleanliness_ok" boolean DEFAULT true,
    "status" "text" DEFAULT 'ok'::"text",
    "defects" "text",
    "notes" "text",
    "signed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vehicle_inspections_status_check" CHECK (("status" = ANY (ARRAY['ok'::"text", 'defauts'::"text", 'refuse'::"text"]))),
    CONSTRAINT "vehicle_inspections_type_check" CHECK (("type" = ANY (ARRAY['pre_trajet'::"text", 'post_trajet'::"text", 'periodique'::"text"])))
);


ALTER TABLE "public"."vehicle_inspections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicle_maintenances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "type" "text",
    "description" "text",
    "mileage_km" integer,
    "cost_cts" integer,
    "supplier_id" "uuid",
    "next_due_date" "date",
    "next_due_km" integer,
    "receipt_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "vehicle_maintenances_type_check" CHECK (("type" = ANY (ARRAY['vidange'::"text", 'pneus'::"text", 'freins'::"text", 'controle_technique'::"text", 'revision'::"text", 'reparation'::"text", 'inspection'::"text", 'autre'::"text"])))
);


ALTER TABLE "public"."vehicle_maintenances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "plate" "text" NOT NULL,
    "brand" "text",
    "model" "text",
    "year" integer,
    "ptac_kg" integer,
    "critair" "text",
    "fuel_type" "text",
    "mileage_km" integer DEFAULT 0,
    "purchase_price_cts" integer,
    "purchase_date" "date",
    "status" "text" DEFAULT 'active'::"text",
    "storage_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ct_expiry" "date",
    "insurance_expiry" "date",
    "next_revision_date" "date",
    CONSTRAINT "vehicles_critair_check" CHECK (("critair" = ANY (ARRAY['0'::"text", '1'::"text", '2'::"text", '3'::"text", '4'::"text", '5'::"text", 'NC'::"text"]))),
    CONSTRAINT "vehicles_fuel_type_check" CHECK (("fuel_type" = ANY (ARRAY['diesel'::"text", 'essence'::"text", 'electric'::"text", 'hybrid'::"text", 'lpg'::"text"]))),
    CONSTRAINT "vehicles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'maintenance'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "break_minutes" integer DEFAULT 0,
    "total_minutes" integer GENERATED ALWAYS AS ((((EXTRACT(epoch FROM ("end_time" - "start_time")))::integer / 60) - "break_minutes")) STORED,
    "delivery_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."work_hours" OWNER TO "postgres";


ALTER TABLE ONLY "public"."charges"
    ADD CONSTRAINT "charges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fuel_logs"
    ADD CONSTRAINT "fuel_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qonto_transactions"
    ADD CONSTRAINT "qonto_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qonto_transactions"
    ADD CONSTRAINT "qonto_transactions_qonto_id_key" UNIQUE ("qonto_id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tours"
    ADD CONSTRAINT "tours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treasury_snapshots"
    ADD CONSTRAINT "treasury_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_inspections"
    ADD CONSTRAINT "vehicle_inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicle_maintenances"
    ADD CONSTRAINT "vehicle_maintenances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_plate_key" UNIQUE ("plate");



ALTER TABLE ONLY "public"."work_hours"
    ADD CONSTRAINT "work_hours_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_deliveries_tour" ON "public"."deliveries" USING "btree" ("tour_id");



CREATE INDEX "idx_tours_company_date" ON "public"."tours" USING "btree" ("company_id", "date");



CREATE INDEX "idx_tours_vehicle" ON "public"."tours" USING "btree" ("vehicle_id");



CREATE INDEX "incidents_company_date" ON "public"."incidents" USING "btree" ("company_id", "date" DESC);



CREATE INDEX "inspections_company_date" ON "public"."vehicle_inspections" USING "btree" ("company_id", "date" DESC);



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."charges" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."deliveries" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."fuel_logs" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."team_members" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."tours" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."vehicle_maintenances" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



ALTER TABLE ONLY "public"."charges"
    ADD CONSTRAINT "charges_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."charges"
    ADD CONSTRAINT "charges_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."team_members"("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."fuel_logs"
    ADD CONSTRAINT "fuel_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."fuel_logs"
    ADD CONSTRAINT "fuel_logs_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."team_members"("id");



ALTER TABLE ONLY "public"."fuel_logs"
    ADD CONSTRAINT "fuel_logs_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."fuel_logs"
    ADD CONSTRAINT "fuel_logs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qonto_transactions"
    ADD CONSTRAINT "qonto_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."qonto_transactions"
    ADD CONSTRAINT "qonto_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tours"
    ADD CONSTRAINT "tours_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tours"
    ADD CONSTRAINT "tours_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tours"
    ADD CONSTRAINT "tours_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."treasury_snapshots"
    ADD CONSTRAINT "treasury_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."vehicle_inspections"
    ADD CONSTRAINT "vehicle_inspections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_inspections"
    ADD CONSTRAINT "vehicle_inspections_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicle_inspections"
    ADD CONSTRAINT "vehicle_inspections_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicle_maintenances"
    ADD CONSTRAINT "vehicle_maintenances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."vehicle_maintenances"
    ADD CONSTRAINT "vehicle_maintenances_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."vehicle_maintenances"
    ADD CONSTRAINT "vehicle_maintenances_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."work_hours"
    ADD CONSTRAINT "work_hours_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."work_hours"
    ADD CONSTRAINT "work_hours_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id");



ALTER TABLE ONLY "public"."work_hours"
    ADD CONSTRAINT "work_hours_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."team_members"("id");



ALTER TABLE "public"."charges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "charges_delete_president" ON "public"."charges" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



CREATE POLICY "charges_insert_dg_president_comptable" ON "public"."charges" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text", 'comptable'::"text"]))));



CREATE POLICY "charges_select_own" ON "public"."charges" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "charges_update_dg_president_comptable" ON "public"."charges" FOR UPDATE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text", 'comptable'::"text"]))));



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_delete_president" ON "public"."clients" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'president'::"text")));



CREATE POLICY "clients_insert_dg_president" ON "public"."clients" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



CREATE POLICY "clients_select_own" ON "public"."clients" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "clients_update_dg_president" ON "public"."clients" FOR UPDATE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companies_select_own" ON "public"."companies" FOR SELECT USING (("id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "companies_update_president" ON "public"."companies" FOR UPDATE USING ((("id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'president'::"text")));



ALTER TABLE "public"."deliveries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deliveries_delete_president" ON "public"."deliveries" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'president'::"text")));



CREATE POLICY "deliveries_insert_all_roles" ON "public"."deliveries" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text", 'chauffeur'::"text"]))));



CREATE POLICY "deliveries_select_own" ON "public"."deliveries" FOR SELECT USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND ((( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text", 'comptable'::"text"])) OR ("driver_id" = ( SELECT "team_members"."id"
   FROM "public"."team_members"
  WHERE ("team_members"."profile_id" = "auth"."uid"())
 LIMIT 1)))));



CREATE POLICY "deliveries_update_dg_president" ON "public"."deliveries" FOR UPDATE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



ALTER TABLE "public"."fuel_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fuel_logs_delete_president" ON "public"."fuel_logs" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'president'::"text")));



CREATE POLICY "fuel_logs_insert_chauffeur" ON "public"."fuel_logs" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text", 'chauffeur'::"text"]))));



CREATE POLICY "fuel_logs_select_own" ON "public"."fuel_logs" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "fuel_logs_update_dg_president" ON "public"."fuel_logs" FOR UPDATE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



ALTER TABLE "public"."incidents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "incidents_delete_president" ON "public"."incidents" FOR DELETE USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "incidents_insert_own" ON "public"."incidents" FOR INSERT WITH CHECK (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "incidents_select_own" ON "public"."incidents" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "incidents_update_own" ON "public"."incidents" FOR UPDATE USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "inspections_delete_president" ON "public"."vehicle_inspections" FOR DELETE USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "inspections_insert_own" ON "public"."vehicle_inspections" FOR INSERT WITH CHECK (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "inspections_select_own" ON "public"."vehicle_inspections" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "inspections_update_own" ON "public"."vehicle_inspections" FOR UPDATE USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_delete_president" ON "public"."payments" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'president'::"text")));



CREATE POLICY "payments_insert_dg_president_comptable" ON "public"."payments" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text", 'comptable'::"text"]))));



CREATE POLICY "payments_select_own" ON "public"."payments" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "payments_update_dg_president" ON "public"."payments" FOR UPDATE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."qonto_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qonto_transactions_select_own" ON "public"."qonto_transactions" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_delete_president" ON "public"."suppliers" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'president'::"text")));



CREATE POLICY "suppliers_insert_dg_president" ON "public"."suppliers" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



CREATE POLICY "suppliers_select_own" ON "public"."suppliers" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "suppliers_update_dg_president" ON "public"."suppliers" FOR UPDATE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_members_delete_president" ON "public"."team_members" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'president'::"text")));



CREATE POLICY "team_members_insert_dg_president" ON "public"."team_members" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



CREATE POLICY "team_members_select_own" ON "public"."team_members" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "team_members_update_dg_president" ON "public"."team_members" FOR UPDATE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



ALTER TABLE "public"."tours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tours_delete_president" ON "public"."tours" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'president'::"text")));



CREATE POLICY "tours_insert_all_roles" ON "public"."tours" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text", 'chauffeur'::"text"]))));



CREATE POLICY "tours_select_own" ON "public"."tours" FOR SELECT USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND ((( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text", 'comptable'::"text"])) OR ("driver_id" = ( SELECT "team_members"."id"
   FROM "public"."team_members"
  WHERE ("team_members"."profile_id" = "auth"."uid"())
 LIMIT 1)))));



CREATE POLICY "tours_update_dg_president" ON "public"."tours" FOR UPDATE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



ALTER TABLE "public"."treasury_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "treasury_snapshots_select_own" ON "public"."treasury_snapshots" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."vehicle_inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicle_maintenances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicle_maintenances_delete_president" ON "public"."vehicle_maintenances" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'president'::"text")));



CREATE POLICY "vehicle_maintenances_insert_dg_president" ON "public"."vehicle_maintenances" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



CREATE POLICY "vehicle_maintenances_select_own" ON "public"."vehicle_maintenances" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "vehicle_maintenances_update_dg_president" ON "public"."vehicle_maintenances" FOR UPDATE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicles_delete_president" ON "public"."vehicles" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'president'::"text")));



CREATE POLICY "vehicles_insert_dg_president" ON "public"."vehicles" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



CREATE POLICY "vehicles_select_own" ON "public"."vehicles" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "vehicles_update_dg_president" ON "public"."vehicles" FOR UPDATE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));



ALTER TABLE "public"."work_hours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_hours_delete_president" ON "public"."work_hours" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'president'::"text")));



CREATE POLICY "work_hours_insert_own" ON "public"."work_hours" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text", 'chauffeur'::"text"]))));



CREATE POLICY "work_hours_select_own" ON "public"."work_hours" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "work_hours_update_dg_president" ON "public"."work_hours" FOR UPDATE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['president'::"text", 'dg'::"text"]))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";








































































































































































GRANT ALL ON TABLE "public"."charges" TO "anon";
GRANT ALL ON TABLE "public"."charges" TO "authenticated";
GRANT ALL ON TABLE "public"."charges" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."deliveries" TO "anon";
GRANT ALL ON TABLE "public"."deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."fuel_logs" TO "anon";
GRANT ALL ON TABLE "public"."fuel_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."fuel_logs" TO "service_role";



GRANT ALL ON TABLE "public"."incidents" TO "anon";
GRANT ALL ON TABLE "public"."incidents" TO "authenticated";
GRANT ALL ON TABLE "public"."incidents" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."qonto_transactions" TO "anon";
GRANT ALL ON TABLE "public"."qonto_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."qonto_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."tours" TO "anon";
GRANT ALL ON TABLE "public"."tours" TO "authenticated";
GRANT ALL ON TABLE "public"."tours" TO "service_role";



GRANT ALL ON TABLE "public"."treasury_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."treasury_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."treasury_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_inspections" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_inspections" TO "service_role";



GRANT ALL ON TABLE "public"."vehicle_maintenances" TO "anon";
GRANT ALL ON TABLE "public"."vehicle_maintenances" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicle_maintenances" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."work_hours" TO "anon";
GRANT ALL ON TABLE "public"."work_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."work_hours" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































