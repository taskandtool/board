-- What one card on a board is called, and several: "Job" and "Jobs" on one
-- board, "Candidate" and "Candidates" on another. Empty means the words in
-- board.config.json (vocabulary.item).

alter table boards add column if not exists item_one text;
alter table boards add column if not exists item_many text;
