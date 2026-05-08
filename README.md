# BonnText

Note-taking app for lecture slides. Upload a PDF, write markdown notes next to each slide.

## Features

- PDF viewer with text selection and highlighting
- Markdown editor with live preview per slide
- Session/course organization by semester
- Session start markers for shared materials
- Sync notes to GitHub Gist
- Print-friendly layout
- Everything stays in your browser (IndexedDB)

## Usage

Serve the folder with any HTTP server:

```
python3 -m http.server 8888
```

Open `http://localhost:8888`. No build step, no dependencies to install.

## Stack

Vanilla JS, no framework. Uses pdf.js, marked, and localforage from CDN.
