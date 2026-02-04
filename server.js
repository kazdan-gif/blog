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
      if (lang === 'mermaid') {
        return code; // Don't highlight mermaid - it will be rendered by mermaid.js
      }
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
const IMAGES_DIR = path.join(__dirname, "public", "images");

// Check if post image exists (supports jpg, png, webp)
function getPostImage(slug) {
  const extensions = ['jpg', 'jpeg', 'png', 'webp'];
  for (const ext of extensions) {
    if (fs.existsSync(path.join(IMAGES_DIR, `${slug}.${ext}`))) {
      return `/images/${slug}.${ext}`;
    }
  }
  return null;
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public"), { maxAge: '7d' }));

function getPosts(filter) {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  let posts = files.map((file) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
    const { data } = matter(raw);
    const slug = file.replace(/\.md$/, "");
    return {
      slug,
      title: data.title || file,
      date: formatDate(data.date),
      rawDate: data.date ? new Date(data.date).toISOString().split("T")[0] : "",
      excerpt: data.excerpt || "",
      category: data.category || "",
      tools: data.tools || [],
      tags: data.tags || [],
      impact: data.impact || "",
      featured: data.featured || false,
      project: data.project || "",
      image: getPostImage(slug),
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

const SITE_URL = "https://doshi.kazdan.net";

app.get("/", (req, res) => {
  res.render("index", { posts: getPosts(), page: "home", tags: getAllTags(), description: "AI לעסקים קטנים ובינוניים — פתרונות אוטומציה, כלים אמיתיים, תוצאות אמיתיות", path: "/", siteUrl: SITE_URL });
});

app.get("/case-studies", (req, res) => res.redirect(301, "/articles"));

app.get("/articles", (req, res) => {
  const posts = getPosts((p) => p.category && p.category !== "");
  res.render("index", { posts, page: "articles", tags: getAllTags(), description: "מאמרים — צלילות טכניות לפרויקטים של אוטומציה לעסקים", path: "/articles", siteUrl: SITE_URL });
});

app.get("/post/:slug", (req, res) => {
  const filePath = path.join(POSTS_DIR, `${req.params.slug}.md`);
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const wordCount = content.split(/\s+/).length;
  const readingTime = Math.max(1, Math.round(wordCount / 200));
  const excerpt = data.excerpt || "";
  const rawDate = data.date ? new Date(data.date).toISOString().split("T")[0] : "";
  const currentTools = data.tools || [];
  const currentCategory = data.category || "";
  const currentDate = data.date ? new Date(data.date) : new Date();
  const allPosts = getPosts().filter((p) => p.slug !== req.params.slug);
  const related = allPosts
    .map((p) => {
      const sharedTools = currentTools.filter((t) => p.tools.includes(t)).length;
      const catMatch = p.category && p.category === currentCategory ? 2 : 0;
      const daysDiff = Math.abs(currentDate - new Date(p.rawDate)) / 86400000;
      const recency = Math.max(0, 1 - daysDiff / 365);
      return { ...p, score: sharedTools * 3 + catMatch + recency };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const postImage = getPostImage(req.params.slug);
  res.render("post", {
    title: data.title || req.params.slug,
    slug: req.params.slug,
    date: formatDate(data.date),
    rawDate,
    excerpt,
    category: data.category || "",
    tools: currentTools,
    tags: data.tags || [],
    impact: data.impact || "",
    project: data.project || "",
    image: postImage,
    content: marked.parse(content),
    readingTime,
    page: "post",
    description: excerpt || data.title || "",
    path: `/post/${req.params.slug}`,
    siteUrl: SITE_URL,
    related,
  });
});


app.get("/about", (req, res) => {
  res.render("about", { page: "about", description: "אודות דוֹשי — AI לעסקים קטנים ובינוניים", path: "/about", siteUrl: SITE_URL });
});

app.get("/sitemap.xml", (req, res) => {
  const posts = getPosts();
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  const pages = ["/", "/articles", "/about"];
  pages.forEach((p) => {
    xml += `  <url><loc>${SITE_URL}${p}</loc></url>\n`;
  });
  posts.forEach((p) => {
    xml += `  <url><loc>${SITE_URL}/post/${p.slug}</loc>${p.rawDate ? `<lastmod>${new Date(p.rawDate).toISOString().split("T")[0]}</lastmod>` : ""}</url>\n`;
  });
  xml += `</urlset>`;
  res.set("Content-Type", "application/xml");
  res.send(xml);
});

app.get("/feed.xml", (req, res) => {
  const posts = getPosts();
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n  <title>דוֹשי | AI לעסקים</title>\n  <link>${SITE_URL}</link>\n  <description>AI לעסקים קטנים ובינוניים</description>\n  <language>he</language>\n  <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>\n`;
  posts.slice(0, 20).forEach((p) => {
    xml += `  <item>\n    <title>${p.title}</title>\n    <link>${SITE_URL}/post/${p.slug}</link>\n    <guid>${SITE_URL}/post/${p.slug}</guid>\n    ${p.rawDate ? `<pubDate>${new Date(p.rawDate).toUTCString()}</pubDate>` : ""}\n    ${p.excerpt ? `<description>${p.excerpt}</description>` : ""}\n  </item>\n`;
  });
  xml += `</channel>\n</rss>`;
  res.set("Content-Type", "application/rss+xml");
  res.send(xml);
});

app.use((req, res) => {
  res.status(404).render("404", { page: "404", description: "הדף לא נמצא", path: req.path, siteUrl: SITE_URL });
});

app.listen(PORT, () => console.log(`Blog running at http://localhost:${PORT}`));
