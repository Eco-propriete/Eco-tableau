import { WhiteboardApp } from "@/app/page";
import CanvasBoard from "@/components/canvas-board";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  console.log("Board IDsss:", id);
  return <WhiteboardApp params={{ id }} />;
}
