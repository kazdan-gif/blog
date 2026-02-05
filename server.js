const express = require("express");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { Marked } = require("marked");
const { markedHighlight } = require("marked-highlight");
const hljs = require("highlight.js");
const multer = require("multer");
const XLSX = require("xlsx");

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
app.use(express.json());

// Multer configuration for file uploads (memory storage, 50MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

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
  const pages = ["/", "/articles", "/tools", "/tools/traffic-analyzer", "/about"];
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

// ============================================
// Traffic Source Analyzer Tool
// ============================================

// Parse UTM parameters from traffic_source field
function parseTrafficSource(trafficSource) {
  if (!trafficSource) {
    return { source: "(not set)", medium: "(not set)", campaign: "(not set)" };
  }
  const result = { source: "(not set)", medium: "(not set)", campaign: "(not set)" };
  const pairs = String(trafficSource).split("|");
  for (const pair of pairs) {
    if (pair.includes("=")) {
      const [key, value] = pair.split("=", 2);
      const k = key.trim().toLowerCase();
      const v = value ? value.trim() : "(not set)";
      if (k === "utmcsr") result.source = v || "(not set)";
      else if (k === "utmcmd") result.medium = v || "(not set)";
      else if (k === "utmccn") result.campaign = v || "(not set)";
    }
  }
  return result;
}

// Classify traffic into marketing channels
function classifyChannel(source, medium) {
  const s = String(source).toLowerCase();
  const m = String(medium).toLowerCase();
  if (m === "cpc") return "Paid Search";
  if (m === "organic") return "Organic Search";
  if (s === "(direct)" || m === "(none)") return "Direct";
  if (m === "email") return "Email Marketing";
  if (m === "referral") return "Referral";
  const social = ["facebook", "instagram", "twitter", "linkedin", "tiktok", "youtube", "pinterest"];
  if (social.some(x => s.includes(x))) return "Social";
  return "Other";
}

// Extract email campaign ID from flashyapp
function extractEmailCampaignId(trafficSource) {
  if (!trafficSource) return null;
  const match = String(trafficSource).match(/flashyapp_automation_(\d+)/);
  return match ? match[1] : null;
}

// Generate insights based on analysis
function generateInsights(summary, channels, sources) {
  const insights = [];
  const avgAov = summary.avg_order_value;

  if (channels.length > 0) {
    const top = channels[0];
    insights.push({
      type: "success",
      icon: "trophy",
      title: "ערוץ מוביל בהכנסות",
      text: `${top.name} הוא הערוץ המוביל שלך, מייצר ₪${top.revenue.toLocaleString("he-IL", { minimumFractionDigits: 2 })} (${top.revenue_pct.toFixed(1)}% מסך ההכנסות) מ-${top.orders.toLocaleString()} הזמנות.`
    });

    const highAov = channels.find(c => c.avg_order_value > avgAov * 1.2);
    if (highAov) {
      const pct = ((highAov.avg_order_value / avgAov) - 1) * 100;
      insights.push({
        type: "info",
        icon: "gem",
        title: "לקוחות בעלי ערך גבוה",
        text: `${highAov.name} מביא את הלקוחות עם הערך הגבוה ביותר - ממוצע הזמנה ₪${highAov.avg_order_value.toLocaleString("he-IL", { minimumFractionDigits: 2 })} (${pct.toFixed(0)}% מעל הממוצע). שקול להגדיל השקעה בערוץ זה.`
      });
    }

    const lowAov = channels.filter(c => c.avg_order_value < avgAov * 0.8 && c.orders >= 10);
    if (lowAov.length > 0) {
      const worst = lowAov[lowAov.length - 1];
      const pct = (1 - worst.avg_order_value / avgAov) * 100;
      insights.push({
        type: "warning",
        icon: "alert",
        title: "הזדמנות לשיפור",
        text: `${worst.name} מציג ממוצע הזמנה נמוך של ₪${worst.avg_order_value.toLocaleString("he-IL", { minimumFractionDigits: 2 })} (${pct.toFixed(0)}% מתחת לממוצע). שקול אסטרטגיות לשדרוג מכירות בערוץ זה.`
      });
    }
  }

  if (sources.length >= 3) {
    const top3 = sources.slice(0, 3).map(s => s.name);
    insights.push({
      type: "info",
      icon: "chart",
      title: "מקורות תנועה מובילים",
      text: `3 מקורות התנועה המובילים שלך הם: ${top3.join(", ")}. אלה מניעים את רוב ההכנסות שלך.`
    });
  }

  // Check for emerging sources
  const emerging = ["chatgpt", "claude", "perplexity", "bard"];
  const found = sources.find(s => emerging.some(e => s.name.toLowerCase().includes(e)));
  if (found) {
    insights.push({
      type: "info",
      icon: "rocket",
      title: "מקור תנועה מתפתח",
      text: `${found.name} הוא מקור תנועה מתפתח עם ${found.orders} הזמנות שמייצרות ₪${found.revenue.toLocaleString("he-IL", { minimumFractionDigits: 2 })}. חיפוש מבוסס AI צומח - עקוב אחר מגמה זו.`
    });
  }

  const email = channels.find(c => c.name === "Email Marketing");
  if (email && email.orders >= 10) {
    insights.push({
      type: "info",
      icon: "mail",
      title: "ביצועי שיווק באימייל",
      text: `שיווק באימייל ייצר ${email.orders.toLocaleString()} הזמנות עם ₪${email.revenue.toLocaleString("he-IL", { minimumFractionDigits: 2 })} הכנסות. ממוצע הזמנה: ₪${email.avg_order_value.toLocaleString("he-IL", { minimumFractionDigits: 2 })}.`
    });
  }

  return insights;
}

