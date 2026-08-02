ALTER TABLE public.info_posts ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_tools text[] NOT NULL DEFAULT '{}'::text[];
UPDATE public.profiles SET allowed_tools = ARRAY[allowed_tool] WHERE allowed_tool IS NOT NULL AND cardinality(allowed_tools) = 0;