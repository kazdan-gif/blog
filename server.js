const express = require("express");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { Marked } = require("marked");
const { markedHighlight } = require("marked-highlight");
const hljs = require("highlight.js");

const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  })
);

function formatDate(d) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const app = express();
const PORT = process.env.PORT || 3000;
const POSTS_DIR = path.join(__dirname, "posts");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

function getPosts(filter) {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  let posts = files.map((file) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
    const { data } = matter(raw);
    return {
      slug: file.replace(/\.md$/, ""),
      title: data.title || file,
      date: formatDate(data.date),
      rawDate: data.date || "",
      excerpt: data.excerpt || "",
      category: data.category || "",
      tools: data.tools || [],
      impact: data.impact || "",
      featured: data.featured || false,
      project: data.project || "",
    };
  });
  posts.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
  if (filter) {
    posts = posts.filter(filter);
  }
  return posts;
}

function getAllTags() {
  const posts = getPosts();
  const tagSet = new Set();
  posts.forEach((p) => {
    if (p.category) tagSet.add(p.category);
    p.tools.forEach((t) => tagSet.add(t));
  });
  return Array.from(tagSet).sort();
}

app.get("/", (req, res) => {
  res.render("index", { posts: getPosts(), page: "home", tags: getAllTags() });
});

app.get("/case-studies", (req, res) => res.redirect(301, "/articles"));

app.get("/articles", (req, res) => {
  const posts = getPosts((p) => p.category && p.category !== "");
  res.render("index", { posts, page: "articles", tags: getAllTags() });
});

app.get("/post/:slug", (req, res) => {
  const filePath = path.join(POSTS_DIR, `${req.params.slug}.md`);
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const wordCount = content.split(/\s+/).length;
  const readingTime = Math.max(1, Math.round(wordCount / 200));
  res.render("post", {
    title: data.title || req.params.slug,
    date: formatDate(data.date),
    category: data.category || "",
    tools: data.tools || [],
    impact: data.impact || "",
    project: data.project || "",
    content: marked.parse(content),
    readingTime,
    page: "post",
  });
});


app.get("/about", (req, res) => {
  res.render("about", { page: "about" });
});

app.listen(PORT, () => console.log(`Blog running at http://localhost:${PORT}`));
