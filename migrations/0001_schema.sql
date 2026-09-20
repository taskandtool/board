-- The board's schema. Every statement is safe to re-run: the service applies
-- this file once (board_migrations records it) but a machine replacement or a
-- hand run must never break on a table that already exists. Tables are
-- unqualified: on Task & Tool the app's own role puts its schema first on the
-- search_path, so they land there and nowhere else.

create table if not exists boards (
  id          bigserial primary key,
  key         text not null unique,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists statuses (
  id          bigserial primary key,
  board_id    bigint not null references boards(id) on delete cascade,
  key         text not null,
  label       text not null,
  position    integer not null,
  wip_limit   integer,
  is_done     boolean not null default false,
  archived_at timestamptz,
  unique (board_id, key)
);

create table if not exists items (
  id           bigserial primary key,
  board_id     bigint not null references boards(id) on delete cascade,
  status_id    bigint not null references statuses(id),
  title        text not null,
  notes        text not null default '',
  position     integer not null default 0,
  assignee     text,
  due_on       date,
  priority     smallint not null default 0,
  tags         text[] not null default '{}',
  checklist    jsonb not null default '[]',
  fields       jsonb not null default '{}',
  customer_ref text,
  is_sample    boolean not null default false,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  archived_at  timestamptz
);

create index if not exists items_column_order on items (board_id, status_id, position) where archived_at is null;
create index if not exists items_due on items (due_on) where archived_at is null;
create index if not exists items_assignee on items (assignee) where archived_at is null;

create table if not exists activity (
  id          bigserial primary key,
  item_id     bigint not null references items(id) on delete cascade,
  who         text,
  kind        text not null,
  body        text,
  from_status text,
  to_status   text,
  at          timestamptz not null default now()
);

create index if not exists activity_item on activity (item_id, at desc);

create table if not exists people (
  email        text primary key,
  name         text,
  last_seen_at timestamptz,
  active       boolean not null default true
);
