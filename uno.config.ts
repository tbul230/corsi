import { defineConfig, presetAttributify, presetWind3, transformerDirectives } from 'unocss';

export default defineConfig({
  presets: [presetWind3(), presetAttributify({
    prefix: 'un-',
  })],
  transformers: [transformerDirectives()],
  // UnoCSS 66 dropped display-* utilities; keep display="..." attributes working
  rules: [[/^display-(.+)$/, ([, d]) => ({ display: d })]],
  theme: {
    animation: {
      keyframes: {
        cubeturn: '{from {transform:rotate3d(0, 0, 0, 0)} to {transform:rotate3d(1, 3, 1, 360deg)}}'
      },
      durations: {
        cubeturn: '7s'
      }
    }
  },
});
