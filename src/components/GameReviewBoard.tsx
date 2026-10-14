
import { Chessboard } from "react-chessboard";

interface GameReviewBoardProps {
  positionFen: string;
}

function GameReviewBoard({ positionFen }: GameReviewBoardProps) {
  return (
    <div className="game-board-container">
      <Chessboard
        options={{
          id: "game-review-board",
          position: positionFen,
          boardOrientation: "white",
          allowDragging: false,
          allowDrawingArrows: false,
          showNotation: true,
          boardStyle: {
            width: "100%",
            maxWidth: "560px",
            margin: "0 auto",
            borderRadius: "8px",
            overflow: "hidden",
          },
          lightSquareStyle: {
            backgroundColor: "#dce8e2",
          },
          darkSquareStyle: {
            backgroundColor: "#557d70",
          },
        }}
      />
    </div>
  );
}

export default GameReviewBoard;
