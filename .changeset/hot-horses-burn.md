---
'esbd': major
---

Remove built-in jsx-automatic handling in favor of esbuild's

This change sets the minimum version of esbuild to be `>= 0.14.51` and removes
the old SWC plugin, since esbuild now supports the automatic runtime natively.
