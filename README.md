# Blog

A personal blog powered by Express and markdown files.

## Local Development

```bash
npm install
npm start
```

Open http://localhost:3000

## Adding Posts

Create a `.md` file in `posts/` with frontmatter:

```markdown
---
title: My Post
date: 2026-01-29
excerpt: Short summary.
---

Post content here...
```

## Deploy to Heroku

```bash
heroku create
git push heroku main
```
