import { useEffect, useState } from "react";
import { api } from "../api";
import { parseBoard, type Board } from "./model";
import { BoardView } from "./Stage";

export function BoardThumb({ date, dataDir, version, onOpen }: { date: string; dataDir: string; version: string; onOpen: () => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  useEffect(() => {
    api
      .board(date)
      .then((b) => setBoard(b ? parseBoard(b) : null))
      .catch(() => setBoard(null));
  }, [date, version]);
  if (!board) return null;
  return (
    <div className="thumb" title="Открыть доску">
      <BoardView board={board} date={date} dataDir={dataDir} fit="width" onClick={onOpen} />
    </div>
  );
}
