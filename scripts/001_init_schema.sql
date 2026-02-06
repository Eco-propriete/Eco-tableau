-- Create boards table
CREATE TABLE IF NOT EXISTS public.boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create canvas_elements table
CREATE TABLE IF NOT EXISTS public.canvas_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  element_type TEXT NOT NULL, -- 'rectangle', 'circle', 'text', 'pencil', etc.
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  width FLOAT NOT NULL,
  height FLOAT NOT NULL,
  rotation FLOAT DEFAULT 0,
  color TEXT DEFAULT '#000000',
  stroke_width FLOAT DEFAULT 1,
  fill_color TEXT,
  content TEXT, -- For text elements or pencil paths
  z_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_elements ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for boards
CREATE POLICY "Users can view their own boards" 
  ON public.boards FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create boards" 
  ON public.boards FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own boards" 
  ON public.boards FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own boards" 
  ON public.boards FOR DELETE 
  USING (auth.uid() = user_id);

-- Create RLS policies for canvas_elements
CREATE POLICY "Users can view elements in boards they own" 
  ON public.canvas_elements FOR SELECT 
  USING (board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid()));

CREATE POLICY "Users can create elements in their boards" 
  ON public.canvas_elements FOR INSERT 
  WITH CHECK (auth.uid() = user_id AND board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid()));

CREATE POLICY "Users can update elements in their boards" 
  ON public.canvas_elements FOR UPDATE 
  USING (auth.uid() = user_id AND board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete elements in their boards" 
  ON public.canvas_elements FOR DELETE 
  USING (auth.uid() = user_id AND board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid()));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS boards_user_id_idx ON public.boards(user_id);
CREATE INDEX IF NOT EXISTS canvas_elements_board_id_idx ON public.canvas_elements(board_id);
CREATE INDEX IF NOT EXISTS canvas_elements_user_id_idx ON public.canvas_elements(user_id);
