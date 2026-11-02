import { useMemo } from 'react';
import Cube from '~/components/Cube';
import Info from '~/components/Info';
import useStore from '~/store/useStore';
import { generatePosition } from '~/utils';
import { BOARD_LENGTH } from '~/constants';

interface BoardProps {
  start: boolean;
  index: number;
  count: number;
  locations: number[];
  answer: number[];
  setAnswer: React.Dispatch<React.SetStateAction<number[]>>;
}

const Board = ({ index, count, answer, setAnswer, locations, start }: BoardProps): JSX.Element => {
  const board = new Array(BOARD_LENGTH).fill(null).map((_, i) => i);
  const { warning } = useStore((state) => state);

  const margin: string[] = useMemo(() => {
    const positions = [];
    for (let i = 0; i < BOARD_LENGTH; i++) {
      const element = generatePosition();
      positions.push(element);
    }
    return positions;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- regenerate positions for each new round
  }, [count, warning]);

  return (
    <div position="relative" className="grid grid-cols-4" bg="sky-200">
      <Info />
      {board.map((_, idx: number) => {
        return (
          <div
            key={idx}
            w="md:130px 75px"
            h="md:130px 75px"
            flex={margin[idx] || '~ items-end justify-end'}>
            {locations.includes(idx) && (
              <Cube
                start={start}
                clickCube={() => setAnswer((prev) => [...prev, idx])}
                key={idx}
                active={locations[index] === idx || answer[answer.length - 1] === idx}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Board;
