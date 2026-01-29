const express = require("express");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { marked } = require("marked");

function formatDate(d) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

const app = express();
const PORT = process.env.PORT || 3000;
const POSTS_DIR = path.join(__dirname, "posts");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

function getPosts() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  const posts = files.map((file) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
    const { data } = matter(raw);
    return {
      slug: file.replace(/\.md$/, ""),
      title: data.title || file,
      date: formatDate(data.date),
      excerpt: data.excerpt || "",
    };
  });
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  return posts;
}

app.get("/", (req, res) => {
  res.render("index", { posts: getPosts() });
});

app.get("/post/:slug", (req, res) => {
  const filePath = path.join(POSTS_DIR, `${req.params.slug}.md`);
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  res.render("post", {
    title: data.title || req.params.slug,
    date: formatDate(data.date),
    content: marked(content),
  });
});

app.listen(PORT, () => console.log(`Blog running at http://localhost:${PORT}`));
