-- Habilita busca por similaridade (tolera erro de digitação) e remoção de
-- acento (ignora "joão" vs "joao"), usadas na busca de leads e conversas.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
