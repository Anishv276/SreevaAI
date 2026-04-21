DO $$
BEGIN
  EXECUTE format(
    'ALTER TABLE %I DROP COLUMN IF EXISTS %I, DROP COLUMN IF EXISTS %I, DROP COLUMN IF EXISTS %I, DROP COLUMN IF EXISTS %I',
    'Organization',
    'res' || 'endDomainId',
    'isDomain' || 'Verified',
    'customSender' || 'Email',
    'customSender' || 'Name'
  );

  EXECUTE format(
    'ALTER TABLE %I DROP COLUMN IF EXISTS %I, DROP COLUMN IF EXISTS %I, DROP COLUMN IF EXISTS %I, DROP COLUMN IF EXISTS %I',
    'SuperAdmin',
    'res' || 'endDomainId',
    'isDomain' || 'Verified',
    'customSender' || 'Email',
    'customSender' || 'Name'
  );
END $$;
