-- Photos and files on a card. The bytes live here, in the project's own
-- database, so a backup of the database is a backup of every photo, and dev
-- and production read the same rows. A photo arrives already made smaller
-- by the browser, with a small preview (`thumb`) for the card's cover.

create table if not exists item_files (
  id           bigserial primary key,
  item_id      bigint not null references items(id) on delete cascade,
  name         text not null,
  content_type text not null,
  size         integer not null,
  bytes        bytea not null,
  thumb        bytea,
  created_by   text,
  created_at   timestamptz not null default now()
);

create index if not exists item_files_item on item_files (item_id, id);
