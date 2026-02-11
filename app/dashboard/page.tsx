"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { Plus, LogOut, Trash2 } from "lucide-react";

interface Board {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [newBoardName, setNewBoardName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      //if (!user) {
      //router.push("/auth/login");
      //return;
      //}

      //setUser(user);

      const { data: boardsData, error } = await supabase
        .from("boards")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && boardsData) {
        setBoards(boardsData);
      }

      setLoading(false);
    }

    loadData();
  }, [router]);

  async function createBoard() {
    //if (!newBoardName.trim() || !user) return;

    setCreating(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("boards")
      .insert({
        name: newBoardName,
      })
      .select();

    if (!error && data) {
      setBoards([data[0], ...boards]);
      setNewBoardName("");
      router.push(`/board/${data[0].id}`);
    }

    setCreating(false);
  }

  async function deleteBoard(boardId: string) {
    const supabase = createClient();
    await supabase.from("boards").delete().eq("id", boardId);
    setBoards(boards.filter((b) => b.id !== boardId));
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Tableau de bord
            </h1>
            <p className="text-sm text-muted-foreground">
              Bienvenue, {user?.email}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="gap-2 bg-transparent"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="flex gap-2">
            <Input
              placeholder="Nouveau tableau de bord"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && createBoard()}
            />
            <Button
              onClick={createBoard}
              disabled={creating || !newBoardName.trim()}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              Nouveau tableau de bord
            </Button>
          </div>

          {boards.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>
                Aucun tableau de bord pour le moment. Créez-en un pour commencer
                !
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {boards.map((board) => (
                <Card
                  key={board.id}
                  className="group relative overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                >
                  <Link href={`/board/${board.id}`}>
                    <div className="p-6 space-y-2 bg-card hover:bg-card/80 transition-colors">
                      <h3 className="font-semibold text-lg text-foreground truncate">
                        {board.name}
                      </h3>
                      {board.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {board.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(board.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>
                  <button
                    onClick={() => deleteBoard(board.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <div className="p-2 bg-destructive/10 hover:bg-destructive/20 rounded-md text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </div>
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
