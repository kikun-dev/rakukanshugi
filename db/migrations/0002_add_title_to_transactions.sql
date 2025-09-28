alter table public.transactions add column if not exists title text not null default '';\nalter table public.transactions alter column title drop default;
