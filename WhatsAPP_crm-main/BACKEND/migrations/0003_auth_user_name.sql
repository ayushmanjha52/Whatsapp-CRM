alter table auth_users
  add column if not exists name text;

