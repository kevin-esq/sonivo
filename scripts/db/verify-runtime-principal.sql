-- Run while connected as the application runtime principal, after migrations
-- and the reviewed runtime table grants have been applied.
-- This is read-only and fails closed for unsafe role attributes, role
-- memberships, unreviewed public tables, privileges outside the exact table
-- grant matrix, PUBLIC table grants, grant options, sequence access, ownership,
-- database privileges, unsupported public objects, or migration-history access.
DO $$
DECLARE
    principal record;
    principal_oid oid;
    history_table oid;
    database_owner oid;
BEGIN
    SELECT oid, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole,
           rolcreatedb, rolreplication
    INTO principal
    FROM pg_roles
    WHERE rolname = session_user;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Connected database principal is not present in pg_roles';
    END IF;

    principal_oid := principal.oid;

    IF session_user <> 'sonivo_app' OR current_user <> session_user THEN
        RAISE EXCEPTION 'Database login % with effective role % is not the expected direct runtime login sonivo_app', session_user, current_user;
    END IF;

    IF NOT principal.rolcanlogin
       OR principal.rolsuper
       OR principal.rolbypassrls
       OR principal.rolcreaterole
       OR principal.rolcreatedb
       OR principal.rolreplication THEN
        RAISE EXCEPTION 'Connected principal % has unsafe role attributes', current_user;
    END IF;

    IF has_schema_privilege(current_user, 'public', 'CREATE') THEN
        RAISE EXCEPTION 'Connected principal % can create objects in public', current_user;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_namespace AS schema
        WHERE schema.nspname = 'public'
          AND schema.nspowner = principal_oid
    ) THEN
        RAISE EXCEPTION 'Connected principal % owns schema public', current_user;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_class AS relation
        JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
        WHERE schema.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'S')
          AND relation.relowner = principal_oid
    ) THEN
        RAISE EXCEPTION 'Connected principal % owns application tables or sequences', current_user;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_roles AS role
        WHERE role.oid <> principal_oid
          AND pg_has_role(principal_oid, role.oid, 'MEMBER')
    ) THEN
        RAISE EXCEPTION 'Connected principal % has role memberships', current_user;
    END IF;

    IF NOT has_schema_privilege(current_user, 'public', 'USAGE') THEN
        RAISE EXCEPTION 'Connected principal % cannot use schema public', current_user;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_namespace AS schema
        WHERE schema.nspname NOT IN ('public', 'information_schema')
          AND left(schema.nspname, 3) <> 'pg_'
          AND (
              has_schema_privilege(principal_oid, schema.oid, 'USAGE')
              OR has_schema_privilege(principal_oid, schema.oid, 'CREATE')
              OR schema.nspowner = principal_oid
          )
    ) THEN
        RAISE EXCEPTION 'Connected principal % can use an unreviewed application schema', current_user;
    END IF;

    SELECT datdba INTO database_owner
    FROM pg_database
    WHERE datname = current_database();

    IF database_owner = principal_oid THEN
        RAISE EXCEPTION 'Connected principal % owns the current database', current_user;
    END IF;

    IF NOT has_database_privilege(principal_oid, current_database(), 'CONNECT')
       OR has_database_privilege(principal_oid, current_database(), 'CREATE')
       OR has_database_privilege(principal_oid, current_database(), 'TEMPORARY') THEN
        RAISE EXCEPTION 'Connected principal % has database privileges outside CONNECT', current_user;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_database AS database
        WHERE database.datallowconn
          AND database.datname <> current_database()
          AND has_database_privilege(principal_oid, database.oid, 'CONNECT')
    ) THEN
        RAISE EXCEPTION 'Connected principal % can connect to a database outside the application database', current_user;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_database AS database
        CROSS JOIN LATERAL aclexplode(
            COALESCE(database.datacl, acldefault('d', database.datdba))
        ) AS grant_entry
        WHERE database.datname = current_database()
          AND grant_entry.grantee = principal_oid
          AND (grant_entry.privilege_type <> 'CONNECT' OR grant_entry.is_grantable)
    ) THEN
        RAISE EXCEPTION 'Connected principal % has direct database grants outside non-grantable CONNECT', current_user;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_database AS database
        CROSS JOIN LATERAL aclexplode(
            COALESCE(database.datacl, acldefault('d', database.datdba))
        ) AS grant_entry
        WHERE database.datname = current_database()
          AND grant_entry.grantee = 0
          AND grant_entry.privilege_type IN ('CREATE', 'TEMPORARY')
    ) THEN
        RAISE EXCEPTION 'PUBLIC has CREATE or TEMPORARY privilege on the current database';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_class AS relation
        JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
        WHERE schema.nspname = 'public'
          AND relation.relkind NOT IN ('r', 'p', 'S', 'i', 'I')
    ) THEN
        RAISE EXCEPTION 'Public schema contains an unreviewed relation type';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_proc AS routine
        JOIN pg_namespace AS schema ON schema.oid = routine.pronamespace
        WHERE schema.nspname = 'public'
    ) THEN
        RAISE EXCEPTION 'Public schema contains unreviewed routines';
    END IF;

    IF EXISTS (
        WITH reviewed_tables(table_name) AS (
            VALUES
                ('Groups'),
                ('GroupSlugHistory'),
                ('GroupBranding'),
                ('GroupRoles'),
                ('Memberships'),
                ('Invitations'),
                ('ResourceGrants'),
                ('Songs'),
                ('Arrangements'),
                ('Resources'),
                ('Setlists'),
                ('SetlistItems'),
                ('Events'),
                ('EventSetlistItems'),
                ('Rsvps'),
                ('Tasks'),
                ('AccountAudit'),
                ('GroupAuditLog'),
                ('WebhookEvents'),
                ('Notifications'),
                ('AspNetRoles'),
                ('AspNetRoleClaims'),
                ('AspNetUsers'),
                ('AspNetUserClaims'),
                ('AspNetUserLogins'),
                ('AspNetUserRoles'),
                ('AspNetUserTokens'),
                ('DataProtectionKeys'),
                ('__EFMigrationsHistory')
        ),
        public_tables AS (
            SELECT relation.relname AS table_name
            FROM pg_class AS relation
            JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
            WHERE schema.nspname = 'public'
              AND relation.relkind IN ('r', 'p')
        ),
        inventory_difference AS (
            (SELECT table_name FROM public_tables
             EXCEPT
             SELECT table_name FROM reviewed_tables)
            UNION ALL
            (SELECT table_name FROM reviewed_tables
             EXCEPT
             SELECT table_name FROM public_tables)
        )
        SELECT 1 FROM inventory_difference
    ) THEN
        RAISE EXCEPTION 'Public table inventory differs from the reviewed runtime grant matrix';
    END IF;

    IF EXISTS (
        WITH reviewed_table_grants(table_name, privileges) AS (
            VALUES
                ('Groups', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('GroupSlugHistory', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('GroupBranding', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('GroupRoles', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('Memberships', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('Invitations', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('ResourceGrants', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('Songs', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('Arrangements', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('Resources', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('Setlists', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('SetlistItems', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('Events', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('EventSetlistItems', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('Rsvps', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('Tasks', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('AccountAudit', ARRAY['INSERT', 'SELECT']::text[]),
                ('GroupAuditLog', ARRAY['INSERT', 'SELECT']::text[]),
                ('WebhookEvents', ARRAY['INSERT', 'SELECT']::text[]),
                ('Notifications', ARRAY['INSERT', 'SELECT', 'UPDATE']::text[]),
                ('AspNetRoles', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('AspNetRoleClaims', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('AspNetUsers', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('AspNetUserClaims', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('AspNetUserLogins', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('AspNetUserRoles', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('AspNetUserTokens', ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]),
                ('DataProtectionKeys', ARRAY['DELETE', 'INSERT', 'SELECT']::text[]),
                ('__EFMigrationsHistory', ARRAY[]::text[])
        ),
        actual_table_grants AS (
            SELECT
                relation.relname AS table_name,
                ARRAY(
                    SELECT privilege
                    FROM unnest(ARRAY[
                        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
                        'TRUNCATE', 'REFERENCES', 'TRIGGER'
                    ]::text[]) AS available(privilege)
                    WHERE has_table_privilege(principal_oid, relation.oid, privilege)
                    ORDER BY privilege
                ) AS privileges
            FROM pg_class AS relation
            JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
            WHERE schema.nspname = 'public'
              AND relation.relkind IN ('r', 'p')
        )
        SELECT 1
        FROM reviewed_table_grants AS reviewed
        JOIN actual_table_grants AS actual USING (table_name)
        WHERE actual.privileges IS DISTINCT FROM reviewed.privileges
    ) THEN
        RAISE EXCEPTION 'Connected principal % has table privileges outside the reviewed grant matrix', current_user;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_class AS relation
        JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
        CROSS JOIN LATERAL aclexplode(
            COALESCE(relation.relacl, acldefault('r', relation.relowner))
        ) AS grant_entry
        WHERE schema.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
          AND grant_entry.grantee = principal_oid
          AND grant_entry.is_grantable
    ) THEN
        RAISE EXCEPTION 'Connected principal % has table grant options', current_user;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_class AS relation
        JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
        CROSS JOIN LATERAL aclexplode(
            COALESCE(relation.relacl, acldefault('r', relation.relowner))
        ) AS grant_entry
        WHERE schema.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
          AND grant_entry.grantee = 0
    ) THEN
        RAISE EXCEPTION 'Public tables grant privileges to PUBLIC';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_attribute AS attribute
        JOIN pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
        CROSS JOIN LATERAL aclexplode(attribute.attacl) AS grant_entry
        WHERE schema.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND grant_entry.grantee IN (0, principal_oid)
    ) THEN
        RAISE EXCEPTION 'Public tables contain unreviewed column-level grants to the runtime role or PUBLIC';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_class AS relation
        JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
        CROSS JOIN unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']::text[]) AS privilege(name)
        WHERE schema.nspname = 'public'
          AND relation.relkind = 'S'
          AND has_sequence_privilege(principal_oid, relation.oid, privilege.name)
    ) THEN
        RAISE EXCEPTION 'Connected principal % has privileges on public sequences', current_user;
    END IF;

    SELECT relation.oid
    INTO history_table
    FROM pg_class AS relation
    JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
    WHERE schema.nspname = 'public'
      AND relation.relname = '__EFMigrationsHistory'
      AND relation.relkind IN ('r', 'p');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Migration history table is missing; apply migrations first';
    END IF;

    IF has_table_privilege(current_user, history_table, 'SELECT')
       OR has_table_privilege(current_user, history_table, 'INSERT')
       OR has_table_privilege(current_user, history_table, 'UPDATE')
       OR has_table_privilege(current_user, history_table, 'DELETE')
       OR has_table_privilege(current_user, history_table, 'TRUNCATE') THEN
        RAISE EXCEPTION 'Connected principal % has privileges on migration history', current_user;
    END IF;

    RAISE NOTICE 'Runtime principal % passes role, database, schema object, table ACL, sequence, and migration-history checks', current_user;
END
$$;
