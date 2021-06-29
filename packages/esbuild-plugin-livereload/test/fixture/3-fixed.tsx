import * as React from 'react';
import { memo } from 'react';
import * as ReactDOM from 'react-dom';

function App() {
  return (
    <main>
      <h1>Page Three &mdash; Warnings</h1>
      <p>This is a test.</p>
    </main>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));
