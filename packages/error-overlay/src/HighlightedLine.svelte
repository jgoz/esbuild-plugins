<script lang="ts">
  export let text: string;
  export let column: number;
  export let length: number;

  const [before, highlight, after] = [
    text.slice(0, column),
    text.slice(column, column + length),
    text.slice(column + length),
  ];
</script>

<span class="line-text">
  {before}<strong>{highlight}</strong>{after}
</span>

<style>
  .line-text strong {
    background: #ffff78;
    color: #5f4545;
  }
</style>
