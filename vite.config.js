import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  // 'base: "./"' sorgt dafür, dass die Pfade in der index.html relativ sind. 
  // Das ist wichtig für die korrekte Anzeige auf GitHub Pages.
  base: './', 
  build: {
    // Legt den Ausgabeordner fest. Standard ist 'dist'.
    // Falls Sie GitHub Pages so eingestellt haben, dass es aus dem /docs-Ordner serviert, 
    // ändern Sie 'dist' hier einfach in 'docs'.
    outDir: 'docs',
    emptyOutDir: true, // Leert den Ordner vor jedem Build
  }
});