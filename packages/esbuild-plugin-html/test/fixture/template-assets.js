/* eslint-env browser */
import('./deps/c')
  .then(({ C }) => {
    return C();
  })
  .then(output => {
    console.log(output);
  })
  .catch(() => {
    console.error('whoops');
  });
