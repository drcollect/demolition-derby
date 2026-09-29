// Tidies the GitHub Pages build (npm run build:pages): the sign-in pages only make sense on the private
// Vercel deployment, and .nojekyll stops GitHub Pages from running the files through Jekyll.
import { rmSync, writeFileSync } from 'node:fs';

const out = new URL('../dist-pages/', import.meta.url);
for (const f of ['login.html', 'login-bg.jpg', 'privacy.html', 'terms.html']) rmSync(new URL(f, out), { force: true });
writeFileSync(new URL('.nojekyll', out), '');
console.log('dist-pages is ready for the gh-pages branch');
