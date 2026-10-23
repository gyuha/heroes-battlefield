import { defineConfig } from 'vite';

// GitHub Pages(https://gyuha.github.io/heroes-battlefield/)처럼 하위 경로에 배포해도 동작하도록 상대 경로로 빌드한다.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
});
