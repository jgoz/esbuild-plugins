<script lang="ts">
  import type { Location, Message } from 'esbuild';

  import HighlightedLine from './HighlightedLine.svelte';

  interface Props {
    error: Message;
    openFileURL?: string;
  }

  const NULL_LOCATION: Location = {
    length: 0,
    line: 1,
    lineText: '???',
    column: 1,
    file: '(no file)',
    namespace: '',
    suggestion: '',
  };

  let { error, openFileURL }: Props = $props();

  const location = $derived(error.location ?? NULL_LOCATION);
  const text = $derived(error.text);
  const column = $derived(location.column);
  const line = $derived(location.line);
  const length = $derived(location.length);
  const lineText = $derived(location.lineText);
  const file = $derived(location.file);

  const lineNumberWidth = $derived(String(line).length);
  const lines = $derived(lineText.split(/\r?\n/g));
  const linesWithNumbers = $derived(
    lines.length > 1 ? lines.map(l => [0, l] as const) : [[line, lineText] as const],
  );

  function onClick() {
    if (!openFileURL) return;

    const url = new URL(openFileURL);
    url.searchParams.append('file', location.file);
    url.searchParams.append('line', String(location.line));
    url.searchParams.append('column', String(location.column));
    fetch(url.toString());
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="stack-entry" onclick={onClick} role="link" tabindex="0">
  <div class="file">
    <strong>{file}</strong>
  </div>
  <div class="error">{text}</div>
  <div class="lines">
    {#each linesWithNumbers as [l, lineText]}
      <div class="line">
        {#if l > 0}
          <span class="line-number">{String(l).padStart(lineNumberWidth, '  ')}</span>
        {/if}
        {#if l == line}
          <HighlightedLine text={lineText} {column} {length} />
        {:else}
          {lineText}
        {/if}
      </div>
    {/each}
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
