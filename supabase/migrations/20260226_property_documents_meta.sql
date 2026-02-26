alter table property_documents
  add column if not exists byte_size bigint,
  add column if not exists sha256 text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists original_content_type text,
  add column if not exists phash text;