// Process uploaded file and return analysis
function processTrafficFile(buffer, filename) {
  let data = [];
  const ext = path.extname(filename).toLowerCase();
  const MAX_ROWS = 100000;

  try {
    if (ext === ".csv") {
      // CSV files work reliably
      const content = buffer.toString("utf-8");
      const workbook = XLSX.read(content, { type: "string", sheetRows: MAX_ROWS + 1 });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      data = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    } else if (ext === ".xlsx" || ext === ".xls") {
      // Excel files - some CashCow exports have formatting that can cause issues
      try {
        const workbook = XLSX.read(buffer, {
          type: "buffer",
          sheetRows: MAX_ROWS + 1,
          cellStyles: false,
          cellNF: false,
          cellDates: false,
          cellFormulas: false,
          bookVBA: false
        });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        data = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
      } catch (xlsxError) {
        if (xlsxError.message.includes("string longer than") || xlsxError.message.includes("memory")) {
          throw new Error("קובץ ה-Excel מכיל עיצוב שגורם לבעיות עיבוד. אנא המר את הקובץ לפורמט CSV (ב-Excel: קובץ > שמור בשם > CSV UTF-8) ונסה שוב.");
        }
        throw xlsxError;
      }
    } else {
      throw new Error("פורמט קובץ לא נתמך. אנא העלה קובץ CSV או Excel (.xlsx, .xls).");
    }
  } catch (parseError) {
    if (parseError.message.includes("string longer than") || parseError.message.includes("memory")) {
      throw new Error("קובץ ה-Excel מכיל עיצוב שגורם לבעיות עיבוד. אנא המר את הקובץ לפורמט CSV (ב-Excel: קובץ > שמור בשם > CSV UTF-8) ונסה שוב.");
    }
    throw new Error("שגיאה בקריאת הקובץ: " + parseError.message);
  }

  // Validate required columns
  const required = ["traffic_source", "order_total_price", "order_id"];
  const columns = data.length > 0 ? Object.keys(data[0]) : [];
  const missing = required.filter(c => !columns.includes(c));
  if (missing.length > 0) {
    throw new Error(`עמודות חסרות: ${missing.join(", ")}. עמודות זמינות: ${columns.join(", ")}`);
  }

  // Check if we hit the row limit
  let warning = null;
  if (data.length >= MAX_ROWS) {
    warning = `הקובץ מכיל יותר מ-${MAX_ROWS.toLocaleString()} שורות. הניתוח מוגבל ל-${MAX_ROWS.toLocaleString()} השורות הראשונות.`;
    data = data.slice(0, MAX_ROWS);
  }

  // Helper to get value from row, handling BOM in column names
  function getRowValue(row, key) {
    if (row[key] !== undefined) return row[key];
    // Try with BOM prefix
    const bomKey = '\ufeff' + key;
    if (row[bomKey] !== undefined) return row[bomKey];
    // Try finding key that ends with our key (handles any prefix)
    for (const k of Object.keys(row)) {
      if (k.endsWith(key)) return row[k];
    }
    return undefined;
  }

  // Helper to parse date (handles Excel serial dates and string dates)
  function parseOrderDate(dateValue) {
    if (!dateValue) return null;

    // If it's a number (Excel serial date)
    if (typeof dateValue === 'number') {
      // Excel serial date: days since 1900-01-01 (with Excel's leap year bug)
      const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
      const date = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    }

    // If it's a string, try DD/MM/YYYY format
    const dateStr = String(dateValue);
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      return `${year}-${month}`;
    }

    return null;
  }

  // Parse and enrich data (only keep necessary fields)
  const rows = data.map(row => {
    const parsed = parseTrafficSource(row.traffic_source);
    const orderDate = getRowValue(row, 'order_date');
    const orderMonth = parseOrderDate(orderDate);

    return {
      order_id: row.order_id,
      order_total_price: parseFloat(row.order_total_price) || 0,
      order_month: orderMonth,
      source: parsed.source,
      medium: parsed.medium,
      campaign: parsed.campaign,
      channel: classifyChannel(parsed.source, parsed.medium),
      email_campaign_id: extractEmailCampaignId(row.traffic_source)
    };
  });

  // Calculate summary
  const totalOrders = rows.length;
  const totalRevenue = rows.reduce((sum, r) => sum + r.order_total_price, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const summary = {
    total_orders: totalOrders,
    total_revenue: totalRevenue,
    avg_order_value: avgOrderValue
  };

  // Group by channel
  const channelMap = {};
  rows.forEach(r => {
    if (!channelMap[r.channel]) channelMap[r.channel] = { orders: 0, revenue: 0 };
    channelMap[r.channel].orders++;
    channelMap[r.channel].revenue += r.order_total_price;
  });
  const channels = Object.entries(channelMap)
    .map(([name, stats]) => ({
      name,
      orders: stats.orders,
      revenue: stats.revenue,
      avg_order_value: stats.orders > 0 ? stats.revenue / stats.orders : 0,
      order_pct: (stats.orders / totalOrders) * 100,
      revenue_pct: (stats.revenue / totalRevenue) * 100
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Group by source
  const sourceMap = {};
  rows.forEach(r => {
    if (!sourceMap[r.source]) sourceMap[r.source] = { orders: 0, revenue: 0 };
    sourceMap[r.source].orders++;
    sourceMap[r.source].revenue += r.order_total_price;
  });
  const sources = Object.entries(sourceMap)
    .map(([name, stats]) => ({
      name,
      orders: stats.orders,
      revenue: stats.revenue,
      avg_order_value: stats.orders > 0 ? stats.revenue / stats.orders : 0,
      order_pct: (stats.orders / totalOrders) * 100,
      revenue_pct: (stats.revenue / totalRevenue) * 100
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Group by medium
  const mediumMap = {};
  rows.forEach(r => {
    if (!mediumMap[r.medium]) mediumMap[r.medium] = { orders: 0, revenue: 0 };
    mediumMap[r.medium].orders++;
    mediumMap[r.medium].revenue += r.order_total_price;
  });
  const mediums = Object.entries(mediumMap)
    .map(([name, stats]) => ({
      name,
      orders: stats.orders,
      revenue: stats.revenue,
      avg_order_value: stats.orders > 0 ? stats.revenue / stats.orders : 0,
      order_pct: (stats.orders / totalOrders) * 100,
      revenue_pct: (stats.revenue / totalRevenue) * 100
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Source + Medium combinations
  const comboMap = {};
  rows.forEach(r => {
    const key = `${r.source}|||${r.medium}`;
    if (!comboMap[key]) comboMap[key] = { source: r.source, medium: r.medium, orders: 0, revenue: 0 };
    comboMap[key].orders++;
    comboMap[key].revenue += r.order_total_price;
  });
  const combinations = Object.values(comboMap)
    .map(c => ({
      ...c,
      avg_order_value: c.orders > 0 ? c.revenue / c.orders : 0,
      revenue_pct: (c.revenue / totalRevenue) * 100
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Email campaigns
  const emailRows = rows.filter(r => r.email_campaign_id);
  const emailMap = {};
  emailRows.forEach(r => {
    if (!emailMap[r.email_campaign_id]) emailMap[r.email_campaign_id] = { orders: 0, revenue: 0 };
    emailMap[r.email_campaign_id].orders++;
    emailMap[r.email_campaign_id].revenue += r.order_total_price;
  });
  const email_campaigns = Object.entries(emailMap)
    .map(([campaign_id, stats]) => ({
      campaign_id,
      orders: stats.orders,
      revenue: stats.revenue,
      avg_order_value: stats.orders > 0 ? stats.revenue / stats.orders : 0,
      revenue_pct: (stats.revenue / totalRevenue) * 100
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Monthly breakdown (if dates are available)
  const monthlyRows = rows.filter(r => r.order_month);
  let monthly = [];
  if (monthlyRows.length > 0) {
    const monthMap = {};
    monthlyRows.forEach(r => {
      if (!monthMap[r.order_month]) monthMap[r.order_month] = { orders: 0, revenue: 0 };
      monthMap[r.order_month].orders++;
      monthMap[r.order_month].revenue += r.order_total_price;
    });

    // Hebrew month names
    const hebrewMonths = {
      '01': 'ינואר', '02': 'פברואר', '03': 'מרץ', '04': 'אפריל',
      '05': 'מאי', '06': 'יוני', '07': 'יולי', '08': 'אוגוסט',
      '09': 'ספטמבר', '10': 'אוקטובר', '11': 'נובמבר', '12': 'דצמבר'
    };

    monthly = Object.entries(monthMap)
      .map(([month, stats]) => {
        const [year, m] = month.split('-');
        return {
          month,
          month_display: `${hebrewMonths[m]} ${year}`,
          orders: stats.orders,
          revenue: stats.revenue,
          avg_order_value: stats.orders > 0 ? stats.revenue / stats.orders : 0,
          revenue_pct: (stats.revenue / totalRevenue) * 100
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month)); // Sort chronologically
  }

  const insights = generateInsights(summary, channels, sources);

  return { summary, channels, sources, mediums, combinations, email_campaigns, monthly, insights, warning };
}

// Tools index page
app.get("/tools", (req, res) => {
  const tools = [
    {
      slug: "traffic-analyzer",
      title: "מנתח מקורות תנועה",
      description: "נתח את יצוא הזמנות CashCow שלך והבן אילו ערוצי שיווק מניבים הכי הרבה הכנסות",
      icon: "chart"
    }
  ];
  res.render("tools/index", {
    page: "tools",
    title: "כלים",
    description: "כלים חינמיים לניתוח ואופטימיזציה של העסק שלך",
    path: "/tools",
    siteUrl: SITE_URL,
    tools
  });
});

// Traffic Analyzer page
app.get("/tools/traffic-analyzer", (req, res) => {
  res.render("tools/traffic-analyzer", {
    page: "tools",
    title: "מנתח מקורות תנועה",
    description: "כלי לניתוח יצוא הזמנות CashCow והבנת ביצועי ערוצי השיווק שלך",
    path: "/tools/traffic-analyzer",
    siteUrl: SITE_URL
  });
});

// Traffic Analyzer API endpoint
app.post("/api/analyze-traffic", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "לא הועלה קובץ" });
  }
  try {
    const result = processTrafficFile(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// End Traffic Source Analyzer
// ============================================

app.use((req, res) => {
  res.status(404).render("404", { page: "404", description: "הדף לא נמצא", path: req.path, siteUrl: SITE_URL });
});

app.listen(PORT, () => console.log(`Blog running at http://localhost:${PORT}`));
