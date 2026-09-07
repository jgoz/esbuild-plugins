<script lang="ts">
  interface Props {
    text: string;
    column: number;
    length: number;
  }

  let { text, column, length }: Props = $props();

  const parts = $derived([
    text.slice(0, column),
    text.slice(column, column + length),
    text.slice(column + length),
  ]);
</script>

<span class="line-text">
  {parts[0]}<strong>{parts[1]}</strong>{parts[2]}
</span>

<style>
  .line-text strong {
    background: #ffff78;
    color: #5f4545;
  }
</style>
