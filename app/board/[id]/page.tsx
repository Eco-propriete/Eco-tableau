import CanvasBoard from "@/components/canvas-board";

export default function BoardPage({ params }: { params: { id: string } }) {
  return <CanvasBoard params={params} />;
}
