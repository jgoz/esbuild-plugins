<script lang="ts">
  import type { Location, Message } from 'esbuild';

  import HighlightedLine from './HighlightedLine.svelte';

  const NULL_LOCATION: Location = {
    length: 0,
    line: 1,
    lineText: '???',
    column: 1,
    file: '(no file)',
    namespace: '',
    suggestion: '',
  };

  export let error: Message;
  export let onClick: (entry: Location) => void;

  const location = error.location ?? NULL_LOCATION;
  const { detail, text } = error;
  const { column, line, length, lineText, file } = location;

  const lineNumberWidth = String(line).length;
</script>

<div class="stack-entry" on:click={() => onClick(location)}>
  <div class="file">
    <strong>{detail.fileRelative ?? file}</strong>
  </div>
  <div class="error">{text}</div>
  <div class="lines">
    <div class="line">
      <span class="line-number">{String(line).padStart(lineNumberWidth, '  ')}</span>
      <HighlightedLine text={lineText} {column} {length} />
    </div>
  </div>
</div>

<style>
  .stack-entry {
    cursor: pointer;
    margin-bottom: 2.5em;
  }
  .lines {
    color: rgb(187, 165, 165);
    font-size: 0.835em;
  }
  .lines:not(.no-fade) {
    -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1) 75%, rgba(0, 0, 0, 0));
    mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1) 75%, rgba(0, 0, 0, 0));
  }
  .line-number {
    padding-right: 1.5em;
    opacity: 0.5;
  }
  .stack-entry:first-child .line-hili strong {
    text-decoration: underline wavy #ff0040;
  }
  .file {
    font-weight: bold;
    margin-top: 2.5em;
    margin-bottom: 1.5em;
    color: rgb(202, 17, 63);
  }
  .file strong {
    text-decoration: underline;
  }
  .file:before {
    content: '@ ';
    opacity: 0.5;
    margin-left: -1.25em;
  }
</style>
