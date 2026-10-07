import { useEffect, useState } from "react";
import { api } from "../api";
import { parseBoard, type Board } from "./model";
import { BoardView } from "./Stage";

export function useBoard(date: string, version: string) {
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    api
      .board(date)
      .then((b) => alive && setBoard(b ? parseBoard(b) : null))
      .catch(() => alive && setBoard(null));
    return () => {
      alive = false;
    };
  }, [date, version]);
  return board;
}

export function BoardThumb({
  board,
  date,
  dataDir,
  doneRefs,
  onOpen,
}: {
  board: Board;
  date: string;
  dataDir: string;
  doneRefs: Set<string>;
  onOpen: () => void;
}) {
  return (
    <div className="thumb" title="Открыть доску">
      <BoardView board={board} date={date} dataDir={dataDir} doneRefs={doneRefs} onClick={onOpen} />
    </div>
  );
}
