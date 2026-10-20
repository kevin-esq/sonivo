-- Local/CI bootstrap only. Production credentials are provisioned by the
-- deployment operator and must not use this development password.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sonivo_app') THEN
        CREATE ROLE sonivo_app LOGIN PASSWORD 'sonivo-app-dev-only';
    END IF;
END
$$;

ALTER ROLE sonivo_app
    LOGIN
    PASSWORD 'sonivo-app-dev-only'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS;

DO $$
DECLARE
    database_record record;
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO sonivo_app', current_database());
    -- PostgreSQL grants TEMPORARY on databases to PUBLIC by default. This
    -- database is dedicated to Sonivo local/CI use; remove that inherited
    -- capability so the runtime role can only connect to it.
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());

    -- PostgreSQL grants CONNECT to PUBLIC by default. Remove that inherited
    -- access from other databases in this dedicated local/CI cluster so the
    -- runtime principal can only open the database it serves. Database
    -- owners and explicitly granted operators keep their own access.
    FOR database_record IN
        SELECT datname
        FROM pg_database
        WHERE datallowconn
          AND datname <> current_database()
    LOOP
        EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', database_record.datname);
        EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM sonivo_app', database_record.datname);
    END LOOP;
END
$$;
GRANT USAGE ON SCHEMA public TO sonivo_app;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM sonivo_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM sonivo_app;

ALTER DEFAULT PRIVILEGES FOR ROLE sonivo IN SCHEMA public
    REVOKE ALL ON TABLES FROM sonivo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sonivo IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM sonivo_app;
