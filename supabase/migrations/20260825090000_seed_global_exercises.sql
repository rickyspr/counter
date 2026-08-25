-- Global övningskatalog (user_id null = synlig för alla, se RLS-policy
-- "exercises_select_global_or_own"). Flyttad hit från seed.sql, som bara
-- körs vid `supabase db reset` (lokal utveckling) - `supabase db push`
-- kör aldrig seed.sql, så katalogen nådde aldrig ett riktigt projekt.
-- En migration körs exakt en gång per projekt, så ingen on conflict behövs.

insert into public.exercises (name, muscle_group) values
  ('Bänkpress', 'bröst'),
  ('Lutande bänkpress', 'bröst'),
  ('Hantelpress', 'bröst'),
  ('Cable crossover', 'bröst'),
  ('Marklyft', 'rygg'),
  ('Rodd med skivstång', 'rygg'),
  ('Sittande rodd', 'rygg'),
  ('Latsdrag', 'rygg'),
  ('Pull-ups', 'rygg'),
  ('Knäböj', 'ben'),
  ('Frontböj', 'ben'),
  ('Benpress', 'ben'),
  ('Utfallssteg', 'ben'),
  ('Rumänska marklyft', 'ben'),
  ('Vadpress', 'ben'),
  ('Militärpress', 'axlar'),
  ('Axelpress med hantlar', 'axlar'),
  ('Sidolyft', 'axlar'),
  ('Bakåtdelt', 'axlar'),
  ('Bicepscurl', 'armar'),
  ('Hammercurl', 'armar'),
  ('Triceps pushdown', 'armar'),
  ('Franska pressar', 'armar'),
  ('Plankan', 'core'),
  ('Situps', 'core'),
  ('Hanging leg raise', 'core');
