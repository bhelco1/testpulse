import { Fragment } from 'react';

import { breakPieces, type BreakRule } from '../../lib/copy/breaks';

// Mono text with a soft break (<wbr>) wherever its rule allows one (design v21 item 8). The text
// itself is unchanged, so copying it or reading it aloud gives it as stored; where it is set on
// one line with an ellipsis the breaks do nothing.
export function Breaks({ text, rule }: { text: string; rule: BreakRule }) {
  return (
    <>
      {breakPieces(text, rule).map((piece, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {piece}
        </Fragment>
      ))}
    </>
  );
}
